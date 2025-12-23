import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { AiBrokerService } from './ai-broker.service';
import { AskBrokerAssistantDto } from './dto/ask-broker-assistant.dto';
import { EvaluateComplianceDto } from './dto/evaluate-compliance.dto';
import { CreateCustomRiskPackageDto } from './dto/create-custom-risk-package.dto';
import { UpdateRiskPackagesDto } from './dto/update-risk-packages.dto';
import { UpdateCustomRiskPackageDto } from './dto/update-custom-risk-package.dto';

interface AuthedRequest {
  user?: { userId?: string; sub?: string };
}

@ApiTags('ai-broker')
@ApiBearerAuth()
@Controller('organizations/:orgId/ai-broker')
export class AiBrokerController {
  constructor(private readonly service: AiBrokerService) {}

  @Post('ask')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  askBrokerAssistant(@Param('orgId') orgId: string, @Body() dto: AskBrokerAssistantDto, @Req() req: AuthedRequest) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.askBrokerAssistant(orgId, userId, dto);
  }

  @Post('evaluate-compliance')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  evaluateCompliance(
    @Param('orgId') orgId: string,
    @Body() dto: EvaluateComplianceDto,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.evaluateCompliance(orgId, userId, dto);
  }

  @Post('agents/:agentProfileId/recompute-risk')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  recomputeAgentRisk(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.recomputeAgentRiskForUser(orgId, userId, agentProfileId);
  }

  @Get('agents/:agentProfileId/risk-analysis')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  getAgentRiskAnalysis(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.getAgentRiskAnalysisForUser(orgId, userId, agentProfileId);
  }

  @Get('risk-packages')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  listRiskPackages(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.listRiskPackagesForUser(orgId, userId);
  }

  @Put('risk-packages')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  updateRiskPackages(@Param('orgId') orgId: string, @Body() dto: UpdateRiskPackagesDto, @Req() req: AuthedRequest) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.updateRiskPackagesForUser(orgId, userId, dto);
  }

  @Post('risk-packages/custom')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  createCustomRiskPackage(@Param('orgId') orgId: string, @Body() dto: CreateCustomRiskPackageDto, @Req() req: AuthedRequest) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.createCustomRiskPackageForUser(orgId, userId, dto);
  }

  @Patch('risk-packages/custom/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  updateCustomRiskPackage(
    @Param('orgId') orgId: string,
    @Param('packageId') packageId: string,
    @Body() dto: UpdateCustomRiskPackageDto,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.updateCustomRiskPackageForUser(orgId, userId, packageId, dto);
  }

  @Delete('risk-packages/custom/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  deleteCustomRiskPackage(
    @Param('orgId') orgId: string,
    @Param('packageId') packageId: string,
    @Req() req: AuthedRequest
  ) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.deleteCustomRiskPackageForUser(orgId, userId, packageId);
  }

  @Post('recompute-risk')
  @UseGuards(JwtAuthGuard, RolesGuard('broker'))
  @HttpCode(200)
  recomputeOrgRisk(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new Error('Missing user context');
    }
    return this.service.recomputeOrgRiskForUser(orgId, userId);
  }
}
