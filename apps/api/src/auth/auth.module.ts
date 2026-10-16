import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config';
import { APP_CONFIG } from '../config.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokensRepository, UsersRepository } from './repositories';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

// Authentication lives behind this module boundary. The rest of the application only sees the
// guards and the AuthenticatedUser type; extracting it into a service later means replacing
// these providers while consumers keep verifying tokens with the public key.
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        privateKey: config.jwt.privateKey,
        publicKey: config.jwt.publicKey,
        signOptions: {
          algorithm: 'RS256',
          expiresIn: config.jwt.accessTtlSeconds,
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
        },
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: config.jwt.issuer,
          audience: config.jwt.audience,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CookieService,
    UsersRepository,
    RefreshTokensRepository,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtAuthGuard, RolesGuard, TokenService],
})
export class AuthModule {}
