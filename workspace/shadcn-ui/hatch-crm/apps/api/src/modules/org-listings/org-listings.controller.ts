import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/auth/optional-jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { OrgListingContactType } from '@hatch/db';
import { OrgListingsService } from './org-listings.service';
import { OrgListingDetailsService } from './org-listing-details.service';
import { OrgListingRecommendationsService } from './org-listing-recommendations.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { AttachListingDocumentDto } from './dto/attach-listing-document.dto';
import { AttachListingContactDto } from './dto/attach-listing-contact.dto';
import { ListingApprovalActionDto } from './dto/listing-approval-action.dto';

interface AuthedRequest {
  user?: { userId?: string };
  headers?: Record<string, string | undefined>;
}

@ApiTags('org-listings')
@ApiBearerAuth()
@Controller('organizations/:orgId/listings')
export class OrgListingsController {
  constructor(
    private readonly svc: OrgListingsService,
    private readonly details: OrgListingDetailsService,
    private readonly recommendations: OrgListingRecommendationsService
  ) {}

  @Get('public')
  listPublic(@Param('orgId') orgId: string) {
    return this.svc.listListingsPublic(orgId);
  }

  @Get('public/:listingId')
  getPublic(@Param('orgId') orgId: string, @Param('listingId') listingId: string) {
    return this.svc.getPublicListing(orgId, listingId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Param('orgId') orgId: string, @Req() req: AuthedRequest, @Body() dto: CreateListingDto) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.createListing(orgId, userId, dto);
  }

  @Patch(':listingId')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateListingDto
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.updateListing(orgId, userId, listingId, dto);
  }

  @Post(':listingId/request-approval')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  requestApproval(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.requestListingApproval(orgId, userId, listingId);
  }

  @Post(':listingId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  approve(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: ListingApprovalActionDto
  ) {
    const brokerUserId = req.user?.userId;
    if (!brokerUserId) throw new Error('Missing user context');
    return this.svc.approveListing(orgId, brokerUserId, listingId, dto?.note);
  }

  @Post(':listingId/request-changes')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  requestChanges(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: ListingApprovalActionDto
  ) {
    const brokerUserId = req.user?.userId;
    if (!brokerUserId) throw new Error('Missing user context');
    return this.svc.requestListingChanges(orgId, brokerUserId, listingId, dto?.note);
  }

  @Post(':listingId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  reject(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: ListingApprovalActionDto
  ) {
    const brokerUserId = req.user?.userId;
    if (!brokerUserId) throw new Error('Missing user context');
    return this.svc.rejectListing(orgId, brokerUserId, listingId, dto?.note);
  }

  @Post(':listingId/documents')
  @UseGuards(JwtAuthGuard)
  attachDocument(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: AttachListingDocumentDto
  ) {
    const userId = req.user?.userId;
    if (!userId) throw new Error('Missing user context');
    return this.svc.attachListingDocument(orgId, userId, listingId, dto);
  }

  @Get(':listingId/details')
  @UseGuards(OptionalJwtAuthGuard)
  getDetails(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Query('radiusMiles') radiusMiles?: string,
    @Query('comparableLimit') comparableLimit?: string
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    const parsedRadius = radiusMiles ? Number(radiusMiles) : undefined;
    const parsedLimit = comparableLimit ? Number(comparableLimit) : undefined;
    return this.details.getFullDetails(orgId, userId, listingId, {
      radiusMiles: Number.isFinite(parsedRadius ?? NaN) ? parsedRadius : undefined,
      comparableLimit: Number.isFinite(parsedLimit ?? NaN) ? parsedLimit : undefined
    });
  }

  @Get(':listingId/recommendations')
  @UseGuards(OptionalJwtAuthGuard)
  getRecommendations(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.recommendations.getRecommendations(orgId, userId, listingId);
  }

  @Get(':listingId/activity')
  @UseGuards(OptionalJwtAuthGuard)
  getActivity(@Param('orgId') orgId: string, @Param('listingId') listingId: string, @Req() req: AuthedRequest) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.listListingActivity(orgId, userId, listingId);
  }

  @Get(':listingId/contacts')
  @UseGuards(OptionalJwtAuthGuard)
  listContacts(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Query('type') type?: string
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.listListingContacts(orgId, userId, listingId, parseContactType(type));
  }

  @Post(':listingId/contacts')
  @UseGuards(OptionalJwtAuthGuard)
  attachContact(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Req() req: AuthedRequest,
    @Body() dto: AttachListingContactDto
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.attachListingContact(orgId, userId, listingId, dto.personId, dto.type);
  }

  @Delete(':listingId/contacts/:personId')
  @UseGuards(OptionalJwtAuthGuard)
  detachContact(
    @Param('orgId') orgId: string,
    @Param('listingId') listingId: string,
    @Param('personId') personId: string,
    @Req() req: AuthedRequest,
    @Query('type') type?: string
  ) {
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.detachListingContact(orgId, userId, listingId, personId, parseContactType(type));
  }

  @Get()
  list(@Param('orgId') orgId: string, @Req() req: AuthedRequest & { headers?: Record<string, string> }) {
    // Allow reads in local/demo by falling back to header-provided user id when JWT is absent
    const headerUser =
      (req.headers?.['x-user-id'] as string | undefined) ??
      (req.headers?.['x-user'] as string | undefined) ??
      undefined;
    const userId = req.user?.userId ?? headerUser ?? 'demo-user';
    return this.svc.listListingsForOrg(orgId, userId);
  }
}

function parseContactType(raw?: string): OrgListingContactType | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return undefined;
  const match = (OrgListingContactType as Record<string, OrgListingContactType>)[normalized];
  if (!match) {
    throw new BadRequestException(`Invalid contact type "${raw}"`);
  }
  return match;
}
