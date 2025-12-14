-- Indexes to speed up mission-control dashboards and related counts
CREATE INDEX "OrgMessage_organizationId_createdAt_idx" ON "OrgMessage"("organizationId", "createdAt");
CREATE INDEX "OrgListing_organizationId_status_idx" ON "OrgListing"("organizationId", "status");
CREATE INDEX "OrgListing_organizationId_status_expiresAt_idx" ON "OrgListing"("organizationId", "status", "expiresAt");
CREATE INDEX "OrgTransaction_organizationId_status_idx" ON "OrgTransaction"("organizationId", "status");
CREATE INDEX "OrgTransaction_organizationId_closingDate_idx" ON "OrgTransaction"("organizationId", "closingDate");
CREATE INDEX "OfferIntent_organizationId_status_idx" ON "OfferIntent"("organizationId", "status");
CREATE INDEX "AgentWorkflowTask_organizationId_type_status_idx" ON "AgentWorkflowTask"("organizationId", "type", "status");
CREATE INDEX "OrgFile_orgId_complianceStatus_idx" ON "OrgFile"("orgId", "complianceStatus");
CREATE INDEX "RentalLease_organizationId_endDate_idx" ON "RentalLease"("organizationId", "endDate");
CREATE INDEX "ListingSearchIndex_organizationId_isActive_isRental_idx" ON "ListingSearchIndex"("organizationId", "isActive", "isRental");
CREATE INDEX "SavedSearch_organizationId_frequency_alertsEnabled_idx" ON "SavedSearch"("organizationId", "frequency", "alertsEnabled");
