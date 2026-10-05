import type {
  HttpClient as AxiosHttpClient,
  HttpRequestConfig as BaseHttpRequestConfig
} from '@mundoit-lib/plugin-vue-axios/http';
import { describe, expectTypeOf, it } from 'vitest';
import type { HttpClient, HttpRequestConfig } from './types';

// Test de tipos: Vitest lo valida con tsc (typecheck en vitest.config.ts), no se ejecuta en runtime.
describe('HttpClient compartido con plugin-vue-axios', () => {
  it('auth re-exporta el mismo HttpClient', () => {
    expectTypeOf<HttpClient>().toEqualTypeOf<AxiosHttpClient>();
    expectTypeOf<HttpClient>().toBeCallableWith({ url: '/me', _retry: true });
  });

  it('HttpRequestConfig de auth extiende al base con las marcas del reintento', () => {
    expectTypeOf<HttpRequestConfig>().toExtend<BaseHttpRequestConfig>();
    expectTypeOf<HttpRequestConfig['_retry']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<HttpRequestConfig['_skipAuth']>().toEqualTypeOf<boolean | undefined>();
  });
});
