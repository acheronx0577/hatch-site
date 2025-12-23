import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useBroker } from '@/contexts/BrokerContext'
import BulkUpload from '@/components/BulkUpload'
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  FileText,
  Phone,
  Mail,
  MapPin,
  Star,
  Plus,
  ArrowRight,
  BarChart3,
  Clock,
  Target,
  Award,
  Activity,
  Upload
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { emitCopilotContext } from '@/lib/copilot/events'

export default function BrokerDashboard() {
  const { properties, leads, addProperty, addDraftProperties } = useBroker()
  const [showBulkUpload, setShowBulkUpload] = useState(false)

  // Safe array access with fallbacks
  const safeProperties = properties || []
  const safeLeads = leads || []

  // Calculate metrics with safe array operations
  const totalProperties = safeProperties.length
  const activeProperties = safeProperties.filter(p => p?.status === 'active').length
  const draftProperties = safeProperties.filter(p => p?.status === 'draft').length
  const totalLeads = safeLeads.length
  const hotLeads = safeLeads.filter(l => l?.status === 'hot').length

  // Mock data for agents and transactions since they're not in the current context
  const totalAgents = 3
  const activeAgents = 3
  const monthlyRevenue = 125000

  // Recent activities
  const recentActivities = [
    { id: 1, type: 'lead', message: 'New lead from Jennifer Martinez', time: '2 hours ago', icon: Users },
    { id: 2, type: 'property', message: 'Property listed at 123 Ocean Drive', time: '4 hours ago', icon: Building2 },
    { id: 3, type: 'transaction', message: 'Deal closed for $850,000', time: '1 day ago', icon: DollarSign },
    { id: 4, type: 'agent', message: 'Sarah Johnson joined the team', time: '2 days ago', icon: Users },
  ]

  const handleBulkUploadComplete = async (draftListings: any[]) => {
    // Use the context's addDraftProperties method
    const { created, duplicates } = await addDraftProperties(draftListings)

    setShowBulkUpload(false)

    if (created.length > 0) {
      toast({
        title: created.length === 1 ? 'Draft created' : 'Drafts created',
        description: `Successfully imported ${created.length} propert${created.length === 1 ? 'y' : 'ies'} as drafts. Visit Draft Listings to continue editing.`,
        variant: 'info',
      })
    }

    if (duplicates.length > 0) {
      toast({
        title: duplicates.length === 1 ? 'Duplicate skipped' : 'Duplicates skipped',
        description: (
          <div className="space-y-1 text-left">
            {duplicates.map((dup, index) => {
              const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0
                ? `MLS ${dup.mlsNumber}`
                : dup.address || 'Listing'
              const reasonLabel = dup.reason === 'batch_duplicate'
                ? 'duplicate in upload file'
                : 'already exists'
              return (
                <div key={`${identifier}-${reasonLabel}-${index}`}>
                  {identifier} ({reasonLabel})
                </div>
              )
            })}
          </div>
        ),
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    emitCopilotContext({
      surface: 'dashboard',
      summary: `Broker dashboard · ${totalProperties} properties · ${totalLeads} leads`,
      metadata: {
        totalProperties,
        activeProperties,
        draftProperties,
        totalLeads,
        hotLeads,
        totalAgents,
        monthlyRevenue
      }
    })
  }, [totalProperties, activeProperties, draftProperties, totalLeads, hotLeads, totalAgents, monthlyRevenue])

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">
              Welcome back! Here's what's happening with your business today.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
            <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Listings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bulk Upload Listings</DialogTitle>
                  <DialogDescription>
                    Upload multiple property listings using CSV or Excel files. Properties will be saved as drafts for editing.
                  </DialogDescription>
                </DialogHeader>
                <BulkUpload 
                  onUploadComplete={handleBulkUploadComplete}
                  maxListings={100}
                />
              </DialogContent>
            </Dialog>
            <Button variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Single Property
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProperties}</div>
              <p className="text-xs text-muted-foreground">
                {activeProperties} active, {draftProperties} drafts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLeads}</div>
              <p className="text-xs text-muted-foreground">
                {hotLeads} hot prospects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAgents}</div>
              <p className="text-xs text-muted-foreground">
                {activeAgents} active agents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${monthlyRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                +12% from last month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to help you manage your business</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center"
                onClick={() => setShowBulkUpload(true)}
              >
                <Upload className="w-6 h-6 mb-2 text-brand-blue-600" />
                <span className="text-sm">Bulk Upload</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center"
              >
                <Calendar className="w-6 h-6 mb-2" />
                <span className="text-sm">Schedule</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center"
              >
                <BarChart3 className="w-6 h-6 mb-2" />
                <span className="text-sm">Analytics</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center justify-center"
              >
                <FileText className="w-6 h-6 mb-2" />
                <span className="text-sm">Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates from your brokerage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivities.map((activity) => {
                  const Icon = activity.icon
                  return (
                    <div key={activity.id} className="flex items-center space-x-4">
                      <div className="bg-brand-blue-600/10 p-2 rounded-full">
                        <Icon className="w-4 h-4 text-brand-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {activity.message}
                        </p>
                        <p className="text-sm text-slate-500">{activity.time}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>Key performance indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Conversion Rate</span>
                  </div>
                  <span className="text-sm font-bold text-green-600">24.5%</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium">Avg. Response Time</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">2.3 hours</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Award className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">Client Satisfaction</span>
                  </div>
                  <span className="text-sm font-bold text-purple-600">4.8/5</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium">Market Share</span>
                  </div>
                  <span className="text-sm font-bold text-orange-600">18.2%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Hot Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Hot Leads</CardTitle>
              <CardDescription>Prospects requiring immediate attention</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {safeLeads.filter(lead => lead?.status === 'hot').slice(0, 3).map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-[var(--glass-border)] bg-white/20 p-4 backdrop-blur"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">
                        {lead.name ? lead.name.split(' ').map(n => n[0]).join('') : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{lead.name || 'Unknown Lead'}</p>
                      <p className="text-sm text-slate-600">{lead.email || 'No email'}</p>
                      <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1">
                        <span>Budget: ${lead.budget?.toLocaleString() || 'N/A'}</span>
                        <span>Score: {lead.score || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="destructive">Hot</Badge>
                    <Button size="sm" variant="outline">
                      <Phone className="w-3 h-3 mr-1" />
                      Call
                    </Button>
                  </div>
                </div>
              ))}
              
              {/* Empty state for hot leads */}
              {safeLeads.filter(lead => lead?.status === 'hot').length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-brand-blue-600/40" />
                  <p>No hot leads at the moment</p>
                  <p className="text-sm">New leads will appear here when they become hot prospects</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
