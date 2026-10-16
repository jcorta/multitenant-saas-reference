import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AppConfig } from '../config';
import { APP_CONFIG } from '../config.module';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense in depth for cookie-based sessions. SameSite=Strict is the primary protection; on top of
 * it, state-changing requests must come from the configured web origin (when the browser sends
 * one) and carry a custom header, which a cross-site form post cannot set.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers.origin;
    if (origin && origin !== this.config.webOrigin) {
      throw new ForbiddenException('Origin not allowed');
    }
    if (!req.headers['x-requested-with']) {
      throw new ForbiddenException('Missing X-Requested-With header');
    }
    return true;
  }
}
