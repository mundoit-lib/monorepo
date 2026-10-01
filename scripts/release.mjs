#!/usr/bin/env node
/**
 * Publica a npm los paquetes del workspace cuya versión todavía no existe en el registry.
 *
 * Flujo: el PR bumpea `version` en el package.json del paquete → al mergear a `main`,
 * el workflow `publish.yml` corre este script → se publica sólo lo que cambió de versión
 * y se crea un tag `<paquete>@<version>`.
 *
 * Autenticación: OIDC trusted publishing (el workflow tiene `id-token: write` y
 * `setup-node` con `registry-url`), igual que los repos originales. Si en algún momento
 * se prefiere token, alcanza con exportar NODE_AUTH_TOKEN en el workflow.
 *
 * Uso local: `pnpm release:dry` (no publica, sólo informa).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const root = process.cwd();
const packagesDir = join(root, 'packages');

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

function isPublished(name, version) {
  try {
    // Para una versión inexistente de un paquete existente, npm devuelve vacío y exit 0.
    // Para un paquete inexistente, falla con E404.
    return sh(`npm view ${name}@${version} version`) !== '';
  } catch {
    return false;
  }
}

const dirs = readdirSync(packagesDir)
  .map((d) => join(packagesDir, d))
  .filter((d) => existsSync(join(d, 'package.json')));

const published = [];
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.private) continue;
  const id = `${pkg.name}@${pkg.version}`;
  if (isPublished(pkg.name, pkg.version)) {
    console.log(`= ${id} ya está en npm, se omite`);
    continue;
  }
  const tag = `${pkg.name.replace(/^@mundoit-lib\//, '')}@${pkg.version}`;
  if (dryRun) {
    console.log(`+ ${id} se publicaría (tag ${tag})`);
    continue;
  }
  console.log(`+ publicando ${id}`);
  execSync('npm publish --access public', { cwd: dir, stdio: 'inherit' });
  sh(`git tag -a ${tag} -m "${id}"`);
  published.push(tag);
}

if (published.length) {
  sh('git push origin --tags');
  console.log(`\nPublicados: ${published.join(', ')}`);
} else {
  console.log('\nNada para publicar.');
}
