<script setup lang="ts">
const { login } = useApi();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo('/orders');
  } catch (err: any) {
    error.value =
      err?.statusCode === 401 ? 'Invalid email or password.' : 'Unable to sign in. Try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="narrow">
    <h1>Restaurant Orders</h1>
    <form class="card" @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required data-testid="email" />
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          data-testid="password"
        />
      </label>
      <p v-if="error" class="error" role="alert" data-testid="login-error">{{ error }}</p>
      <button type="submit" :disabled="busy" data-testid="login-submit">Sign in</button>
    </form>
  </main>
</template>
