import { UserRole } from './user.entity';

// Identity established by the JWT guard. Other modules depend on this type, not on auth internals.
export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: UserRole;
}
