import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators';
import { TokenService } from './token.service';

export const ACCESS_COOKIE = 'access_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE] ?? bearer;
    const user = token ? await this.tokens.verifyAccessToken(token) : null;
    if (!user) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
