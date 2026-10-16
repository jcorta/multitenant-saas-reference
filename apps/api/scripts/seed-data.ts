// Development fixtures shared by the seed script and the tests. Identifiers are fixed so tests
// and end-to-end flows can refer to each tenant without a lookup.

export type SeedOrderStatus = 'pending' | 'preparing' | 'served' | 'paid' | 'cancelled';

export interface SeedTenant {
  id: string;
  name: string;
  slug: string;
  users: { email: string; role: 'owner' | 'staff' }[];
  products: { name: string; description: string; priceCents: number }[];
  // Each order line is [product index, quantity].
  orders: { customer: string; status: SeedOrderStatus; lines: [number, number][] }[];
}

export const TENANT_TRATTORIA_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_SUSHI_ID = '22222222-2222-4222-8222-222222222222';

export const SEED_TENANTS: SeedTenant[] = [
  {
    id: TENANT_TRATTORIA_ID,
    name: 'Trattoria Roma',
    slug: 'trattoria-roma',
    users: [
      { email: 'owner@trattoria.example', role: 'owner' },
      { email: 'staff@trattoria.example', role: 'staff' },
    ],
    products: [
      { name: 'Margherita Pizza', description: 'Tomato, mozzarella, basil', priceCents: 1200 },
      { name: 'Spaghetti Carbonara', description: 'Guanciale, egg, pecorino', priceCents: 1450 },
      { name: 'Lasagna', description: 'Baked layers with ragu', priceCents: 1550 },
      { name: 'Tiramisu', description: 'Mascarpone and espresso', priceCents: 700 },
      { name: 'Caprese Salad', description: 'Tomato and fresh mozzarella', priceCents: 900 },
      { name: 'Espresso', description: 'Single shot', priceCents: 300 },
    ],
    orders: [
      {
        customer: 'Table 3',
        status: 'pending',
        lines: [
          [0, 2],
          [3, 1],
        ],
      },
      {
        customer: 'Table 7',
        status: 'preparing',
        lines: [
          [1, 1],
          [2, 1],
        ],
      },
      {
        customer: 'Takeaway Ana',
        status: 'served',
        lines: [
          [0, 1],
          [5, 2],
        ],
      },
      {
        customer: 'Table 1',
        status: 'paid',
        lines: [
          [4, 2],
          [1, 2],
        ],
      },
    ],
  },
  {
    id: TENANT_SUSHI_ID,
    name: 'Sushi Kaze',
    slug: 'sushi-kaze',
    users: [
      { email: 'owner@sushikaze.example', role: 'owner' },
      { email: 'staff@sushikaze.example', role: 'staff' },
    ],
    products: [
      { name: 'Salmon Nigiri', description: 'Two pieces', priceCents: 650 },
      { name: 'Dragon Roll', description: 'Eight pieces, eel and avocado', priceCents: 1600 },
      { name: 'Miso Soup', description: 'Tofu and wakame', priceCents: 400 },
      { name: 'Chirashi Bowl', description: 'Assorted sashimi over rice', priceCents: 2100 },
      { name: 'Edamame', description: 'Sea salt', priceCents: 500 },
      { name: 'Green Tea', description: 'Hot, unlimited refills', priceCents: 250 },
    ],
    orders: [
      {
        customer: 'Counter 2',
        status: 'pending',
        lines: [
          [0, 3],
          [2, 1],
        ],
      },
      { customer: 'Counter 5', status: 'preparing', lines: [[1, 2]] },
      {
        customer: 'Delivery Kenji',
        status: 'served',
        lines: [
          [3, 1],
          [4, 1],
        ],
      },
      { customer: 'Counter 1', status: 'cancelled', lines: [[5, 2]] },
    ],
  },
];
