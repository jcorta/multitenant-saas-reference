// The app is a client-rendered SPA: authenticated pages depend on httpOnly cookies that only the
// browser holds, so there is nothing meaningful to render on the server.
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:4000/api',
    },
  },
  app: {
    head: {
      title: 'Restaurant Orders',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
});
