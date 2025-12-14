import { Module } from '@nestjs/common';
import { PrismaModule } from '../../modules/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { OidcStrategy } from './oidc.strategy';
import { TokensService } from './tokens.service';
import { CognitoService } from '../../modules/auth/cognito.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({
      session: false
    })
  ],
  providers: [OidcStrategy, TokensService, CognitoService],
  controllers: [AuthController],
  exports: [TokensService, CognitoService]
})
export class AuthModule {}
