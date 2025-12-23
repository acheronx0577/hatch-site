import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from '../modules/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { CanService } from './security/can.service';
import { FlsService } from './security/fls.service';
import { OrgMembershipGuard } from './security/org-membership.guard';
import { PermissionsGuard } from './security/permissions.guard';
import { TenancyModule } from './tenancy/tenancy.module';

@Global()
@Module({
  imports: [AuthModule, TenancyModule, PrismaModule],
  providers: [
    CanService,
    FlsService,
    AuditService,
    AuditInterceptor,
    OrgMembershipGuard,
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useExisting: AuditInterceptor
    }
  ],
  exports: [CanService, FlsService, AuditService, AuditInterceptor, AuthModule, TenancyModule, OrgMembershipGuard]
})
export class PlatformModule {}
