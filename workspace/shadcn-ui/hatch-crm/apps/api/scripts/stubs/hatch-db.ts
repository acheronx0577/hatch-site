const createEnum = () =>
  new Proxy(
    {},
    {
      get: (_target, prop: string | symbol) => String(prop)
    }
  );

export const UserRole = createEnum();
export const ClearCooperationTimer = {};
export const Listing = {};
export const MLSProfile = {};
export const Prisma = {};
export const AuditAction = createEnum();
export const TeamMember = {};
export const DealStage = createEnum();
export const OfferStatus = createEnum();
export const Pipeline = {};
export const Stage = {};
export const ConversationType = createEnum();
export const LeadSlaType = createEnum();
export const RoutingMode = createEnum();
export const ListingStatus = createEnum();
export const PermissionHolderType = createEnum();
export const ActivityType = createEnum();
export const Agreement = {};
export const AgreementStatus = createEnum();
export const AgreementType = createEnum();
export const SavedView = {};
export const ConsentScope = createEnum();
export const ConsentStatus = createEnum();
export const PersonStage = createEnum();
export const TourStatus = createEnum();
export const PlanAssigneeType = createEnum();
export const LeadTaskStatus = createEnum();
export const LeadScoreTier = createEnum();
export const LeadTouchpointType = createEnum();
export const MessageChannel = createEnum();
export const ConsentChannel = createEnum();
export const Message = {};
export const CalendarEventPriority = createEnum();
export const CalendarEventStatus = createEnum();
export const CalendarEventType = createEnum();
export const CommissionPlanType = createEnum();
export const ShareAccess = createEnum();
export const ShareGranteeType = createEnum();
export const BuyerRepStatus = createEnum();

export class PrismaClient {
  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}

export default {};
