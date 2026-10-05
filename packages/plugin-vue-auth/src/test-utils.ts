import type { AuthStorage, HttpClient } from './types';

export type Request = { url: string; method: string; data?: any; headers: Record<string, string>; [key: string]: any };
export type Handler = (request: Request) => unknown;

export function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

/** Cliente con la misma cadena de interceptores que axios: request → handler → response. */
export function createHttp(handler: Handler) {
  const requestInterceptors: Array<(config: any) => any> = [];
  const responseInterceptors: Array<[(r: any) => any, ((e: any) => any) | undefined]> = [];
  const requests: Request[] = [];

  const run = async (config: any): Promise<any> => {
    let request: Request = { ...config, headers: { ...config.headers } };
    for (const intercept of requestInterceptors) request = await intercept(request);
    requests.push({ ...request, headers: { ...request.headers } });

    let result: Promise<any>;
    try {
      result = Promise.resolve({ data: await handler(request) });
    } catch (error: any) {
      error.config = request;
      result = Promise.reject(error);
    }
    for (const [onFulfilled, onRejected] of responseInterceptors) result = result.then(onFulfilled, onRejected);
    return result;
  };

  const http = ((config: any) => run(config)) as HttpClient & { requests: Request[] };
  http.get = (url: string, config: any = {}) => run({ ...config, url, method: 'get' });
  http.delete = (url: string, config: any = {}) => run({ ...config, url, method: 'delete' });
  http.post = (url: string, data?: unknown, config: any = {}) => run({ ...config, url, method: 'post', data });
  http.put = (url: string, data?: unknown, config: any = {}) => run({ ...config, url, method: 'put', data });
  http.patch = (url: string, data?: unknown, config: any = {}) => run({ ...config, url, method: 'patch', data });
  const noEject = () => {
    throw new Error('eject no implementado en createHttp');
  };
  http.interceptors = {
    request: { use: (onFulfilled) => requestInterceptors.push(onFulfilled ?? ((c) => c)), eject: noEject },
    response: {
      use: (onFulfilled, onRejected) => responseInterceptors.push([onFulfilled ?? ((r) => r), onRejected ?? undefined]),
      eject: noEject
    }
  };
  http.requests = requests;
  return http;
}

export function memoryStorage(initial: Record<string, string> = {}): AuthStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    }
  };
}
