import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { TenantRunner } from './tenant-runner.service';

/**
 * Runs authenticated handlers inside a tenant context. The tenant comes exclusively from the
 * identity attached by the JWT guard. Public routes (login, refresh, health) have no identity and
 * run without a tenant context.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly runner: TenantRunner) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user: AuthenticatedUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return next.handle();

    return from(
      this.runner.runInTenantContext(user.tenantId, () => lastValueFrom(next.handle()), {
        userId: user.userId,
        role: user.role,
      }),
    );
  }
}
