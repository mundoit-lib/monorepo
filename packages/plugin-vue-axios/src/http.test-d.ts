import type { AxiosInstance } from 'axios';
import { describe, expectTypeOf, it } from 'vitest';
import type { HistrixUser, HttpClient, HttpRequestConfig, HttpResponse } from './http';

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
});
