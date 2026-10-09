import type { AxiosInstance } from 'axios';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  HistrixCapabilities,
  HistrixEmpresa,
  HistrixPerfil,
  HistrixUi,
  HistrixUser,
  HttpClient,
  HttpRequestConfig,
  HttpResponse
} from './http';

// Test de tipos: Vitest lo valida con tsc (typecheck en vitest.config.ts), no se ejecuta en runtime.
describe('HttpClient', () => {
  it('es invocable con un config completo, como axios', () => {
    expectTypeOf<HttpClient>().toBeCallableWith({ url: '/me', method: 'get', headers: {} });
    expectTypeOf<HttpClient>().returns.toEqualTypeOf<Promise<HttpResponse>>();
    expectTypeOf<HttpClient>().parameter(0).toEqualTypeOf<HttpRequestConfig>();
  });

  it('una instancia de axios lo cumple sin adaptador', () => {
    expectTypeOf<AxiosInstance>().toExtend<HttpClient>();
  });
});

describe('HistrixUser', () => {
  it('trae los campos de /me y acepta los extra', () => {
    expectTypeOf<HistrixUser['roles']>().toEqualTypeOf<string[]>();
    expectTypeOf<HistrixUser['emailVerified']>().toEqualTypeOf<boolean>();
    expectTypeOf<{ id: 1; extra: string }>().not.toExtend<HistrixUser>();
    expectTypeOf<HistrixUser['cualquierCampo']>().toEqualTypeOf<unknown>();
  });

  it('trae los datos de arranque de la SPA: perfiles, base, empresa, ui, plugins y capabilities', () => {
    expectTypeOf<HistrixUser['admin']>().toEqualTypeOf<boolean>();
    expectTypeOf<HistrixUser['perfil']>().toEqualTypeOf<{ id: number | null; nombre: string }>();
    expectTypeOf<HistrixUser['perfiles']>().toEqualTypeOf<HistrixPerfil[]>();
    expectTypeOf<HistrixUser['avatar']>().toEqualTypeOf<string | null>();
    expectTypeOf<HistrixUser['rhpersonal_id']>().toEqualTypeOf<number | null>();
    expectTypeOf<HistrixUser['database']['id']>().toEqualTypeOf<string>();
    expectTypeOf<HistrixUser['empresa']>().toEqualTypeOf<HistrixEmpresa>();
    expectTypeOf<HistrixEmpresa['cuit']>().toEqualTypeOf<string>();
    expectTypeOf<HistrixUser['ui']>().toEqualTypeOf<HistrixUi>();
    expectTypeOf<HistrixUi['modulos']>().toEqualTypeOf<string[]>();
    expectTypeOf<HistrixUser['plugins']>().toEqualTypeOf<string[]>();
    expectTypeOf<HistrixUser['capabilities']>().toEqualTypeOf<HistrixCapabilities>();
    expectTypeOf<HistrixCapabilities['systemMenu']>().toEqualTypeOf<boolean>();
  });
});
