import { type AxiosConfig, axiosInstance, getAxiosInstance, initializeAxios } from './configAxios';

export const install = (Vue: any, options: AxiosConfig) => {
  initializeAxios(options);
  if (typeof Vue.version === 'string' && Vue.version.startsWith('3.')) {
    Vue.config.globalProperties.$axios = getAxiosInstance();
    return;
  }
  Vue.prototype.$axios = getAxiosInstance();
};

export { type AxiosConfig, getAxiosInstance, initializeAxios, axiosInstance };
