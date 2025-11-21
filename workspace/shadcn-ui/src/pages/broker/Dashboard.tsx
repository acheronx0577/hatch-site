import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useBroker } from '@/contexts/BrokerContext'
import BulkUpload from '@/components/BulkUpload'
import { motion } from 'framer-motion'
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

export default function BrokerDashboard() {
  const { properties, leads, addProperty, addDraftProperties } = useBroker()
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Animation variants that respect reduced motion preference
  const fadeInUp = {
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.4 }
  }

  const staggerContainer = {
    animate: {
      transition: prefersReducedMotion ? { duration: 0 } : {
        staggerChildren: 0.1
      }
    }
  }

  const scaleOnHover = prefersReducedMotion ? {} : {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { type: "spring", stiffness: 400, damping: 17 }
  }

  const getScaleVariant = (scale = 1.05, yOffset = 0) => ({
    whileHover: prefersReducedMotion ? {} : { scale, y: yOffset },
    whileTap: prefersReducedMotion ? {} : { scale: 0.95 },
    transition: prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 17 }
  })

  const cardHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { scale: 1.02, y: -5, transition: { duration: 0.2 } }
  }

  const getSlideVariant = (index: number, xOffset = 5) => ({
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { delay: index * 0.03, duration: 0.15 },
    whileHover: prefersReducedMotion ? {} : { x: xOffset, transition: { duration: 0.1 } },
  })

  const getCardVariant = (index: number) => ({
    initial: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReducedMotion ? { duration: 0 } : { delay: index * 0.1 },
    whileHover: prefersReducedMotion ? {} : { scale: 1.02, x: 5 },
  })

  const avatarHoverVariant = {
    whileHover: prefersReducedMotion ? {} : { rotate: 360 },
    transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.5 }
  }
  // Safe array access with fallbacks
  const safeProperties = properties || []
  const safeLeads = leads || []

  // Calculate metrics with safe array operations
  const totalProperties = safeProperties.length
  const activeProperties = safeProperties.filter(p => p?.status === 'active').length
  const draftProperties = safeProperties.filter(p => p?.status === 'draft').length
  const totalLeads = safeLeads.length
  // Hot leads are high-priority qualified leads or those with high scores
  const hotLeads = safeLeads.filter(l => 
    l?.priority === 'urgent' || 
    l?.priority === 'high' || 
    (l?.score && l.score >= 80)
  ).length

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div 
          className="flex justify-between items-center"
          {...fadeInUp}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Welcome back! Here's what's happening with your business today.
            </p>
          </div>
          <div className="flex gap-3">
            <motion.div {...getScaleVariant()}>
              <Button variant="outline" className="shadow-sm hover:shadow-md transition-shadow">
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </motion.div>
            <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
              <DialogTrigger asChild>
                <motion.div {...getScaleVariant()}>
                  <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transition-all">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Listings
                  </Button>
                </motion.div>
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
            <motion.div {...getScaleVariant()}>
              <Button variant="outline" className="shadow-sm hover:shadow-md transition-shadow">
                <Plus className="w-4 h-4 mr-2" />
                Add Single Property
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Key Metrics */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <motion.div {...fadeInUp} {...cardHoverVariant}>
            <Card className="border-l-4 border-l-blue-500 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
                <Building2 className="h-5 w-5 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{totalProperties}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeProperties} active, {draftProperties} drafts
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div {...fadeInUp} {...cardHoverVariant}>
            <Card className="border-l-4 border-l-green-500 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
                <Users className="h-5 w-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{totalLeads}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {hotLeads} hot prospects
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div {...fadeInUp} {...cardHoverVariant}>
            <Card className="border-l-4 border-l-purple-500 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Members</CardTitle>
                <Users className="h-5 w-5 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{totalAgents}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeAgents} active agents
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div {...fadeInUp} {...cardHoverVariant}>
            <Card className="border-l-4 border-l-orange-500 shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                <DollarSign className="h-5 w-5 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">${monthlyRevenue.toLocaleString()}</div>
                <p className="text-xs text-green-600 font-medium mt-1">
                  <TrendingUp className="w-3 h-3 inline mr-1" />
                  +12% from last month
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div {...fadeInUp}>
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks to help you manage your business</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <motion.div {...getScaleVariant(1.03, -3)}>
                  <Button
                    variant="outline"
                    className="h-24 w-full flex flex-col items-center justify-center shadow-sm hover:shadow-lg hover:border-blue-500 transition-all"
                    onClick={() => setShowBulkUpload(true)}
                  >
                    <Upload className="w-7 h-7 mb-2 text-blue-600" />
                    <span className="text-sm font-medium">Bulk Upload</span>
                  </Button>
                </motion.div>
                <motion.div {...getScaleVariant(1.03, -3)}>
                  <Button
                    variant="outline"
                    className="h-24 w-full flex flex-col items-center justify-center shadow-sm hover:shadow-lg hover:border-green-500 transition-all"
                  >
                    <Calendar className="w-7 h-7 mb-2 text-green-600" />
                    <span className="text-sm font-medium">Schedule</span>
                  </Button>
                </motion.div>
                <motion.div {...getScaleVariant(1.03, -3)}>
                  <Button
                    variant="outline"
                    className="h-24 w-full flex flex-col items-center justify-center shadow-sm hover:shadow-lg hover:border-purple-500 transition-all"
                  >
                    <BarChart3 className="w-7 h-7 mb-2 text-purple-600" />
                    <span className="text-sm font-medium">Analytics</span>
                  </Button>
                </motion.div>
                <motion.div {...getScaleVariant(1.03, -3)}>
                  <Button
                    variant="outline"
                    className="h-24 w-full flex flex-col items-center justify-center shadow-sm hover:shadow-lg hover:border-orange-500 transition-all"
                  >
                    <FileText className="w-7 h-7 mb-2 text-orange-600" />
                    <span className="text-sm font-medium">Reports</span>
                  </Button>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <motion.div {...fadeInUp}>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest updates from your brokerage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivities.map((activity, index) => {
                    const Icon = activity.icon
                    return (
                      <motion.div 
                        key={activity.id} 
                        className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        {...getSlideVariant(index)}
                      >
                        <div className="bg-blue-100 p-2 rounded-full">
                          <Icon className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {activity.message}
                          </p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                      </motion.div>
                    )
                  })}</div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Stats */}
          <motion.div {...fadeInUp}>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    {...(prefersReducedMotion ? {} : { whileHover: { scale: 1.02 } })}
                  >
                    <div className="flex items-center space-x-2">
                      <Target className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium">Conversion Rate</span>
                    </div>
                    <span className="text-sm font-bold text-green-600">24.5%</span>
                  </motion.div>
                  
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    {...(prefersReducedMotion ? {} : { whileHover: { scale: 1.02 } })}
                  >
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium">Avg. Response Time</span>
                    </div>
                    <span className="text-sm font-bold text-blue-600">2.3 hours</span>
                  </motion.div>
                  
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    {...(prefersReducedMotion ? {} : { whileHover: { scale: 1.02 } })}
                  >
                    <div className="flex items-center space-x-2">
                      <Award className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium">Client Satisfaction</span>
                    </div>
                    <span className="text-sm font-bold text-purple-600">4.8/5</span>
                  </motion.div>
                  
                  <motion.div 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    {...(prefersReducedMotion ? {} : { whileHover: { scale: 1.02 } })}
                  >
                    <div className="flex items-center space-x-2">
                      <Activity className="w-5 h-5 text-orange-600" />
                      <span className="text-sm font-medium">Market Share</span>
                    </div>
                    <span className="text-sm font-bold text-orange-600">18.2%</span>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Hot Leads */}
        <motion.div {...fadeInUp}>
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Hot Leads</CardTitle>
                <CardDescription>Prospects requiring immediate attention</CardDescription>
              </div>
              <motion.div {...getScaleVariant()}>
                <Button variant="outline" size="sm" className="shadow-sm hover:shadow-md transition-shadow">
                  View All
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {safeLeads.filter(lead => 
                  lead?.priority === 'urgent' || 
                  lead?.priority === 'high' || 
                  (lead?.score && lead.score >= 80)
                ).slice(0, 3).map((lead, index) => (
                  <motion.div 
                    key={lead.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer"
                    {...getCardVariant(index)}
                  >
                    <div className="flex items-center space-x-4">
                      <motion.div 
                        className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-md"
                        {...avatarHoverVariant}
                      >
                        <span className="text-white font-semibold">
                          {lead.name ? lead.name.split(' ').map(n => n[0]).join('') : 'N/A'}
                        </span>
                      </motion.div>
                      <div>
                        <p className="font-medium text-gray-900">{lead.name || 'Unknown Lead'}</p>
                        <p className="text-sm text-gray-600">{lead.email || 'No email'}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                          <span>Budget: ${lead.budget?.toLocaleString() || 'N/A'}</span>
                          <span>Score: {lead.score || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={lead.priority === 'urgent' ? 'destructive' : lead.priority === 'high' ? 'default' : 'secondary'} 
                        className="shadow-sm"
                      >
                        {lead.priority === 'urgent' 
                          ? 'Urgent' 
                          : lead.priority === 'high' 
                          ? 'High Priority' 
                          : lead.score && lead.score >= 80 
                          ? `Hot (Score: ${lead.score})` 
                          : 'Priority'}
                      </Badge>
                      <motion.div {...getScaleVariant(1.1)}>
                        <Button size="sm" variant="outline" className="hover:bg-green-50 hover:border-green-500 transition-colors">
                          <Phone className="w-3 h-3 mr-1" />
                          Call
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
                
                {/* Empty state for hot leads */}
                {safeLeads.filter(lead => 
                  lead?.priority === 'urgent' || 
                  lead?.priority === 'high' || 
                  (lead?.score && lead.score >= 80)
                ).length === 0 && (
                  <motion.div 
                    className="text-center py-12 text-gray-500"
                    initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2 }}
                  >
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="font-medium">No hot leads at the moment</p>
                    <p className="text-sm mt-1">New leads will appear here when they become hot prospects</p>
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
