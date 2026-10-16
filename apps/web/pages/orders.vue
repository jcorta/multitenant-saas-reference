<script setup lang="ts">
import type { Order, OrderStatus, Page, Product } from '~/types';

const { request, logout, session } = useApi();

const PAGE_SIZE = 10;
const statuses: OrderStatus[] = ['pending', 'preparing', 'served', 'paid', 'cancelled'];

const orders = ref<Order[]>([]);
const total = ref(0);
const offset = ref(0);
const statusFilter = ref<OrderStatus | ''>('');
const products = ref<Product[]>([]);
const loadError = ref('');
const actionError = ref('');

const customerLabel = ref('');
const lines = ref<{ productId: string; quantity: number }[]>([{ productId: '', quantity: 1 }]);
const formError = ref('');
const submitting = ref(false);

async function loadOrders() {
  loadError.value = '';
  try {
    const query: Record<string, string | number> = { limit: PAGE_SIZE, offset: offset.value };
    if (statusFilter.value) query.status = statusFilter.value;
    const page = await request<Page<Order>>('/orders', { query });
    orders.value = page.items;
    total.value = page.total;
  } catch {
    loadError.value = 'Unable to load orders.';
  }
}

async function loadProducts() {
  try {
    const page = await request<Page<Product>>('/products', { query: { limit: 100 } });
    products.value = page.items.filter((p) => p.active);
  } catch {
    formError.value = 'Unable to load products.';
  }
}

const selectedLines = computed(() => lines.value.filter((l) => l.productId));
const draftTotal = computed(() =>
  selectedLines.value.reduce((sum, l) => {
    const product = products.value.find((p) => p.id === l.productId);
    return sum + (product ? product.priceCents * l.quantity : 0);
  }, 0),
);

async function createOrder() {
  formError.value = '';
  if (selectedLines.value.length === 0) {
    formError.value = 'Add at least one product.';
    return;
  }
  submitting.value = true;
  try {
    await request('/orders', {
      method: 'POST',
      body: {
        ...(customerLabel.value ? { customerLabel: customerLabel.value } : {}),
        items: selectedLines.value,
      },
    });
    customerLabel.value = '';
    lines.value = [{ productId: '', quantity: 1 }];
    offset.value = 0;
    await loadOrders();
  } catch {
    formError.value = 'The order could not be created.';
  } finally {
    submitting.value = false;
  }
}

async function changeStatus(order: Order, status: OrderStatus) {
  actionError.value = '';
  try {
    await request(`/orders/${order.id}`, { method: 'PATCH', body: { status } });
  } catch (err: any) {
    actionError.value =
      err?.statusCode === 409
        ? 'The order changed in the meantime; the list has been refreshed.'
        : 'The status could not be updated.';
  }
  await loadOrders();
}

function setFilter() {
  offset.value = 0;
  loadOrders();
}

function page(delta: number) {
  offset.value = Math.max(0, offset.value + delta * PAGE_SIZE);
  loadOrders();
}

onMounted(() => {
  loadProducts();
  loadOrders();
});
</script>

<template>
  <main v-if="session">
    <header class="bar">
      <div>
        <h1 data-testid="tenant-name">{{ session.tenant.name }}</h1>
        <small data-testid="user-role">{{ session.email }} · {{ session.role }}</small>
      </div>
      <button class="secondary" data-testid="logout" @click="logout">Sign out</button>
    </header>

    <section class="card">
      <h2>New order</h2>
      <form @submit.prevent="createOrder">
        <label>
          Customer or table
          <input v-model="customerLabel" maxlength="100" data-testid="customer-label" />
        </label>
        <div v-for="(line, i) in lines" :key="i" class="line">
          <select v-model="line.productId" :data-testid="`product-${i}`">
            <option value="">Select a product</option>
            <option v-for="p in products" :key="p.id" :value="p.id">
              {{ p.name }} · {{ formatMoney(p.priceCents) }}
            </option>
          </select>
          <input
            v-model.number="line.quantity"
            type="number"
            min="1"
            max="99"
            :data-testid="`quantity-${i}`"
          />
          <button
            type="button"
            class="secondary"
            :disabled="lines.length === 1"
            @click="lines.splice(i, 1)"
          >
            Remove
          </button>
        </div>
        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-testid="add-line"
            @click="lines.push({ productId: '', quantity: 1 })"
          >
            Add product
          </button>
          <strong data-testid="draft-total">Total {{ formatMoney(draftTotal) }}</strong>
          <button type="submit" :disabled="submitting" data-testid="create-order">
            Create order
          </button>
        </div>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
      </form>
    </section>

    <section class="card">
      <div class="bar">
        <h2>Orders ({{ total }})</h2>
        <label class="inline">
          Status
          <select v-model="statusFilter" data-testid="status-filter" @change="setFilter">
            <option value="">All</option>
            <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
      </div>
      <p v-if="actionError" class="error" role="alert" data-testid="action-error">
        {{ actionError }}
      </p>
      <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
      <p v-else-if="orders.length === 0" class="muted">No orders yet.</p>
      <table v-else data-testid="orders-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id" data-testid="order-row">
            <td>{{ o.customerLabel || '—' }}</td>
            <td>{{ o.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ') }}</td>
            <td>{{ formatMoney(o.totalCents) }}</td>
            <td>
              <span class="badge" :class="o.status">{{ o.status }}</span>
            </td>
            <td class="row-actions">
              <button
                v-for="next in NEXT_STATUSES[o.status]"
                :key="next"
                class="secondary small"
                :data-testid="`set-${next}`"
                @click="changeStatus(o, next)"
              >
                {{ next }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <button class="secondary" :disabled="offset === 0" @click="page(-1)">Previous</button>
        <span class="muted"
          >{{ total === 0 ? 0 : offset + 1 }}–{{ Math.min(offset + PAGE_SIZE, total) }} of
          {{ total }}</span
        >
        <button class="secondary" :disabled="offset + PAGE_SIZE >= total" @click="page(1)">
          Next
        </button>
      </div>
    </section>
  </main>
</template>
