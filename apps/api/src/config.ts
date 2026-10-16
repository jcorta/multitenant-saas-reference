import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './repo-root';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function readKey(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

export interface DbCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function dbConfig(role: 'owner' | 'runtime'): DbCredentials {
  const prefix = role === 'owner' ? 'DB_OWNER' : 'DB_RUNTIME';
  return {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '5432')),
    database: env('POSTGRES_DB', 'restaurants'),
    user: env(`${prefix}_USER`, role === 'owner' ? 'app_owner' : 'app_runtime'),
    password: env(`${prefix}_PASSWORD`),
  };
}

export interface AppConfig {
  port: number;
  webOrigin: string;
  jwt: {
    privateKey: string;
    publicKey: string;
    issuer: string;
    audience: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  };
}

export function appConfig(): AppConfig {
  return {
    port: Number(env('API_PORT', '4000')),
    webOrigin: env('WEB_ORIGIN', 'http://localhost:3000'),
    jwt: {
      privateKey: readKey(env('JWT_PRIVATE_KEY_PATH', '.keys/jwt-private.pem')),
      publicKey: readKey(env('JWT_PUBLIC_KEY_PATH', '.keys/jwt-public.pem')),
      issuer: env('JWT_ISSUER', 'restaurant-saas'),
      audience: env('JWT_AUDIENCE', 'restaurant-saas-web'),
      accessTtlSeconds: Number(env('ACCESS_TOKEN_TTL_SECONDS', '900')),
      refreshTtlSeconds: Number(env('REFRESH_TOKEN_TTL_SECONDS', '604800')),
    },
  };
}
