// Contrato HTTP compartido. Sin imports: se publica también como `@mundoit-lib/plugin-vue-axios/http`
// (sólo tipos) para que `plugin-vue-auth` e `histrix-component-vue` lo tomen sin arrastrar axios ni la
// augmentación de `$axios` en Vue.

/** Respuesta mínima que necesitan los consumidores de `HttpClient`. */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, any>;
}

/** Opciones de request que entiende cualquier `HttpClient`. */
export interface HttpRequestConfig {
  headers?: Record<string, any>;
  params?: any;
  timeout?: number;
  signal?: AbortSignal;
  [key: string]: any;
}

export interface HttpInterceptorManager<V> {
  use(onFulfilled?: ((value: V) => V | Promise<V>) | null, onRejected?: ((error: any) => any) | null): number;
  eject(id: number): void;
}

/**
 * Contrato HTTP que usan `plugin-vue-auth` y `histrix-component-vue`.
 * Una instancia de axios lo cumple sin adaptador.
 *
 * Además de `get/post/...` es invocable con un config completo (`http({ url, method, ... })`),
 * como axios: así `plugin-vue-auth` reintenta el request original (`error.config`) después del refresh.
 */
export interface HttpClient {
  (config: HttpRequestConfig): Promise<HttpResponse>;
  get<T = any>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  delete<T = any>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  put<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: HttpRequestConfig): Promise<HttpResponse<T>>;
  interceptors: {
    request: HttpInterceptorManager<any>;
    response: HttpInterceptorManager<HttpResponse>;
  };
}

/** Perfil de Histrix (`HTXPROFILES`). */
export interface HistrixPerfil {
  id: number;
  nombre: string;
}

/** Versiones del backend que atiende el `/me`. */
export interface HistrixVersion {
  histrix: string;
  api: string;
}

/** Base (tenant) sobre la que se hizo el login. */
export interface HistrixDatabase {
  /** Nombre de la base, el mismo que va en `/api/db/<id>`. */
  id: string;
  descripcion: string;
  /** Módulo base de la instalación (`erp-full`, `erp-base`…); `''` si no está configurado. */
  baseModule: string;
}

/** Datos de la empresa (opciones `CONFIG::` de la base). Cada campo viene `''` si no está cargado. */
export interface HistrixEmpresa {
  nombre: string;
  cuit: string;
  iibb: string;
  direccion: string;
  localidad: string;
  telefonos: string;
  mail: string;
  web: string;
}

/** Cómo se ve la app para esa base. */
export interface HistrixUi {
  /** URL absoluta del logo del cliente, o `null` si no hay archivo. */
  logo: string | null;
  /** URL absoluta de la imagen de fondo del login, o `null` si no hay archivo. */
  fondo: string | null;
  /** Módulos habilitados en la base (`clientes`, `stock`, `contabilidad`…). */
  modulos: string[];
}

/** Qué puede hacer el usuario en la app. */
export interface HistrixCapabilities {
  /** Ve el menú de sistema (engranaje): sólo administradores. */
  systemMenu: boolean;
  /** Modo editor: Configuración y Adminer dentro del menú de sistema. */
  editor: boolean;
}

/**
 * Usuario que devuelve `GET /me` de Histrix. Estos campos vienen siempre; según la instalación puede traer
 * más, por eso el índice abierto. Lo usan `plugin-vue-auth` y `plugin-vue-oidc` como usuario por defecto.
 *
 * Desde Histrix 2.0 el `/me` suma los datos de arranque de la SPA: si es administrador, sus perfiles, la base
 * y la empresa, cómo se ve (`ui`), los plugins habilitados y qué puede hacer (`capabilities`).
 */
export interface HistrixUser {
  id: number;
  user_id: number;
  username: string;
  email: string;
  /** Ids de rol, como strings (`["1"]`). */
  roles: string[];
  fullname: string;
  first_name: string;
  last_name: string;
  /** Nombres de los perfiles del usuario separados por `, ` (`"Administrador, Ventas"`). */
  occupation: string | null;
  companyName: string | null;
  phone: string | null;
  verified: boolean | number | string | null;
  name: string;
  emailVerified: boolean;
  /** Último acceso, `YYYY-MM-DD HH:mm:ss`. */
  last_log: string | null;
  /** Hoy viene siempre vacío (`{}`); se conserva la forma por compatibilidad. */
  socialNetworks: {
    linkedIn?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    [network: string]: string | undefined;
  };
  /** Cuenta de registro (`REG_CUENTA`) asociada, si el usuario entró por registro. */
  regcuenta_id: string | number | null;
  /** Administrador de la base (`HTXUSERS.admin`). */
  admin: boolean;
  /** Perfil principal (`HTXUSERS.Id_perfil`). `id` es `null` si el usuario no está en `HTXUSERS`. */
  perfil: { id: number | null; nombre: string };
  /** Todos los perfiles del usuario, el principal primero. */
  perfiles: HistrixPerfil[];
  /** URL absoluta del avatar (thumb 100x100), o `null` si no tiene foto. */
  avatar: string | null;
  /** Interno telefónico; `''` si no tiene. */
  interno: string;
  /** Tema elegido por el usuario; `''` si usa el default. */
  theme: string;
  /** Legajo de RRHH asociado, o `null`. */
  rhpersonal_id: number | null;
  /** Idioma de la base (`es`); `''` si no está configurado. */
  lang: string;
  version: HistrixVersion;
  database: HistrixDatabase;
  empresa: HistrixEmpresa;
  ui: HistrixUi;
  /** Nombres de los plugins habilitados en la base (`PLUGIN::<nombre>::enable`), ordenados. */
  plugins: string[];
  capabilities: HistrixCapabilities;
  [key: string]: unknown;
}
