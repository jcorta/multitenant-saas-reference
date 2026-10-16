export default defineNuxtRouteMiddleware(async (to) => {
  const { session, loadSession } = useApi();
  // The session is only known by asking the API; there is no token readable from script.
  const current = session.value ?? (await loadSession());

  if (to.path === '/login') return current ? navigateTo('/orders') : undefined;
  if (!current) return navigateTo('/login');
  if (to.path === '/') return navigateTo('/orders');
});
