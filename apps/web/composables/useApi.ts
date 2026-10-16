import type { Session } from '~/types';

// One refresh at a time: concurrent 401s share a single rotation, because a rotating refresh
// token can only be used once.
let refreshInFlight: Promise<boolean> | null = null;

export function useApi() {
  const base = useRuntimeConfig().public.apiBase;
  const session = useState<Session | null>('session', () => null);

  function send<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    return $fetch<T>(`${base}${path}`, {
      ...options,
      // Tokens live in httpOnly cookies; the browser attaches them, the script never sees them.
      credentials: 'include',
      headers: { ...(options?.headers as Record<string, string>), 'X-Requested-With': 'fetch' },
    }) as Promise<T>;
  }

  function refresh(): Promise<boolean> {
    refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  async function request<T>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    try {
      return await send<T>(path, options);
    } catch (err: any) {
      const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');
      if (err?.statusCode !== 401 || isAuthEndpoint) throw err;

      if (await refresh()) return send<T>(path, options);
      session.value = null;
      await navigateTo('/login');
      throw err;
    }
  }

  async function login(email: string, password: string) {
    await send('/auth/login', { method: 'POST', body: { email, password } });
    await loadSession();
  }

  async function logout() {
    await send('/auth/logout', { method: 'POST' }).catch(() => undefined);
    session.value = null;
    await navigateTo('/login');
  }

  async function loadSession(): Promise<Session | null> {
    try {
      session.value = await request<Session>('/auth/me');
    } catch {
      session.value = null;
    }
    return session.value;
  }

  return { request, login, logout, loadSession, session };
}
