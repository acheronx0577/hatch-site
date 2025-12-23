import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OrgMembershipGuard } from '@/platform/security/org-membership.guard';
import { AccountingService } from './accounting.service';
@Controller('organizations/:orgId/accounting')
@UseGuards(JwtAuthGuard, OrgMembershipGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('sync-status')
  async getSyncStatus(@Param('orgId') orgId: string) {
    return this.accounting.getSyncStatus(orgId);
  }

  @Post('connect')
  async connect(
    @Param('orgId') orgId: string,
    @Body() body: { provider: string; realmId: string }
  ) {
    return this.accounting.connect(orgId, body.provider, body.realmId);
  }
}
