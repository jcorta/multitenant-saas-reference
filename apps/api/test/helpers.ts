import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { appConfig, dbConfig } from '../src/config';
import { configureApp } from '../src/setup';

export const PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';

export const USERS = {
  trattoriaOwner: 'owner@trattoria.example',
  trattoriaStaff: 'staff@trattoria.example',
  sushiOwner: 'owner@sushikaze.example',
  sushiStaff: 'staff@sushikaze.example',
};

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, appConfig());
  await app.init();
  return app;
}

export function runtimePool(): Pool {
  return new Pool(dbConfig('runtime'));
}

export function ownerPool(): Pool {
  return new Pool(dbConfig('owner'));
}

export interface Session {
  cookie: string;
  access: string;
  refresh: string;
  setCookie: string[];
}

export function parseSetCookie(setCookie: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of setCookie ?? []) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

// Secure cookies are never replayed over plain http by cookie jars, so tests send them explicitly.
export async function login(app: INestApplication, email: string): Promise<Session> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .set('X-Requested-With', 'test')
    .send({ email, password: PASSWORD })
    .expect(200);
  const cookies = parseSetCookie(res.headers['set-cookie'] as unknown as string[]);
  return {
    access: cookies.access_token,
    refresh: cookies.refresh_token,
    cookie: `access_token=${cookies.access_token}`,
    setCookie: res.headers['set-cookie'] as unknown as string[],
  };
}

// Authenticated request builder that mimics the browser client: cookie plus custom header.
export function api(app: INestApplication, session: Session) {
  const base = () => ({ cookie: session.cookie, csrf: 'test' });
  const wrap = (r: request.Test) => r.set('Cookie', base().cookie).set('X-Requested-With', 'test');
  const server = app.getHttpServer();
  return {
    get: (url: string) => wrap(request(server).get(url)),
    post: (url: string) => wrap(request(server).post(url)),
    patch: (url: string) => wrap(request(server).patch(url)),
    delete: (url: string) => wrap(request(server).delete(url)),
  };
}
