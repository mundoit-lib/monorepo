import type {
  HistrixUser as AxiosHistrixUser,
  HttpClient as AxiosHttpClient,
  HttpRequestConfig as BaseHttpRequestConfig
} from '@mundoit-lib/plugin-vue-axios/http';
import { describe, expectTypeOf, it } from 'vitest';
import type { AuthService } from './AuthService';
import type { HistrixUser, HttpClient, HttpRequestConfig } from './types';
import type { VueAuth } from './vue';

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

describe('usuario por defecto', () => {
  it('AuthService y useAuth usan HistrixUser de plugin-vue-axios/http', () => {
    expectTypeOf<ReturnType<AuthService['user']>>().toEqualTypeOf<HistrixUser | null>();
    expectTypeOf<ReturnType<VueAuth['fetch']>>().toEqualTypeOf<Promise<HistrixUser>>();
    expectTypeOf<HistrixUser>().toEqualTypeOf<AxiosHistrixUser>();
  });
});
