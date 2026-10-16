import '../src/load-env';
import { hash } from 'argon2';
import { Client } from 'pg';
import { dbConfig } from '../src/config';
import { SEED_TENANTS } from './seed-data';

// Resets and reseeds development data. Tenant-owned rows are written inside a transaction that
// sets app.tenant_id, so even the schema owner goes through the same RLS policies as the API.
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required');
  const passwordHash = await hash(password);

  const client = new Client(dbConfig('owner'));
  await client.connect();
  try {
    const { rows: existing } = await client.query('SELECT count(*)::int AS n FROM tenants');
    if (existing[0].n > 0 && !process.argv.includes('--reset')) {
      console.log('Database already seeded; pass --reset to wipe and reseed.');
      return;
    }
    await client.query(
      'TRUNCATE refresh_tokens, order_items, orders, products, users, tenants CASCADE',
    );
    for (const tenant of SEED_TENANTS) {
      await client.query('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [
        tenant.id,
        tenant.name,
        tenant.slug,
      ]);
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);

      const userIds: Record<string, string> = {};
      for (const user of tenant.users) {
        const { rows } = await client.query(
          'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenant.id, user.email, passwordHash, user.role],
        );
        userIds[user.role] = rows[0].id;
      }

      const products: { id: string; name: string; priceCents: number }[] = [];
      for (const p of tenant.products) {
        const { rows } = await client.query(
          'INSERT INTO products (tenant_id, name, description, price_cents) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenant.id, p.name, p.description, p.priceCents],
        );
        products.push({ id: rows[0].id, name: p.name, priceCents: p.priceCents });
      }

      for (const order of tenant.orders) {
        const lines = order.lines.map(([index, quantity]) => ({ ...products[index], quantity }));
        const total = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
        const { rows } = await client.query(
          'INSERT INTO orders (tenant_id, status, customer_label, total_cents, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [tenant.id, order.status, order.customer, total, userIds.owner],
        );
        for (const l of lines) {
          await client.query(
            'INSERT INTO order_items (tenant_id, order_id, product_id, product_name, unit_price_cents, quantity) VALUES ($1, $2, $3, $4, $5, $6)',
            [tenant.id, rows[0].id, l.id, l.name, l.priceCents, l.quantity],
          );
        }
      }
      await client.query('COMMIT');
      console.log(`Seeded ${tenant.name}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
