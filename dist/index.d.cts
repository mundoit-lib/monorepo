import axios from 'axios';

interface AxiosConfig {
    baseURL: string;
    db: string;
    clientID: string;
    clientSecret: string;
    fixURL: string;
    updateToken?: (token: any) => void;
    onError?: () => void;
}
declare let axiosInstance: axios.AxiosInstance;
declare const getAxiosInstance: () => axios.AxiosInstance;
declare const initializeAxios: (config: AxiosConfig) => void;

declare const install: (Vue: any, options: AxiosConfig) => void;

export { type AxiosConfig, axiosInstance, getAxiosInstance, initializeAxios, install };
