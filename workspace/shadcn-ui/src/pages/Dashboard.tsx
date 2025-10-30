import { useAuth } from '@/App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, 
  Users, 
  FileText, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Home,
  Shield,
  BookOpen,
  Calendar,
  Target,
  Award
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { user } = useAuth();

  const BrokerDashboard = () => (
    <div className="space-y-6">
      {/* Welcome Section - Changed to blue */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">Welcome back, {user?.name}!</h1>
        <p className="text-blue-100">
          Managing {user?.brokerage} with comprehensive compliance and performance insights on Hatch.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">47</div>
            <p className="text-xs text-muted-foreground">+3 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Transactions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">124</div>
            <p className="text-xs text-muted-foreground">$47.2M in volume</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">98.5%</div>
            <p className="text-xs text-muted-foreground">Excellent standing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$284K</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Compliance & Risk Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              Compliance Overview
            </CardTitle>
            <CardDescription>Florida real estate law compliance status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Contract Compliance</span>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                100%
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Disclosure Requirements</span>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                98.5%
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">License Renewals</span>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                <Clock className="w-3 h-3 mr-1" />
                3 Due Soon
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Audit Readiness</span>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Team Performance
            </CardTitle>
            <CardDescription>Agent productivity and achievements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Top Performer: Maria Santos</span>
                <span className="font-medium">18 closings</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Team Average</span>
                <span className="font-medium">8.3 closings</span>
              </div>
              <Progress value={65} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>New Agent Training</span>
                <span className="font-medium">5 in progress</span>
              </div>
              <Progress value={40} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest transactions and compliance updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Contract signed - 123 Ocean Drive</p>
                <p className="text-xs text-muted-foreground">Agent: Mike Rodriguez • 2 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">New lead assigned</p>
                <p className="text-xs text-muted-foreground">Agent: Sarah Chen • 4 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Compliance review required</p>
                <p className="text-xs text-muted-foreground">Transaction #FL-2024-0892 • 6 hours ago</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/transactions">
              <Button variant="outline" className="w-full justify-start">
                <FileText className="w-4 h-4 mr-2" />
                Review Pending Contracts
              </Button>
            </Link>
            <Link to="/crm">
              <Button variant="outline" className="w-full justify-start">
                <Users className="w-4 h-4 mr-2" />
                Assign New Leads
              </Button>
            </Link>
            <Link to="/analytics">
              <Button variant="outline" className="w-full justify-start">
                <TrendingUp className="w-4 h-4 mr-2" />
                Generate Performance Report
              </Button>
            </Link>
            <Link to="/education">
              <Button variant="outline" className="w-full justify-start">
                <BookOpen className="w-4 h-4 mr-2" />
                Schedule Team Training
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const AgentDashboard = () => (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">Good morning, {user?.name}!</h1>
        <p className="text-green-100">
          You have 8 active leads and 3 pending transactions to review today on Hatch.
        </p>
      </div>

      {/* Agent Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">23</div>
            <p className="text-xs text-muted-foreground">5 hot prospects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Transactions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground">$2.8M in volume</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">Closings completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$18,500</div>
            <p className="text-xs text-muted-foreground">+22% vs last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline and Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Transaction Pipeline</CardTitle>
            <CardDescription>Current deals in progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">456 Sunset Blvd</p>
                <p className="text-sm text-muted-foreground">Under Contract • $485,000</p>
              </div>
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                Inspection
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">789 Palm Avenue</p>
                <p className="text-sm text-muted-foreground">Pending • $325,000</p>
              </div>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                Appraisal
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">321 Beach Road</p>
                <p className="text-sm text-muted-foreground">Active • $750,000</p>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                Showing
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today's Tasks</CardTitle>
            <CardDescription>Priority actions and follow-ups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded" />
              <div className="flex-1">
                <p className="text-sm font-medium">Follow up with Johnson family</p>
                <p className="text-xs text-muted-foreground">Property showing feedback</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded" />
              <div className="flex-1">
                <p className="text-sm font-medium">Submit repair addendum</p>
                <p className="text-xs text-muted-foreground">456 Sunset Blvd transaction</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded" />
              <div className="flex-1">
                <p className="text-sm font-medium">Schedule closing appointment</p>
                <p className="text-xs text-muted-foreground">789 Palm Avenue - Friday 2PM</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded" />
              <div className="flex-1">
                <p className="text-sm font-medium">Update CRM with new lead info</p>
                <p className="text-xs text-muted-foreground">Contact from website form</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const InvestorDashboard = () => (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-purple-600 to-violet-600 rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">Investment Opportunities, {user?.name}</h1>
        <p className="text-purple-100">
          12 new foreclosure listings and 5 wholesale deals available in your target areas on Hatch.
        </p>
      </div>

      {/* Investment Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$2.4M</div>
            <p className="text-xs text-muted-foreground">15 properties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cash Flow</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$8,200</div>
            <p className="text-xs text-muted-foreground">+15% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">3 under contract</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI Average</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18.5%</div>
            <p className="text-xs text-muted-foreground">Above market average</p>
          </CardContent>
        </Card>
      </div>

      {/* Investment Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Foreclosure Opportunities</CardTitle>
            <CardDescription>Pre-foreclosure and auction properties</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">1234 Oak Street</p>
                <p className="text-sm text-muted-foreground">Pre-foreclosure • Est. $180K</p>
              </div>
              <Badge variant="outline" className="bg-orange-50 text-orange-700">
                45 days
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">567 Pine Road</p>
                <p className="text-sm text-muted-foreground">Auction • Est. $95K</p>
              </div>
              <Badge variant="outline" className="bg-red-50 text-red-700">
                7 days
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">890 Maple Drive</p>
                <p className="text-sm text-muted-foreground">REO • Est. $145K</p>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                Available
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Analysis</CardTitle>
            <CardDescription>Investment area performance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Downtown Tampa</span>
                <span className="font-medium text-green-600">+12.5%</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>St. Petersburg</span>
                <span className="font-medium text-green-600">+8.2%</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Orlando Metro</span>
                <span className="font-medium text-green-600">+15.1%</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Render appropriate dashboard based on user role
  const renderDashboard = () => {
    switch (user?.role) {
      case 'broker':
        return <BrokerDashboard />;
      case 'agent':
        return <AgentDashboard />;
      case 'investor':
        return <InvestorDashboard />;
      default:
        return <AgentDashboard />;
    }
  };

  return (
    <div className="space-y-6">
      {renderDashboard()}
    </div>
  );
};

export default Dashboard;
