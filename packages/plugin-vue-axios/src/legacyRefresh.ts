import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ErrorHandler, LegacyRefreshConfig } from './types';

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** Interceptor 401 → refresh de la 1.0.9, igual que antes: un reintento por request, tokens en localStorage. */
export const installLegacyRefresh = (instance: AxiosInstance, options: LegacyRefreshConfig, notify: ErrorHandler) => {
  instance.interceptors.response.use(undefined, async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as RetriableConfig;
    if (originalRequest._retry) {
      notify(error, { kind: 'refresh', status: 401, config: originalRequest });
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const requestToken = await updateToken(options.fixURL, options.clientID, options.clientSecret);
      originalRequest.headers.Authorization = `Bearer ${requestToken.access_token}`;
      instance.defaults.headers.common.Authorization = `Bearer ${requestToken.access_token}`;
      options.updateToken?.(requestToken);
      return instance(originalRequest);
    } catch (err) {
      console.error('Error al actualizar token', err);
      notify(err, { kind: 'refresh', status: 401, config: originalRequest });
      return Promise.reject(err);
    }
  });
};

const updateToken = async (fixURL: string, client: string, secret: string) => {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No hay token de refresco');

    const { data } = await axios.post(`${fixURL}/token`, {
      grant_type: 'refresh_token',
      client_id: client,
      client_secret: secret,
      refresh_token: refreshToken,
      notification_token: null
    });

    if (data.error || data.error_description) {
      throw new Error(data.error || data.error_description);
    }

    const expires = data.expires_in;
    const now = Date.now();
    const nuevaFechaExpiracion = now + expires * 1000;

    localStorage.setItem('accessToken', data.access_token);
    localStorage.setItem('refreshToken', data.refresh_token);
    localStorage.setItem('tokenExpireDate', nuevaFechaExpiracion.toString());

    return { ...data, nuevaFechaExpiracion };
  } catch (error) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpireDate');
    throw error;
  }
};
