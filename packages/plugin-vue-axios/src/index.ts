import { getAxiosInstance, initializeAxios, axiosInstance, type AxiosConfig } from './configAxios';

export const install = (Vue: any, options: AxiosConfig) => {
  initializeAxios(options);
  if (typeof Vue.version === 'string' && Vue.version.startsWith('3.')) {
    Vue.config.globalProperties.$axios = getAxiosInstance();
    return;
  }
  Vue.prototype.$axios = getAxiosInstance();
}

export { AxiosConfig, getAxiosInstance, initializeAxios, axiosInstance };
