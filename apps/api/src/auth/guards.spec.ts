import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfig } from '../config';
import { CsrfGuard } from '../common/csrf.guard';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

function ctx(req: object, meta: Record<string, unknown> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => meta,
    getClass: () => meta,
  } as unknown as ExecutionContext;
}

function reflectorFor(meta: Record<string, unknown>): Reflector {
  return { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
}

const user = { userId: 'u', tenantId: 't', role: 'staff' as const };

describe('JwtAuthGuard', () => {
  const tokens = { verifyAccessToken: jest.fn() } as unknown as TokenService;
  const verify = tokens.verifyAccessToken as jest.Mock;

  beforeEach(() => verify.mockReset());

  it('lets public routes through without a token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({ [IS_PUBLIC_KEY]: true }), tokens);
    await expect(guard.canActivate(ctx({ headers: {} }))).resolves.toBe(true);
  });

  it('rejects requests without a token', async () => {
    const guard = new JwtAuthGuard(reflectorFor({}), tokens);
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects requests with an invalid token', async () => {
    verify.mockResolvedValue(null);
    const guard = new JwtAuthGuard(reflectorFor({}), tokens);
    const req = { headers: {}, cookies: { access_token: 'bad' } };
    await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the verified identity from the cookie or bearer header', async () => {
    verify.mockResolvedValue(user);
    const guard = new JwtAuthGuard(reflectorFor({}), tokens);
    const fromCookie: Record<string, unknown> = { headers: {}, cookies: { access_token: 'c' } };
    const fromBearer: Record<string, unknown> = { headers: { authorization: 'Bearer b' } };
    await guard.canActivate(ctx(fromCookie));
    await guard.canActivate(ctx(fromBearer));
    expect(fromCookie.user).toEqual(user);
    expect(fromBearer.user).toEqual(user);
    expect(verify).toHaveBeenNthCalledWith(1, 'c');
    expect(verify).toHaveBeenNthCalledWith(2, 'b');
  });

  it('ignores a tenant supplied by the client', async () => {
    verify.mockResolvedValue(user);
    const guard = new JwtAuthGuard(reflectorFor({}), tokens);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer b', 'x-tenant-id': 'evil' },
      body: { tenantId: 'evil' },
      query: { tenant_id: 'evil' },
    };
    await guard.canActivate(ctx(req));
    expect((req.user as typeof user).tenantId).toBe('t');
  });
});

describe('RolesGuard', () => {
  it('allows routes with no role requirement', () => {
    expect(new RolesGuard(reflectorFor({})).canActivate(ctx({ user }))).toBe(true);
  });

  it('allows a matching role and rejects others', () => {
    const guard = new RolesGuard(reflectorFor({ [ROLES_KEY]: ['owner'] }));
    expect(() => guard.canActivate(ctx({ user }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ user: { ...user, role: 'owner' } }))).toBe(true);
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard({ webOrigin: 'http://localhost:3000' } as AppConfig);
  const req = (method: string, headers: Record<string, string>) => ctx({ method, headers });

  it('does not restrict safe methods', () => {
    expect(guard.canActivate(req('GET', {}))).toBe(true);
  });

  it('requires the custom header on state-changing requests', () => {
    expect(() => guard.canActivate(req('POST', {}))).toThrow(ForbiddenException);
    expect(guard.canActivate(req('POST', { 'x-requested-with': 'fetch' }))).toBe(true);
  });

  it('rejects a foreign Origin even with the header', () => {
    const headers = { 'x-requested-with': 'fetch', origin: 'https://evil.example' };
    expect(() => guard.canActivate(req('DELETE', headers))).toThrow(ForbiddenException);
    expect(guard.canActivate(req('DELETE', { ...headers, origin: 'http://localhost:3000' }))).toBe(
      true,
    );
  });
});
