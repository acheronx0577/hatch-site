import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { BrokerProvider } from './contexts/BrokerContext'
import { LeadMessagingProvider } from './contexts/LeadMessagingContext'
import { MessengerProvider } from './contexts/MessengerContext'
import { Toaster } from '@/components/ui/toaster'
import { CookieConsentBanner } from '@/components/CookieConsentBanner'

// Public Pages
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import DemoLanding from './pages/DemoLanding'
import DemoBooking from './pages/DemoBooking'
import PerfBenchPage from './pages/dev/PerfBench'
import TermsPage from './pages/Terms'
import Portal from './pages/Portal'
import LeadGenLandingPage from './pages/LeadGenLandingPage'

// Layout Components
import BrokerLayout from './components/layout/BrokerLayout'

// Broker Pages
import BrokerDashboard from './pages/broker/Dashboard'
import BrokerProperties from './pages/broker/Properties'
import BrokerPropertyDetail from './pages/broker/properties/PropertyDetail'
import BrokerTeam from './pages/broker/Team'
import BrokerCalendar from './pages/broker/Calendar'
import BrokerAnalytics from './pages/broker/Analytics'
import LeadRoutingDesk from './pages/broker/LeadRoutingDesk'
import DraftListingsPage from './pages/broker/DraftListings'
import BrokerMarketingPage from './pages/broker/Marketing'
import BrokerMarketingCampaignCenterPage from './pages/broker/MarketingCampaignCenter'
import BrokerMarketingStudioPage from './pages/broker/MarketingStudio'
import DripCampaignsPage from './pages/broker/DripCampaigns'
import LeadGenOverviewPage from './pages/broker/lead-gen/LeadGenOverview'
import LeadGenCampaignsPage from './pages/broker/lead-gen/LeadGenCampaigns'
import LeadGenLandingPagesPage from './pages/broker/lead-gen/LeadGenLandingPages'
import LeadGenAudiencesPage from './pages/broker/lead-gen/LeadGenAudiences'
import LeadGenConversionsPage from './pages/broker/lead-gen/LeadGenConversions'
import Pricing from './pages/broker/Pricing'
import Payment from './pages/broker/Payment'
import BrokerSettingsPage from './pages/broker/Settings'
import RiskCenterPage from './pages/broker/RiskCenter'
import Messages from './pages/Messages'
import BrokerMissionControl from './pages/broker/MissionControl'
import BrokerTransactions from './pages/broker/Transactions'
import BrokerNotificationsPage from './pages/broker/Notifications'
import BrokerAuditLogPage from './pages/broker/AuditLog'
import PlaybooksList from './pages/broker/playbooks/PlaybooksList'
import PlaybookEditor from './pages/broker/playbooks/PlaybookEditor'
import LiveActivityPage from './pages/broker/LiveActivity'
import BrokerFinancials from './pages/broker/Financials'
import BrokerOfferIntents from './pages/broker/OfferIntents'
import FormsLibrary from './pages/broker/forms/FormsLibrary'
import DocumentViewerPage from './pages/broker/DocumentViewer'
import { AgentPerformanceList } from './pages/broker/agent-performance/AgentPerformanceList'
import { AgentPerformanceDetail } from './pages/broker/agent-performance/AgentPerformanceDetail'
import ContractsPage from './pages/broker/Contracts'
import BrokerAccountsPage from './pages/broker/Accounts'
import BrokerOpportunitiesPage from './pages/broker/Opportunities'
import LeadsRedirect from './pages/broker/LeadsRedirect'

// CRM
import CRM from './pages/CRM'
import LeadDetailPage from './pages/broker/LeadDetail'

function App() {
  return (
    <AuthProvider>
      <BrokerProvider>
        <LeadMessagingProvider>
          <MessengerProvider>
            <Router
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <div className="App">
                <Toaster />
                <CookieConsentBanner />
                <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Home />} />
              <Route path="/properties" element={<Navigate to="/broker/properties" replace />} />
              <Route path="/properties/:id" element={<Navigate to="/broker/properties" replace />} />
              <Route path="/customer/*" element={<Navigate to="/broker/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/demo" element={<DemoBooking />} />
              <Route path="/demo/session" element={<DemoLanding />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/dev/perf" element={<PerfBenchPage />} />
              <Route path="/lp/:orgId/:slug" element={<LeadGenLandingPage />} />

              {/* Broker Routes with Layout */}
              <Route path="/broker" element={<BrokerLayout />}>
                <Route path="dashboard" element={<Navigate to="/broker/mission-control" replace />} />
                <Route path="mission-control" element={<BrokerMissionControl />} />
                <Route path="crm" element={<CRM />} />
                <Route path="crm/leads/:id" element={<LeadDetailPage />} />
                <Route path="properties" element={<BrokerProperties />} />
                <Route path="properties/:listingId" element={<BrokerPropertyDetail />} />
                <Route path="transactions" element={<BrokerTransactions />} />
                <Route path="leads" element={<LeadsRedirect />} />
                <Route path="team" element={<BrokerTeam />} />
                <Route path="compliance" element={<RiskCenterPage />} />
                <Route path="calendar" element={<BrokerCalendar />} />
                <Route path="analytics" element={<BrokerAnalytics />} />
                <Route path="accounts" element={<BrokerAccountsPage />} />
                <Route path="marketing" element={<BrokerMarketingPage />} />
                <Route path="marketing/studio" element={<BrokerMarketingStudioPage />} />
                <Route path="marketing/campaign-center" element={<BrokerMarketingCampaignCenterPage />} />
                <Route path="marketing/campaigns" element={<DripCampaignsPage />} />
                <Route path="marketing/lead-gen" element={<LeadGenOverviewPage />} />
                <Route path="marketing/lead-gen/campaigns" element={<LeadGenCampaignsPage />} />
                <Route path="marketing/lead-gen/landing-pages" element={<LeadGenLandingPagesPage />} />
                <Route path="marketing/lead-gen/audiences" element={<LeadGenAudiencesPage />} />
                <Route path="marketing/lead-gen/conversions" element={<LeadGenConversionsPage />} />
                <Route path="notifications" element={<BrokerNotificationsPage />} />
                <Route path="opportunities" element={<BrokerOpportunitiesPage />} />
                <Route path="audit-log" element={<BrokerAuditLogPage />} />
                <Route path="lead-routing" element={<LeadRoutingDesk />} />
                <Route path="draft-listings" element={<DraftListingsPage />} />
                <Route path="ai-employees" element={<Navigate to="mission-control" replace />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="payment" element={<Payment />} />
                <Route path="forms" element={<FormsLibrary />} />
                <Route path="playbooks" element={<PlaybooksList />} />
                <Route path="playbooks/:playbookId" element={<PlaybookEditor />} />
                <Route path="live-activity" element={<LiveActivityPage />} />
                <Route path="financials" element={<BrokerFinancials />} />
                <Route path="offer-intents" element={<BrokerOfferIntents />} />
                <Route path="documents/:fileId" element={<DocumentViewerPage />} />
                <Route path="agent-performance" element={<AgentPerformanceList />} />
                <Route path="agent-performance/:agentProfileId" element={<AgentPerformanceDetail />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="settings" element={<BrokerSettingsPage />} />
                {/* Default broker route */}
                <Route index element={<Navigate to="mission-control" replace />} />
              </Route>

              <Route path="/dashboard/forms" element={<Navigate to="/broker/forms" replace />} />

              {/* CRM */}
              <Route path="/crm" element={<Navigate to="/broker/crm" replace />} />

              <Route path="/messages" element={<Messages />} />

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </Router>
          </MessengerProvider>
        </LeadMessagingProvider>
      </BrokerProvider>
    </AuthProvider>
  )
}

export default App
