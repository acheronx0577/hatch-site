import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OrgLoisService } from './org-lois.service';
import { CreateOfferIntentDto } from './dto/create-offer-intent.dto';
import { UpdateOfferIntentStatusDto } from './dto/update-offer-intent-status.dto';

interface AuthedRequest {
  user?: { userId?: string; sub?: string };
}

const getUserId = (req: AuthedRequest) => req.user?.userId ?? req.user?.sub ?? null;

@ApiTags('offer-intents')
@ApiBearerAuth()
@Controller()
export class OrgLoisController {
  constructor(private readonly orgLois: OrgLoisService) {}

  @Post('organizations/:orgId/offer-intents/public')
  createOfferIntentPublic(@Param('orgId') orgId: string, @Body() dto: CreateOfferIntentDto) {
    return this.orgLois.createOfferIntentForConsumer(orgId, null, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('organizations/:orgId/offer-intents')
  createOfferIntentAuthenticated(@Param('orgId') orgId: string, @Body() dto: CreateOfferIntentDto, @Req() req: AuthedRequest) {
    const userId = getUserId(req);
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.orgLois.createOfferIntentInternal(orgId, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('organizations/:orgId/offer-intents')
  listOfferIntents(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('listingId') listingId?: string
  ) {
    const userId = getUserId(req);
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.orgLois.listOfferIntentsForOrg(orgId, userId, { status, listingId });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('organizations/:orgId/offer-intents/:offerId/status')
  updateOfferIntentStatus(
    @Param('orgId') orgId: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferIntentStatusDto,
    @Req() req: AuthedRequest
  ) {
    const userId = getUserId(req);
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.orgLois.updateOfferIntentStatus(orgId, userId, offerId, dto);
  }
}
