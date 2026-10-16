import { INestApplication } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { DataSource } from 'typeorm';
import { TENANT_SUSHI_ID, TENANT_TRATTORIA_ID } from '../scripts/seed-data';
import { TenantContext } from '../src/tenancy/tenant-context';
import { TenantRunner } from '../src/tenancy/tenant-runner.service';
import { createApp, ownerPool, runtimePool } from './helpers';

// These tests talk to the database directly, bypassing every application-level safeguard, to prove
// that Row-Level Security holds on its own.
describe('Row-Level Security (database layer)', () => {
  let pool: Pool;
  let owner: Pool;

  beforeAll(() => {
    pool = runtimePool();
    owner = ownerPool();
  });
  afterAll(async () => {
    await pool.end();
    await owner.end();
  });

  async function asTenant<T>(tenantId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  const tables = ['users', 'products', 'orders', 'order_items', 'refresh_tokens'];

  it('runs the API as a role that cannot bypass RLS', async () => {
    const { rows } = await pool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('has RLS enabled and forced on every tenant table', async () => {
    const { rows } = await pool.query(
      'SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY($1)',
      [tables],
    );
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('returns only the current tenant rows from a plain unfiltered query', async () => {
    for (const [tenant, other] of [
      [TENANT_TRATTORIA_ID, TENANT_SUSHI_ID],
      [TENANT_SUSHI_ID, TENANT_TRATTORIA_ID],
    ]) {
      for (const table of ['products', 'orders', 'order_items']) {
        const { rows } = await asTenant(tenant, (c) => c.query(`SELECT DISTINCT tenant_id FROM ${table}`));
        expect(rows.map((r) => r.tenant_id)).toEqual([tenant]);
        expect(rows.map((r) => r.tenant_id)).not.toContain(other);
      }
    }
  });

  it("cannot read another tenant's row even by primary key", async () => {
    const { rows: sushi } = await asTenant(TENANT_SUSHI_ID, (c) => c.query('SELECT id FROM products LIMIT 1'));
    const { rows } = await asTenant(TENANT_TRATTORIA_ID, (c) =>
      c.query('SELECT id FROM products WHERE id = $1', [sushi[0].id]),
    );
    expect(rows).toHaveLength(0);
  });

  it('returns nothing when no tenant is set (fail-closed)', async () => {
    for (const table of tables) {
      const { rows } = await asTenant(null, (c) => c.query(`SELECT 1 FROM ${table}`));
      expect(rows).toHaveLength(0);
    }
  });

  it('does not carry the tenant over to the next use of a pooled connection', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT_TRATTORIA_ID]);
      await client.query('COMMIT');
      const { rows } = await client.query('SELECT 1 FROM products');
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('blocks inserting a row for another tenant', async () => {
    await expect(
      asTenant(TENANT_TRATTORIA_ID, (c) =>
        c.query('INSERT INTO products (tenant_id, name, price_cents) VALUES ($1, $2, 1)', [TENANT_SUSHI_ID, 'x']),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('blocks moving a row to another tenant and ignores updates and deletes of foreign rows', async () => {
    const { rows: sushi } = await asTenant(TENANT_SUSHI_ID, (c) => c.query('SELECT id FROM products LIMIT 1'));
    await expect(
      asTenant(TENANT_TRATTORIA_ID, (c) => c.query('UPDATE products SET tenant_id = $1', [TENANT_SUSHI_ID])),
    ).rejects.toThrow(/row-level security/);

    const upd = await asTenant(TENANT_TRATTORIA_ID, (c) =>
      c.query("UPDATE products SET name = 'hijacked' WHERE id = $1", [sushi[0].id]),
    );
    const del = await asTenant(TENANT_TRATTORIA_ID, (c) => c.query('DELETE FROM products WHERE id = $1', [sushi[0].id]));
    expect(upd.rowCount).toBe(0);
    expect(del.rowCount).toBe(0);
  });

  it('applies the policies to the table owner too (FORCE)', async () => {
    const { rows } = await owner.query('SELECT 1 FROM products');
    expect(rows).toHaveLength(0);
  });

  it('rejects order items that reference another tenant product (composite foreign key)', async () => {
    const { rows: sushiProducts } = await asTenant(TENANT_SUSHI_ID, (c) => c.query('SELECT id FROM products LIMIT 1'));
    await expect(
      asTenant(TENANT_TRATTORIA_ID, async (c) => {
        const { rows: orders } = await c.query('SELECT id FROM orders LIMIT 1');
        await c.query(
          `INSERT INTO order_items (tenant_id, order_id, product_id, product_name, unit_price_cents, quantity)
           VALUES ($1, $2, $3, 'x', 1, 1)`,
          [TENANT_TRATTORIA_ID, orders[0].id, sushiProducts[0].id],
        );
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it('exposes user and refresh-token rows only through the narrow lookup functions', async () => {
    const direct = await pool.query('SELECT 1 FROM users');
    expect(direct.rows).toHaveLength(0);
    const byEmail = await pool.query("SELECT * FROM auth_find_user_by_email('owner@trattoria.example')");
    expect(byEmail.rows).toHaveLength(1);
    expect(byEmail.rows[0].tenant_id).toBe(TENANT_TRATTORIA_ID);
    const none = await pool.query("SELECT * FROM auth_find_user_by_email('nobody@example.com')");
    expect(none.rows).toHaveLength(0);
  });
});

describe('runInTenantContext (outside HTTP)', () => {
  let app: INestApplication;
  let runner: TenantRunner;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createApp();
    runner = app.get(TenantRunner);
    dataSource = app.get(DataSource);
  });
  afterAll(() => app.close());

  const tenantsSeen = (tenantId: string) =>
    runner.runInTenantContext(tenantId, async () => {
      const rows: { tenant_id: string }[] = await TenantContext.manager().query(
        'SELECT DISTINCT tenant_id FROM products',
      );
      return rows.map((r) => r.tenant_id);
    });

  it('scopes queries to the given tenant without an HTTP request', async () => {
    expect(await tenantsSeen(TENANT_TRATTORIA_ID)).toEqual([TENANT_TRATTORIA_ID]);
    expect(await tenantsSeen(TENANT_SUSHI_ID)).toEqual([TENANT_SUSHI_ID]);
  });

  it('keeps concurrent tenants apart', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => tenantsSeen(i % 2 ? TENANT_SUSHI_ID : TENANT_TRATTORIA_ID)),
    );
    results.forEach((r, i) => expect(r).toEqual([i % 2 ? TENANT_SUSHI_ID : TENANT_TRATTORIA_ID]));
  });

  it('leaves no tenant behind once finished', async () => {
    await tenantsSeen(TENANT_TRATTORIA_ID);
    expect(() => TenantContext.tenantId()).toThrow();
    const rows = await dataSource.query('SELECT 1 FROM products');
    expect(rows).toHaveLength(0);
  });

  it('rolls back everything when the callback fails', async () => {
    const name = `rollback-probe-${Date.now()}`;
    await expect(
      runner.runInTenantContext(TENANT_TRATTORIA_ID, async () => {
        await TenantContext.manager().query(
          'INSERT INTO products (tenant_id, name, price_cents) VALUES ($1, $2, 1)',
          [TENANT_TRATTORIA_ID, name],
        );
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const found = await runner.runInTenantContext(TENANT_TRATTORIA_ID, () =>
      TenantContext.manager().query('SELECT 1 FROM products WHERE name = $1', [name]),
    );
    expect(found).toHaveLength(0);
  });
});
