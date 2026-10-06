import type { AxiosInstance } from 'axios';
import type { App } from 'vue';
import { axiosInstance, getAxiosInstance, initializeAxios, setBaseURL, setDatabase } from './configAxios';
import type { AxiosConfig } from './types';

export const install = (app: App, options: AxiosConfig) => {
  app.config.globalProperties.$axios = initializeAxios(options);
};

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
  }
}

export { axiosInstance, getAxiosInstance, initializeAxios, setBaseURL, setDatabase };
export type { HistrixUser, HttpClient, HttpInterceptorManager, HttpRequestConfig, HttpResponse } from './http';
export type { AxiosConfig, ErrorContext, ErrorHandler, ErrorOptions, LegacyRefreshConfig } from './types';
