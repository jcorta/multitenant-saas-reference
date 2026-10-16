import { Inject, Injectable } from '@nestjs/common';
import { CookieOptions, Response } from 'express';
import { AppConfig } from '../config';
import { APP_CONFIG } from '../config.module';
import { ACCESS_COOKIE } from './jwt-auth.guard';

export const REFRESH_COOKIE = 'refresh_token';

// Secure is kept on in every environment: browsers treat http://localhost as a secure context
// for cookies (Chromium and Firefox; Safari may not).
const base: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' };

// The access cookie goes to all API routes; the refresh cookie is limited to the auth routes so it
// is never sent along with ordinary data requests.
const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

@Injectable()
export class CookieService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  set(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...base,
      path: ACCESS_PATH,
      maxAge: this.config.jwt.accessTtlSeconds * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      path: REFRESH_PATH,
      maxAge: this.config.jwt.refreshTtlSeconds * 1000,
    });
  }

  clear(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...base, path: ACCESS_PATH });
    res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
  }
}
