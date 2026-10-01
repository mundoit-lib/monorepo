import axios from 'axios';

export interface AxiosConfig {
  baseURL: string;
  db: string;
  clientID: string;
  clientSecret: string;
  fixURL: string;
  updateToken?: (token: any) => void;
  onError?: () => void;
}

export let axiosInstance: axios.AxiosInstance;

export const getAxiosInstance = () => {
  if (!axiosInstance) {
    throw new Error('Axios instance is not initialized');
  }
  return axiosInstance;
};

export const initializeAxios = (config: AxiosConfig) => {
  validateAxiosConfig(config);

  axiosInstance = axios.create({
    baseURL: config.baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const { status } = error.response || {};
      if (status === 401) {
        const originalRequest = error.config;
        if (!originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const requestToken = await updateToken(config.fixURL, config.clientID, config.clientSecret);
            originalRequest.headers['Authorization'] = `Bearer ${requestToken.access_token}`;
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${requestToken.access_token}`;
            config.updateToken?.(requestToken);
            return axiosInstance(originalRequest);
          } catch (err) {
            console.error('Error al actualizar token', err);
            config.onError?.();
            return Promise.reject(err);
          }
        }
        config.onError?.();
        return Promise.reject(error);
      }
      config.onError?.();
      return Promise.reject(error);
    }
  );
};

const validateAxiosConfig = (config: Partial<AxiosConfig>) => {
  const requiredFields: (keyof AxiosConfig)[] = [
    'baseURL', 'db', 'clientID', 'clientSecret', 'fixURL',
  ];
  for (const field of requiredFields) {
    if (typeof config[field] !== 'string' || !config[field]) {
      throw new Error(`Invalid or missing config property: ${field}`);
    }
  }
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
      notification_token: null,
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
