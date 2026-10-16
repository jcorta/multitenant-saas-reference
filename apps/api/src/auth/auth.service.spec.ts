import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'argon2';
import { DataSource } from 'typeorm';
import { TenantRunner } from '../tenancy/tenant-runner.service';
import { AuthService } from './auth.service';
import { RefreshTokensRepository, UsersRepository } from './repositories';
import { TokenService } from './token.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';
const FAMILY = '44444444-4444-4444-8444-444444444444';

function setup(rows: { user?: object; token?: object } = {}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('auth_find_user_by_email')) return rows.user ? [rows.user] : [];
    if (sql.includes('auth_find_refresh_token')) return rows.token ? [rows.token] : [];
    return [];
  });
  const runner = {
    runInTenantContext: jest.fn((_tenantId: string, fn: () => Promise<unknown>) => fn()),
  };
  const tokens = {
    signAccessToken: jest.fn().mockResolvedValue('access-token'),
    newRefreshToken: jest.fn().mockReturnValue({ raw: 'new-raw', hash: 'new-hash' }),
    refreshTtlMs: 60_000,
  };
  const users = {
    findOne: jest.fn().mockResolvedValue({ id: USER, tenantId: TENANT, role: 'staff' }),
  };
  const refreshTokens = {
    save: jest.fn().mockResolvedValue({}),
    markUsed: jest.fn().mockResolvedValue(true),
    revokeFamily: jest.fn().mockResolvedValue(1),
  };
  const service = new AuthService(
    { query } as unknown as DataSource,
    runner as unknown as TenantRunner,
    tokens as unknown as TokenService,
    users as unknown as UsersRepository,
    refreshTokens as unknown as RefreshTokensRepository,
  );
  return { service, runner, tokens, users, refreshTokens };
}

const tokenRow = (overrides: object = {}) => ({
  id: 'rt-1',
  tenant_id: TENANT,
  user_id: USER,
  family_id: FAMILY,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  used_at: null,
  revoked_at: null,
  ...overrides,
});

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash('correct-password');
  });

  describe('login', () => {
    const userRow = () => ({
      id: USER,
      tenant_id: TENANT,
      password_hash: passwordHash,
      role: 'owner',
    });

    it('issues a session in the tenant of the stored user', async () => {
      const { service, runner, refreshTokens } = setup({ user: userRow() });
      const session = await service.login('owner@example.com', 'correct-password');

      expect(session).toEqual({
        user: { userId: USER, tenantId: TENANT, role: 'owner' },
        accessToken: 'access-token',
        refreshToken: 'new-raw',
      });
      expect(runner.runInTenantContext).toHaveBeenCalledWith(TENANT, expect.any(Function));
      expect(refreshTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, tokenHash: 'new-hash' }),
      );
    });

    it('rejects a wrong password without issuing tokens', async () => {
      const { service, refreshTokens } = setup({ user: userRow() });
      await expect(service.login('owner@example.com', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown email the same way', async () => {
      const { service } = setup();
      await expect(service.login('ghost@example.com', 'x')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('refresh', () => {
    it('rotates within the same family and signs with the current role from the database', async () => {
      const { service, runner, refreshTokens, tokens } = setup({ token: tokenRow() });
      const session = await service.refresh('raw');

      expect(runner.runInTenantContext).toHaveBeenCalledWith(TENANT, expect.any(Function));
      expect(refreshTokens.markUsed).toHaveBeenCalledWith('rt-1');
      expect(refreshTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: FAMILY }),
      );
      expect(tokens.signAccessToken).toHaveBeenCalledWith({
        userId: USER,
        tenantId: TENANT,
        role: 'staff',
      });
      expect(session.refreshToken).toBe('new-raw');
    });

    it('revokes the whole family when a rotated token is replayed', async () => {
      const { service, refreshTokens } = setup({ token: tokenRow() });
      refreshTokens.markUsed.mockResolvedValue(false);

      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.revokeFamily).toHaveBeenCalledWith(FAMILY);
      expect(refreshTokens.save).not.toHaveBeenCalled();
    });

    it.each([
      ['expired', { expires_at: new Date(Date.now() - 1000).toISOString() }],
      ['revoked', { revoked_at: new Date().toISOString() }],
    ])('rejects an %s token without consuming it', async (_label, overrides) => {
      const { service, refreshTokens } = setup({ token: tokenRow(overrides) });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokens.markUsed).not.toHaveBeenCalled();
    });

    it('rejects missing and unknown tokens', async () => {
      const { service } = setup();
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the family in the tenant of the stored token', async () => {
      const { service, runner, refreshTokens } = setup({ token: tokenRow() });
      await service.logout('raw');
      expect(runner.runInTenantContext).toHaveBeenCalledWith(TENANT, expect.any(Function));
      expect(refreshTokens.revokeFamily).toHaveBeenCalledWith(FAMILY);
    });

    it('does nothing without a known token', async () => {
      const { service, runner } = setup();
      await service.logout(undefined);
      await service.logout('unknown');
      expect(runner.runInTenantContext).not.toHaveBeenCalled();
    });
  });
});
