import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { hash, verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenancy/tenant.entity';
import { TenantRunner } from '../tenancy/tenant-runner.service';
import { AuthenticatedUser } from './authenticated-user';
import { RefreshTokensRepository, UsersRepository } from './repositories';
import { TokenService } from './token.service';
import { User } from './user.entity';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

type RefreshOutcome =
  | { ok: true; user: User; refreshToken: string }
  | { ok: false };

@Injectable()
export class AuthService {
  // Verified against when the email is unknown so response time does not reveal which emails exist.
  private dummyHash?: Promise<string>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly runner: TenantRunner,
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async login(email: string, password: string): Promise<SessionTokens> {
    // The tenant is not known yet, so the lookup goes through the SECURITY DEFINER function.
    const [row] = await this.dataSource.query('SELECT * FROM auth_find_user_by_email($1)', [email]);
    const passwordHash: string = row?.password_hash ?? (await this.getDummyHash());
    const valid = await verify(passwordHash, password).catch(() => false);
    if (!row || !valid) throw new UnauthorizedException('Invalid credentials');

    const user: AuthenticatedUser = { userId: row.id, tenantId: row.tenant_id, role: row.role };
    const refreshToken = await this.runner.runInTenantContext(user.tenantId, () =>
      this.issueRefreshToken(user, randomUUID()),
    );
    return { user, refreshToken, accessToken: await this.tokens.signAccessToken(user) };
  }

  async refresh(rawToken: string | undefined): Promise<SessionTokens> {
    if (!rawToken) throw new UnauthorizedException();
    const [row] = await this.dataSource.query('SELECT * FROM auth_find_refresh_token($1)', [
      TokenService.hash(rawToken),
    ]);
    if (!row) throw new UnauthorizedException();

    // The tenant comes from the stored token row, never from the request.
    // The outcome is returned rather than thrown so that a family revocation is committed.
    const outcome = await this.runner.runInTenantContext<RefreshOutcome>(row.tenant_id, async () => {
      if (row.revoked_at || new Date(row.expires_at) <= new Date()) return { ok: false };

      const claimed = await this.refreshTokens.markUsed(row.id);
      if (!claimed) {
        // An already-rotated token was presented again: assume theft and end the whole session.
        await this.refreshTokens.revokeFamily(row.family_id);
        return { ok: false };
      }
      const user = await this.users.findOne({ id: row.user_id });
      if (!user) return { ok: false };

      const identity = { userId: user.id, tenantId: user.tenantId, role: user.role };
      return { ok: true, user, refreshToken: await this.issueRefreshToken(identity, row.family_id) };
    });
    if (!outcome.ok) throw new UnauthorizedException();

    const user: AuthenticatedUser = {
      userId: outcome.user.id,
      tenantId: outcome.user.tenantId,
      role: outcome.user.role,
    };
    return { user, refreshToken: outcome.refreshToken, accessToken: await this.tokens.signAccessToken(user) };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const [row] = await this.dataSource.query('SELECT * FROM auth_find_refresh_token($1)', [
      TokenService.hash(rawToken),
    ]);
    if (!row) return;
    await this.runner.runInTenantContext(row.tenant_id, () =>
      this.refreshTokens.revokeFamily(row.family_id),
    );
  }

  // Runs inside the request's tenant context.
  async me(identity: AuthenticatedUser) {
    const user = await this.users.findOne({ id: identity.userId });
    if (!user) throw new UnauthorizedException();
    const tenant = await this.dataSource.getRepository(Tenant).findOneByOrFail({ id: user.tenantId });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }

  private async issueRefreshToken(user: AuthenticatedUser, familyId: string): Promise<string> {
    const { raw, hash: tokenHash } = this.tokens.newRefreshToken();
    await this.refreshTokens.save({
      userId: user.userId,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.tokens.refreshTtlMs),
    });
    return raw;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomUUID());
    return this.dummyHash;
  }
}
