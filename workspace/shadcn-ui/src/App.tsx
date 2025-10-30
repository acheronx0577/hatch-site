import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { BrokerProvider } from './contexts/BrokerContext'
import { MessengerProvider } from './contexts/MessengerContext'
import { CustomerExperienceProvider } from './contexts/CustomerExperienceContext'
import { Toaster } from '@/components/ui/toaster'

// Public Pages
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'

// Layout Components
import BrokerLayout from './components/layout/BrokerLayout'

// Broker Pages
import BrokerDashboard from './pages/broker/Dashboard'
import BrokerProperties from './pages/broker/Properties'
import BrokerLeads from './pages/broker/Leads'
import BrokerTeam from './pages/broker/Team'
import BrokerTeamAdvanced from './pages/broker/TeamAdvanced'
import BrokerCalendar from './pages/broker/Calendar'
import BrokerAnalytics from './pages/broker/Analytics'
import CommissionPlansPage from './pages/broker/CommissionPlans'
import LeadRoutingDesk from './pages/broker/LeadRoutingDesk'
import DraftListingsPage from './pages/broker/DraftListings'
import Pricing from './pages/broker/Pricing'
import Payment from './pages/broker/Payment'
import ComplianceCenter from './pages/broker/Compliance'
import Messages from './pages/Messages'

// Customer Pages
import CustomerDashboard from './pages/customer/Dashboard'
import CustomerProfile from './pages/customer/Profile'
import CustomerFavorites from './pages/customer/Favorites'
import CustomerSaved from './pages/customer/CustomerSaved'
import CustomerInquiries from './pages/customer/Inquiries'
import CustomerPropertyDetail from './pages/customer/CustomerPropertyDetail'
import CustomerSearch from './pages/customer/CustomerSearch'

// CRM
import CRM from './pages/CRM'
import LeadDetailPage from './pages/broker/LeadDetail'

function App() {
  return (
    <AuthProvider>
      <CustomerExperienceProvider>
        <BrokerProvider>
          <MessengerProvider>
            <Router>
              <div className="App">
                <Toaster />
                <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Home />} />
                <Route path="/home" element={<Home />} />
                <Route path="/properties" element={<CustomerSearch />} />
                <Route path="/properties/:id" element={<CustomerPropertyDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                {/* Broker Routes with Layout */}
                <Route path="/broker" element={<BrokerLayout />}>
                  <Route path="dashboard" element={<BrokerDashboard />} />
                  <Route path="crm" element={<CRM />} />
                  <Route path="crm/leads/:id" element={<LeadDetailPage />} />
                  <Route path="properties" element={<BrokerProperties />} />
                  <Route path="leads" element={<BrokerLeads />} />
                  <Route path="team" element={<BrokerTeam />} />
                  <Route path="compliance" element={<ComplianceCenter />} />
                  <Route path="team-advanced" element={<BrokerTeamAdvanced />} />
                  <Route path="calendar" element={<BrokerCalendar />} />
                  <Route path="analytics" element={<BrokerAnalytics />} />
                  <Route path="commission-plans" element={<CommissionPlansPage />} />
                  <Route path="lead-routing" element={<LeadRoutingDesk />} />
                  <Route path="draft-listings" element={<DraftListingsPage />} />
                  <Route path="pricing" element={<Pricing />} />
                  <Route path="payment" element={<Payment />} />
                  {/* Default broker route */}
                  <Route index element={<Navigate to="dashboard" replace />} />
                </Route>

                {/* Customer Routes */}
                <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                <Route path="/customer/search" element={<CustomerSearch />} />
                <Route path="/customer/profile" element={<CustomerProfile />} />
                <Route path="/customer/favorites" element={<CustomerFavorites />} />
                <Route path="/customer/saved" element={<CustomerSaved />} />
                <Route path="/customer/inquiries" element={<CustomerInquiries />} />
                <Route path="/customer/property/:id" element={<CustomerPropertyDetail />} />

                {/* CRM */}
                <Route path="/crm" element={<Navigate to="/broker/crm" replace />} />

                <Route path="/messages" element={<Messages />} />

                {/* Default redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </Router>
          </MessengerProvider>
        </BrokerProvider>
      </CustomerExperienceProvider>
    </AuthProvider>
  )
}

export default App
