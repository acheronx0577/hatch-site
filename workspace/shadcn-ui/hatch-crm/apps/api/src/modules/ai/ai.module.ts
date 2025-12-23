import { Module } from '@nestjs/common';

import { SearchModule } from '@/modules/search/search.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { S3Service } from '@/modules/storage/s3.service';
import { OrganizationsModule } from '@/modules/organizations/organizations.module';
import { CommissionPlansModule } from '@/modules/commission-plans/commission-plans.module';
import { MessagesModule } from '@/modules/messages/messages.module';

import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { CopilotController } from './copilot.controller';
import { AiPendingActionsController } from './ai-approvals.controller';
import { AiPersonasService } from './personas/ai-personas.service';
import { AiPersonaRouterService } from './personas/ai-personas.router';
import { AiPersonasController } from './personas/ai-personas.controller';
import { AiEmailDraftService } from './ai-email.service';
import { AiCacheService } from './foundation/services/ai-cache.service';
import { AiPromptService } from './foundation/services/ai-prompt.service';
import { AiPiiService } from './foundation/services/ai-pii.service';
import { AiGuardrailsService } from './foundation/services/ai-guardrails.service';
import { AiComplianceService } from './foundation/services/ai-compliance.service';
import { AiLoggingService } from './foundation/services/ai-logging.service';
import { AiCostService } from './foundation/services/ai-cost.service';
import { AiApprovalService } from './foundation/services/ai-approval.service';
import { AiFeatureFlagsService } from './foundation/ai-feature-flags.service';
import { AiOrchestrationService } from './foundation/ai-orchestration.service';
import { OnboardingAssistantController } from './features/onboarding/onboarding-assistant.controller';
import { OnboardingAssistantService } from './features/onboarding/onboarding-assistant.service';
import { OnboardingActionsService } from './features/onboarding/onboarding-actions.service';
import { ContextualHelpController } from './features/help/contextual-help.controller';
import { ContextualHelpService } from './features/help/contextual-help.service';
import { ListingDescriptionController } from './features/listing-description/listing-description.controller';
import { ListingDescriptionService } from './features/listing-description/listing-description.service';
import { FollowUpController } from './features/follow-up/follow-up.controller';
import { FollowUpMessageService } from './features/follow-up/follow-up-message.service';
import { ConversationSummaryService } from './features/summarize/conversation-summary.service';
import { SummarizeController } from './features/summarize/summarize.controller';
import { TrainingAssistantController } from './features/training/training-assistant.controller';
import { TrainingAssistantService } from './features/training/training-assistant.service';
import { VideoAssistantService } from './features/training/video-assistant.service';
import { DocumentQaController } from './features/document-qa/document-qa.controller';
import { DocumentQaService } from './features/document-qa/document-qa.service';
import { DocumentProcessor } from './features/document-qa/document-processor';
import { PropertyDossierController } from './features/property-dossier/property-dossier.controller';
import { PropertyDossierService } from './features/property-dossier/property-dossier.service';

@Module({
  imports: [SearchModule, PrismaModule, OrganizationsModule, CommissionPlansModule, MessagesModule],
  controllers: [
    AiController,
    CopilotController,
    AiPersonasController,
    AiPendingActionsController,
    OnboardingAssistantController,
    ContextualHelpController,
    ListingDescriptionController,
    FollowUpController,
    SummarizeController,
    DocumentQaController,
    PropertyDossierController,
    TrainingAssistantController
  ],
  providers: [
    AiService,
    AiPersonasService,
    AiPersonaRouterService,
    AiEmailDraftService,
    S3Service,
    AiCacheService,
    AiPromptService,
    AiPiiService,
    AiGuardrailsService,
    AiComplianceService,
    AiLoggingService,
    AiCostService,
    AiApprovalService,
    AiFeatureFlagsService,
    AiOrchestrationService,
    OnboardingAssistantService,
    OnboardingActionsService,
    ContextualHelpService,
    ListingDescriptionService,
    FollowUpMessageService,
    ConversationSummaryService,
    DocumentQaService,
    DocumentProcessor,
    PropertyDossierService,
    TrainingAssistantService,
    VideoAssistantService
  ],
  exports: [AiService, AiPersonasService, AiEmailDraftService, AiPromptService, AiApprovalService]
})
export class AiModule {}
