import { type PropType, type SlotsType, defineComponent, h, onMounted, shallowRef } from 'vue';
import { isAppPath } from './OidcAuth';
import type { OidcCallbackOptions, OidcCallbackStatus, OidcUser, RouterLike } from './types';
import { useOidc } from './vue';

/** Mensaje para la persona a partir del error de `handleCallback` (los de `oidc-client-ts` vienen como `ErrorResponse`). */
export function describeCallbackError(error: unknown): string {
  const e = (error ?? {}) as { error?: unknown; message?: unknown };
  const code = typeof e.error === 'string' ? e.error : '';
  const message = typeof e.message === 'string' ? e.message : error == null ? '' : String(error);
  if (code === 'invalid_grant') return 'El código de ingreso venció o ya se usó. Volvé a ingresar.';
  if (code === 'invalid_client')
    return 'La aplicación no está registrada en el servidor (client_id). Avisale al administrador.';
  if (code === 'access_denied') return 'El ingreso fue cancelado o denegado.';
  if (/No matching state|No state in response/i.test(message)) {
    return 'La respuesta de ingreso no corresponde a este navegador. Volvé a ingresar.';
  }
  if (/no hay issuer/i.test(message)) return 'No hay empresa conectada.';
  return message || 'No se pudo completar el ingreso.';
}

/**
 * Procesa la vuelta del authorize en la ruta `/callback`: canjea el code, dispara `onLogin` (la app trae `/me` ahí)
 * y navega a `state.redirect` con `router.replace`. Sin router, usa `auth.navigate`.
 */
export function useOidcCallback<TUser = Record<string, unknown>>(
  options: OidcCallbackOptions<TUser> = {},
  router?: RouterLike
) {
  const oidc = useOidc<TUser>();
  const status = shallowRef<OidcCallbackStatus>('pending');
  const error = shallowRef<unknown>(null);
  const message = shallowRef('');
  const user = shallowRef<OidcUser | null>(null);

  const navigate = (target: string): void => {
    if (router) void router.replace(target);
    else oidc.auth.navigate(target);
  };

  const run = async (): Promise<void> => {
    status.value = 'pending';
    error.value = null;
    message.value = '';
    try {
      const result = await oidc.handleCallback(options.url);
      user.value = result.user;
      await options.onLogin?.(result.user, oidc);
      status.value = 'done';
      // El destino viene del `state` (lo que se pasó a login()) o de la app: sólo rutas de la app, nunca otro origen.
      const target = options.redirect ?? result.redirect;
      navigate(isAppPath(target) ? target : '/');
    } catch (e) {
      console.error('[oidc] callback', e);
      error.value = e;
      message.value = describeCallbackError(e);
      status.value = 'error';
      options.onError?.(e);
    }
  };

  /** Vuelve a empezar el login (el code no se puede reusar): al authorize con el mismo `redirect`. */
  const retry = (): Promise<never> => oidc.login({ redirect: options.redirect });

  if (options.immediate !== false) onMounted(() => void run());

  return { status, error, message, user, run, retry };
}

export interface OidcCallbackSlotProps {
  status: OidcCallbackStatus;
  error: unknown;
  message: string;
  retry: () => Promise<never>;
}

/**
 * Componente para la ruta `/callback`. Sin slot muestra "Ingresando…" o el error con un botón para volver a ingresar;
 * con el slot default la app dibuja lo suyo (Quasar, etc.) a partir de `{ status, error, message, retry }`.
 */
export const OidcCallback = defineComponent({
  name: 'OidcCallback',
  props: {
    router: { type: Object as PropType<RouterLike>, default: undefined },
    url: { type: String, default: undefined },
    redirect: { type: String, default: undefined },
    onLogin: { type: Function as PropType<OidcCallbackOptions['onLogin']>, default: undefined },
    pendingText: { type: String, default: 'Ingresando…' },
    retryText: { type: String, default: 'Volver a ingresar' }
  },
  emits: {
    error: (_error: unknown) => true
  },
  slots: Object as SlotsType<{ default?: (props: OidcCallbackSlotProps) => unknown }>,
  setup(props, { emit, slots }) {
    const { status, error, message, retry } = useOidcCallback(
      {
        url: props.url,
        redirect: props.redirect,
        onLogin: props.onLogin,
        onError: (e) => emit('error', e)
      },
      props.router
    );
    return () => {
      const slotProps: OidcCallbackSlotProps = {
        status: status.value,
        error: error.value,
        message: message.value,
        retry
      };
      if (slots.default) return slots.default(slotProps);
      if (status.value === 'error') {
        return h('div', { class: 'oidc-callback oidc-callback--error', role: 'alert' }, [
          h('p', message.value),
          h('button', { type: 'button', onClick: () => void retry() }, props.retryText)
        ]);
      }
      return h('div', { class: 'oidc-callback', 'aria-busy': 'true' }, props.pendingText);
    };
  }
});
