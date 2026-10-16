import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, SessionTokens } from './auth.service';
import { CookieService, REFRESH_COOKIE } from './cookie.service';
import { CurrentUser, Public } from './decorators';
import { AuthenticatedUser } from './authenticated-user';
import { LoginDto } from './login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto.email, dto.password);
    return this.respond(res, session);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      return this.respond(res, session);
    } catch (err) {
      this.cookies.clear(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.cookies.clear(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }

  // Tokens only ever travel in httpOnly cookies; the body carries no credentials.
  private respond(res: Response, session: SessionTokens) {
    this.cookies.set(res, session.accessToken, session.refreshToken);
    return { userId: session.user.userId, role: session.user.role };
  }
}
