import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config';
import { APP_CONFIG } from '../config.module';
import { AuthenticatedUser } from './authenticated-user';
import { UserRole } from './user.entity';

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  role: UserRole;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // The payload carries only identifiers and the role: no email or other personal data.
  signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.userId,
      tenant_id: user.tenantId,
      role: user.role,
    };
    return this.jwt.signAsync(payload);
  }

  // Algorithm, issuer and audience are pinned by the JwtModule verify options.
  async verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const p = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (!UUID.test(p.sub) || !UUID.test(p.tenant_id)) return null;
      if (p.role !== 'owner' && p.role !== 'staff') return null;
      return { userId: p.sub, tenantId: p.tenant_id, role: p.role };
    } catch {
      return null;
    }
  }

  // Refresh tokens are opaque random values; only their SHA-256 hash is stored.
  newRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: TokenService.hash(raw) };
  }

  static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  get refreshTtlMs(): number {
    return this.config.jwt.refreshTtlSeconds * 1000;
  }

  get accessTtlMs(): number {
    return this.config.jwt.accessTtlSeconds * 1000;
  }
}
