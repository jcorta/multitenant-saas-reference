import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { TenantRepository } from '../tenancy/tenant-repository';
import { RefreshToken } from './refresh-token.entity';
import { User } from './user.entity';

@Injectable()
export class UsersRepository extends TenantRepository<User> {
  constructor() {
    super(User);
  }
}

@Injectable()
export class RefreshTokensRepository extends TenantRepository<RefreshToken> {
  constructor() {
    super(RefreshToken);
  }

  // Compare-and-set: of two concurrent presentations of the same token, only one gets true.
  async markUsed(id: string): Promise<boolean> {
    const affected = await this.update(
      { id, usedAt: IsNull(), revokedAt: IsNull() },
      { usedAt: new Date() },
    );
    return affected === 1;
  }

  revokeFamily(familyId: string): Promise<number> {
    return this.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
