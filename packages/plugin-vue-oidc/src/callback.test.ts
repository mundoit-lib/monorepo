// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { OidcCallback, OidcPlugin, describeCallbackError, useOidcCallback } from './index';
import { fakeAuth, fakeOidcUser, fakeRouter } from './test-utils';

const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

function mount(component: Parameters<typeof createApp>[0], props: Record<string, unknown> = {}) {
  const auth = fakeAuth();
  const router = fakeRouter();
  const app = createApp({ render: () => h(component, props) });
  app.use(OidcPlugin, { auth, router, restore: false });
  const el = document.createElement('div');
  app.mount(el);
  return { auth, router, el, app };
}

describe('useOidcCallback', () => {
  it('canjea el code, dispara onLogin con el user y navega al redirect del state con replace', async () => {
    const onLogin = vi.fn(async () => {});
    const router = fakeRouter();
    let result!: ReturnType<typeof useOidcCallback>;
    const Comp = defineComponent({
      setup() {
        result = useOidcCallback({ onLogin, url: 'https://app/callback?code=1' }, router);
        return () => null;
      }
    });
    const { auth } = mount(Comp);
    await flush();

    expect(auth.handleCallback).toHaveBeenCalledWith('https://app/callback?code=1');
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'at-1' }), expect.anything());
    expect(router.replace).toHaveBeenCalledWith('/destino');
    expect(result.status.value).toBe('done');
    expect(auth.check()).toBe(true);
  });

  it('error en el canje: status error, mensaje legible, onError, sin navegar; retry vuelve al login', async () => {
    const onError = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let result!: ReturnType<typeof useOidcCallback>;
    const Comp = defineComponent({
      setup() {
        result = useOidcCallback({ onError });
        return () => null;
      }
    });
    const { auth, router } = mount(Comp);
    auth.handleCallback.mockRejectedValueOnce(Object.assign(new Error('x'), { error: 'invalid_grant' }));
    // onMounted ya corrió con el mock por defecto (sin router: navega con auth.navigate → router.push); se repite con run().
    await flush();
    expect(router.push).toHaveBeenCalledTimes(1);
    await result.run();

    expect(result.status.value).toBe('error');
    expect(result.message.value).toMatch(/venció o ya se usó/);
    expect(onError).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);

    void result.retry();
    expect(auth.login).toHaveBeenCalledWith({ redirect: undefined });
    err.mockRestore();
  });

  it('si onLogin rechaza, queda en error y no navega', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = fakeRouter();
    let result!: ReturnType<typeof useOidcCallback>;
    const Comp = defineComponent({
      setup() {
        result = useOidcCallback({ onLogin: () => Promise.reject(new Error('me falló')) }, router);
        return () => null;
      }
    });
    mount(Comp);
    await flush();
    expect(result.status.value).toBe('error');
    expect(result.message.value).toBe('me falló');
    expect(router.replace).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('immediate: false no corre en onMounted; redirect pisa el del state; sin router usa auth.navigate (el del plugin)', async () => {
    let result!: ReturnType<typeof useOidcCallback>;
    const Comp = defineComponent({
      setup() {
        result = useOidcCallback({ immediate: false, redirect: '/home' });
        return () => null;
      }
    });
    const { auth, router } = mount(Comp);
    await flush();
    expect(auth.handleCallback).not.toHaveBeenCalled();
    await result.run();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/home');
  });
});

describe('useOidcCallback: destino', () => {
  it('un redirect que no es ruta de la app (otro origen, esquema) cae a "/"', async () => {
    const router = fakeRouter();
    let result!: ReturnType<typeof useOidcCallback>;
    const Comp = defineComponent({
      setup() {
        result = useOidcCallback({ immediate: false }, router);
        return () => null;
      }
    });
    const { auth } = mount(Comp);
    for (const redirect of ['//evil.com', 'https://evil.com/x', 'javascript:alert(1)']) {
      auth.handleCallback.mockResolvedValueOnce({ user: fakeOidcUser(), redirect });
      await result.run();
      expect(router.replace).toHaveBeenLastCalledWith('/');
    }
    auth.handleCallback.mockResolvedValueOnce({ user: fakeOidcUser(), redirect: '/ok?x=1' });
    await result.run();
    expect(router.replace).toHaveBeenLastCalledWith('/ok?x=1');
  });
});

describe('OidcCallback', () => {
  it('sin slot muestra el texto de espera y navega con el router del prop', async () => {
    const router = fakeRouter();
    const { el } = mount(OidcCallback, { router });
    expect(el.textContent).toContain('Ingresando…');
    await flush();
    expect(router.replace).toHaveBeenCalledWith('/destino');
  });

  it('con error muestra el mensaje y un botón que vuelve al login; emite error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const auth = fakeAuth();
    auth.handleCallback.mockRejectedValueOnce(Object.assign(new Error('x'), { error: 'invalid_client' }));
    const app = createApp({ render: () => h(OidcCallback, { onError, redirect: '/vuelta' }) });
    app.use(OidcPlugin, { auth, restore: false });
    const el = document.createElement('div');
    app.mount(el);
    await flush();

    expect(el.querySelector('[role=alert]')?.textContent).toContain('no está registrada');
    expect(onError).toHaveBeenCalled();
    el.querySelector('button')!.click();
    expect(auth.login).toHaveBeenCalledWith({ redirect: '/vuelta' });
    err.mockRestore();
  });

  it('el slot default recibe status, message y retry', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const auth = fakeAuth();
    auth.handleCallback.mockRejectedValueOnce(new Error('No matching state found in storage'));
    const app = createApp({
      render: () =>
        h(OidcCallback, null, {
          default: ({ status, message }: { status: string; message: string }) => h('p', `${status}:${message}`)
        })
    });
    app.use(OidcPlugin, { auth, restore: false });
    const el = document.createElement('div');
    app.mount(el);
    expect(el.textContent).toBe('pending:');
    await flush();
    expect(el.textContent).toBe('error:La respuesta de ingreso no corresponde a este navegador. Volvé a ingresar.');
    err.mockRestore();
  });
});

describe('describeCallbackError', () => {
  it('traduce los errores conocidos y deja el mensaje del resto', () => {
    expect(describeCallbackError({ error: 'invalid_grant' })).toMatch(/venció/);
    expect(describeCallbackError({ error: 'access_denied' })).toMatch(/cancelado/);
    expect(describeCallbackError(new Error('OIDC: no hay issuer configurado'))).toBe('No hay empresa conectada.');
    expect(describeCallbackError(new Error('boom'))).toBe('boom');
    expect(describeCallbackError(undefined)).toBe('No se pudo completar el ingreso.');
  });
});
