import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { TENANT_SUSHI_ID, TENANT_TRATTORIA_ID } from '../scripts/seed-data';
import { REPO_ROOT } from '../src/repo-root';
import { api, createApp, login, Session, USERS } from './helpers';

describe('tenant isolation (HTTP)', () => {
  let app: INestApplication;
  let trattoria: ReturnType<typeof api>;
  let sushi: ReturnType<typeof api>;
  let trattoriaSession: Session;
  let sushiProductId: string;
  let sushiOrderId: string;
  let trattoriaProductId: string;
  let trattoriaOrderId: string;

  beforeAll(async () => {
    app = await createApp();
    trattoriaSession = await login(app, USERS.trattoriaOwner);
    trattoria = api(app, trattoriaSession);
    sushi = api(app, await login(app, USERS.sushiOwner));

    sushiProductId = (await sushi.get('/api/products?limit=1')).body.items[0].id;
    sushiOrderId = (await sushi.get('/api/orders?limit=1')).body.items[0].id;
    trattoriaProductId = (await trattoria.get('/api/products?limit=1')).body.items[0].id;
    trattoriaOrderId = (await trattoria.get('/api/orders?limit=1')).body.items[0].id;
  });

  afterAll(() => app.close());

  describe('reads', () => {
    it('lists only the caller tenant products and orders', async () => {
      const products = await trattoria.get('/api/products?limit=100').expect(200);
      const orders = await trattoria.get('/api/orders?limit=100').expect(200);
      expect(products.body.items.length).toBeGreaterThan(0);
      expect(products.body.items.every((p: any) => p.tenantId === TENANT_TRATTORIA_ID)).toBe(true);
      expect(orders.body.items.every((o: any) => o.tenantId === TENANT_TRATTORIA_ID)).toBe(true);
      expect(products.body.items.map((p: any) => p.id)).not.toContain(sushiProductId);
      expect(orders.body.items.map((o: any) => o.id)).not.toContain(sushiOrderId);
    });

    it("does not reveal another tenant's resources by id (404, not 403)", async () => {
      await trattoria.get(`/api/products/${sushiProductId}`).expect(404);
      await trattoria.get(`/api/orders/${sushiOrderId}`).expect(404);
    });

    it('still serves the owning tenant its own resource', async () => {
      const own = await sushi.get('/api/products/' + sushiProductId).expect(200);
      expect(own.body.tenantId).toBe(TENANT_SUSHI_ID);
    });
  });

  describe('writes', () => {
    it("cannot update or delete another tenant's product", async () => {
      await trattoria
        .patch(`/api/products/${sushiProductId}`)
        .send({ name: 'hijacked' })
        .expect(404);
      await trattoria.delete(`/api/products/${sushiProductId}`).expect(404);
      const still = await sushi.get(`/api/products/${sushiProductId}`).expect(200);
      expect(still.body.name).not.toBe('hijacked');
    });

    it("cannot update or delete another tenant's order", async () => {
      await trattoria
        .patch(`/api/orders/${sushiOrderId}`)
        .send({ customerLabel: 'hijacked' })
        .expect(404);
      await trattoria.delete(`/api/orders/${sushiOrderId}`).expect(404);
      const still = await sushi.get(`/api/orders/${sushiOrderId}`).expect(200);
      expect(still.body.customerLabel).not.toBe('hijacked');
    });

    it("cannot order another tenant's product", async () => {
      await trattoria
        .post('/api/orders')
        .send({ items: [{ productId: sushiProductId, quantity: 1 }] })
        .expect(422);
    });

    it('stamps new records with the token tenant', async () => {
      const created = await trattoria
        .post('/api/products')
        .send({ name: `Isolation probe ${Date.now()}`, priceCents: 100 })
        .expect(201);
      expect(created.body.tenantId).toBe(TENANT_TRATTORIA_ID);
      await sushi.get(`/api/products/${created.body.id}`).expect(404);
      await trattoria.delete(`/api/products/${created.body.id}`).expect(204);
    });
  });

  describe('request manipulation does not change the effective tenant', () => {
    it('rejects a tenantId in the body', async () => {
      await trattoria
        .post('/api/products')
        .send({ name: 'x', priceCents: 1, tenantId: TENANT_SUSHI_ID })
        .expect(400);
      await trattoria
        .post('/api/orders')
        .send({
          tenant_id: TENANT_SUSHI_ID,
          items: [{ productId: trattoriaProductId, quantity: 1 }],
        })
        .expect(400);
    });

    it('rejects a tenant in the query string', async () => {
      await trattoria.get(`/api/products?tenantId=${TENANT_SUSHI_ID}`).expect(400);
      await trattoria.get(`/api/orders?tenant_id=${TENANT_SUSHI_ID}`).expect(400);
    });

    it('ignores tenant headers', async () => {
      for (const header of ['X-Tenant-Id', 'X-Tenant', 'Tenant-Id']) {
        const res = await trattoria
          .get('/api/products?limit=100')
          .set(header, TENANT_SUSHI_ID)
          .expect(200);
        expect(res.body.items.every((p: any) => p.tenantId === TENANT_TRATTORIA_ID)).toBe(true);
      }
    });

    describe('forged tokens', () => {
      const privateKey = readFileSync(resolve(REPO_ROOT, '.keys/jwt-private.pem'), 'utf8');
      const publicKey = readFileSync(resolve(REPO_ROOT, '.keys/jwt-public.pem'), 'utf8');
      const claims = {
        sub: '33333333-3333-4333-8333-333333333333',
        tenant_id: TENANT_SUSHI_ID,
        role: 'owner',
      };
      const opts = { issuer: 'restaurant-saas', audience: 'restaurant-saas-web' };
      const probe = (token: string) =>
        request(app.getHttpServer()).get('/api/products').set('Authorization', `Bearer ${token}`);

      it('rejects a token for another tenant signed with an unknown key', async () => {
        const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        await probe(jwt.sign(claims, other, { algorithm: 'RS256', ...opts })).expect(401);
      });

      it('rejects HS256 signed with the public key as secret', async () => {
        await probe(jwt.sign(claims, publicKey, { algorithm: 'HS256', ...opts })).expect(401);
      });

      it('rejects unsigned tokens', async () => {
        const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
        await probe(`${enc({ alg: 'none', typ: 'JWT' })}.${enc({ ...claims, ...opts })}.`).expect(
          401,
        );
      });

      it('rejects a valid token whose tenant claim was swapped', async () => {
        const [h, , s] = trattoriaSession.access.split('.');
        const payload = JSON.parse(
          Buffer.from(trattoriaSession.access.split('.')[1], 'base64url').toString(),
        );
        const swapped = Buffer.from(
          JSON.stringify({ ...payload, tenant_id: TENANT_SUSHI_ID }),
        ).toString('base64url');
        await probe(`${h}.${swapped}.${s}`).expect(401);
      });

      it('rejects an expired token', async () => {
        await probe(
          jwt.sign(claims, privateKey, { algorithm: 'RS256', expiresIn: -10, ...opts }),
        ).expect(401);
      });

      it('rejects requests with no credentials', async () => {
        await request(app.getHttpServer()).get('/api/products').expect(401);
      });
    });
  });

  describe('roles', () => {
    it('lets staff read products but not change the catalogue', async () => {
      const staff = api(app, await login(app, USERS.trattoriaStaff));
      await staff.get('/api/products').expect(200);
      await staff.post('/api/products').send({ name: 'x', priceCents: 1 }).expect(403);
      await staff.patch(`/api/products/${trattoriaProductId}`).send({ name: 'x' }).expect(403);
      await staff.delete(`/api/products/${trattoriaProductId}`).expect(403);
      await staff.delete(`/api/orders/${trattoriaOrderId}`).expect(403);
    });

    it('lets staff create orders and advance their status', async () => {
      const staff = api(app, await login(app, USERS.trattoriaStaff));
      const created = await staff
        .post('/api/orders')
        .send({
          customerLabel: 'staff order',
          items: [{ productId: trattoriaProductId, quantity: 2 }],
        })
        .expect(201);
      expect(created.body.items).toHaveLength(1);
      const updated = await staff
        .patch(`/api/orders/${created.body.id}`)
        .send({ status: 'preparing' })
        .expect(200);
      expect(updated.body.status).toBe('preparing');
      await staff.patch(`/api/orders/${created.body.id}`).send({ status: 'paid' }).expect(409);
    });
  });

  describe('domain behaviour', () => {
    it('computes totals from current prices and keeps a snapshot', async () => {
      const product = await trattoria
        .post('/api/products')
        .send({ name: `Snapshot ${Date.now()}`, priceCents: 500 })
        .expect(201);
      const order = await trattoria
        .post('/api/orders')
        .send({ items: [{ productId: product.body.id, quantity: 3 }] })
        .expect(201);
      expect(order.body.totalCents).toBe(1500);
      await trattoria
        .patch(`/api/products/${product.body.id}`)
        .send({ priceCents: 900 })
        .expect(200);
      const reread = await trattoria.get(`/api/orders/${order.body.id}`).expect(200);
      expect(reread.body.totalCents).toBe(1500);
      expect(reread.body.items[0].unitPriceCents).toBe(500);
      await trattoria.delete(`/api/products/${product.body.id}`).expect(409);
      await trattoria.delete(`/api/orders/${order.body.id}`).expect(204);
      await trattoria.delete(`/api/products/${product.body.id}`).expect(204);
    });

    it('paginates', async () => {
      const page = await trattoria.get('/api/products?limit=2&offset=1').expect(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.limit).toBe(2);
      expect(page.body.offset).toBe(1);
      expect(page.body.total).toBeGreaterThanOrEqual(6);
      await trattoria.get('/api/products?limit=1000').expect(400);
    });
  });
});
