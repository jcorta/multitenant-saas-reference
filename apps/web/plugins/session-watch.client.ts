import type { Session } from '~/types';

// Sends the user to the login page whenever an active session ends: explicit logout, or a refresh
// that failed because the session expired or was revoked.
export default defineNuxtPlugin(() => {
  const session = useState<Session | null>('session', () => null);
  watch(session, (current, previous) => {
    if (previous && !current) navigateTo('/login');
  });
});
