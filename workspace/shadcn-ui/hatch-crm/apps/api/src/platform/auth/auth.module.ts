import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { OidcStrategy } from './oidc.strategy';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    PassportModule.register({
      session: false
    })
  ],
  providers: [OidcStrategy, TokensService],
  controllers: [AuthController],
  exports: [TokensService]
})
export class AuthModule {}
