import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { api, createApp, login, parseSetCookie, PASSWORD, USERS } from './helpers';

describe('authentication', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const post = (url: string) => http().post(url).set('X-Requested-With', 'test');

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  describe('login', () => {
    it('sets httpOnly, Secure, SameSite=Strict cookies and returns no token in the body', async () => {
      const res = await post('/api/auth/login').send({ email: USERS.trattoriaOwner, password: PASSWORD }).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);
      expect(res.body).toEqual({ userId: expect.any(String), role: 'owner' });

      const cookies: string[] = res.headers['set-cookie'] as unknown as string[];
      const access = cookies.find((c) => c.startsWith('access_token='))!;
      const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
      for (const c of [access, refresh]) {
        expect(c).toMatch(/HttpOnly/i);
        expect(c).toMatch(/Secure/i);
        expect(c).toMatch(/SameSite=Strict/i);
      }
      expect(access).toMatch(/Path=\/api(;|$)/);
      expect(refresh).toMatch(/Path=\/api\/auth(;|$)/);
      expect(access).toMatch(/Max-Age=900/);
      expect(refresh).toMatch(/Max-Age=604800/);
    });


    it('issues tokens that carry only ids and role', async () => {
      const session = await login(app, USERS.sushiStaff);
      const payload = JSON.parse(Buffer.from(session.access.split('.')[1], 'base64url').toString());
      expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'role', 'sub', 'tenant_id']);
      expect(payload.role).toBe('staff');
    });

    it('answers wrong password and unknown email identically', async () => {
      const wrong = await post('/api/auth/login').send({ email: USERS.trattoriaOwner, password: 'nope' }).expect(401);
      const unknown = await post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope' }).expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.headers['set-cookie']).toBeUndefined();
    });

    it('rejects malformed input', async () => {
      await post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
      await post('/api/auth/login').send({ email: USERS.trattoriaOwner }).expect(400);
    });

    it('exposes the session identity and tenant at /auth/me', async () => {
      const me = await api(app, await login(app, USERS.sushiOwner)).get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({
        email: USERS.sushiOwner,
        role: 'owner',
        tenant: { name: 'Sushi Kaze' },
      });
      expect(JSON.stringify(me.body)).not.toMatch(/password/i);
    });
  });

  describe('CSRF defense in depth', () => {
    it('rejects state-changing requests without the custom header', async () => {
      await http().post('/api/auth/login').send({ email: USERS.trattoriaOwner, password: PASSWORD }).expect(403);
    });

    it('rejects state-changing requests from a foreign origin', async () => {
      await post('/api/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: USERS.trattoriaOwner, password: PASSWORD })
        .expect(403);
      await post('/api/auth/refresh').set('Origin', 'https://evil.example').expect(403);
      await post('/api/auth/logout').set('Origin', 'https://evil.example').expect(403);
    });

    it('accepts the configured web origin', async () => {
      await post('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: USERS.trattoriaOwner, password: PASSWORD })
        .expect(200);
    });
  });

  describe('refresh tokens', () => {
    const refreshWith = (token: string) => post('/api/auth/refresh').set('Cookie', `refresh_token=${token}`);

    it('rotates the refresh token on every use and issues a fresh access token', async () => {
      const first = await login(app, USERS.trattoriaOwner);
      const res = await refreshWith(first.refresh).expect(200);
      const next = parseSetCookie(res.headers['set-cookie'] as unknown as string[]);

      expect(next.refresh_token).toBeTruthy();
      expect(next.refresh_token).not.toBe(first.refresh);
      expect(next.access_token).toBeTruthy();
      await api(app, { ...first, cookie: `access_token=${next.access_token}` }).get('/api/products').expect(200);

      const third = await refreshWith(next.refresh_token).expect(200);
      expect(parseSetCookie(third.headers['set-cookie'] as unknown as string[]).refresh_token).not.toBe(
        next.refresh_token,
      );
    });

    it('revokes the whole token family when a rotated token is presented again', async () => {
      const first = await login(app, USERS.trattoriaOwner);
      const second = parseSetCookie(
        (await refreshWith(first.refresh).expect(200)).headers['set-cookie'] as unknown as string[],
      );

      // Replay of the already-rotated token: rejected, and the session is terminated.
      await refreshWith(first.refresh).expect(401);

      // The legitimate holder of the newest token is cut off as well.
      await refreshWith(second.refresh_token).expect(401);
    });

    it('does not affect other sessions of the same user', async () => {
      const a = await login(app, USERS.trattoriaOwner);
      const b = await login(app, USERS.trattoriaOwner);
      await refreshWith(a.refresh).expect(200);
      await refreshWith(a.refresh).expect(401); // reuse in session A
      await refreshWith(b.refresh).expect(200); // session B survives
    });

    it('rejects missing and unknown refresh tokens and clears the cookies', async () => {
      await post('/api/auth/refresh').expect(401);
      const res = await refreshWith('unknown-token').expect(401);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(cleared).toMatch(/refresh_token=;/);
      expect(cleared).toMatch(/access_token=;/);
    });

    it('logout revokes the refresh token server-side', async () => {
      const session = await login(app, USERS.sushiOwner);
      await post('/api/auth/logout').set('Cookie', `refresh_token=${session.refresh}`).expect(204);
      await refreshWith(session.refresh).expect(401);
    });

    it('logout without a session is harmless', async () => {
      await post('/api/auth/logout').expect(204);
    });

    it('never issues a token for another tenant from a refresh token', async () => {
      const a = await login(app, USERS.trattoriaOwner);
      const res = await refreshWith(a.refresh).expect(200);
      const access = parseSetCookie(res.headers['set-cookie'] as unknown as string[]).access_token;
      const payload = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString());
      expect(payload.tenant_id).toBe('11111111-1111-4111-8111-111111111111');
    });
  });
});
