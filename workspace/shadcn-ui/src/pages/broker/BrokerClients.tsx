import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Plus,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Home,
  MessageSquare,
  FileText,
  Star,
  MapPin,
  Clock,
  TrendingUp,
  Users,
  Heart,
  Search
} from 'lucide-react';
import { formatCurrency } from '@/utils/export';

const BrokerClients = () => {
  const [selectedTab, setSelectedTab] = useState('active');
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClient, setEditingClient] = useState<any>(null);
  
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    type: 'buyer',
    status: 'active',
    budget: '',
    preferredAreas: '',
    notes: ''
  });

  // Mock clients data
  const clients = [
    {
      id: '1',
      name: 'John Smith',
      email: 'john.smith@email.com',
      phone: '(555) 123-4567',
      type: 'buyer',
      status: 'active',
      budget: 850000,
      preferredAreas: ['Miami Beach', 'Coral Gables'],
      addedDate: '2024-01-10',
      lastContact: '2024-01-15',
      properties: {
        viewed: 12,
        saved: 5,
        offers: 2
      },
      notes: 'First-time buyer, very motivated. Pre-approved for $900k.',
      agent: 'Sarah Johnson',
      rating: 5,
      source: 'Website',
      stage: 'viewing'
    },
    {
      id: '2',
      name: 'Maria Garcia',
      email: 'maria.garcia@email.com',
      phone: '(555) 987-6543',
      type: 'seller',
      status: 'active',
      propertyValue: 425000,
      propertyAddress: '456 Sunset Boulevard, Tampa, FL',
      addedDate: '2024-01-08',
      lastContact: '2024-01-14',
      properties: {
        listed: 1,
        showings: 15,
        offers: 3
      },
      notes: 'Relocating for work, needs quick sale.',
      agent: 'Mike Rodriguez',
      rating: 4,
      source: 'Referral',
      stage: 'under-contract'
    },
    {
      id: '3',
      name: 'David Chen',
      email: 'david.chen@email.com',
      phone: '(555) 456-7890',
      type: 'investor',
      status: 'active',
      budget: 2000000,
      preferredAreas: ['Orlando', 'Tampa'],
      addedDate: '2024-01-05',
      lastContact: '2024-01-12',
      properties: {
        viewed: 25,
        saved: 8,
        purchased: 3
      },
      notes: 'Cash buyer, looking for rental properties. Experienced investor.',
      agent: 'Lisa Chen',
      rating: 5,
      source: 'Cold Call',
      stage: 'negotiating'
    },
    {
      id: '4',
      name: 'Jennifer Wilson',
      email: 'jennifer.wilson@email.com',
      phone: '(555) 321-0987',
      type: 'buyer',
      status: 'closed',
      budget: 650000,
      preferredAreas: ['Fort Lauderdale'],
      addedDate: '2023-12-01',
      lastContact: '2024-01-05',
      properties: {
        viewed: 18,
        saved: 7,
        offers: 4,
        purchased: 1
      },
      notes: 'Successfully purchased dream home!',
      agent: 'Sarah Johnson',
      rating: 5,
      source: 'Social Media',
      stage: 'closed',
      closedDate: '2024-01-05',
      closedValue: 625000
    }
  ];

  const resetClientForm = () => {
    setClientForm({
      name: '',
      email: '',
      phone: '',
      type: 'buyer',
      status: 'active',
      budget: '',
      preferredAreas: '',
      notes: ''
    });
  };

  const handleCreateClient = () => {
    if (!clientForm.name || !clientForm.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Mock client creation
    toast.success('Client added successfully!');
    setShowClientDialog(false);
    resetClientForm();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'closed': return 'bg-blue-100 text-blue-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'buyer': return 'bg-blue-100 text-blue-800';
      case 'seller': return 'bg-purple-100 text-purple-800';
      case 'investor': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'lead': return 'bg-yellow-100 text-yellow-800';
      case 'viewing': return 'bg-blue-100 text-blue-800';
      case 'negotiating': return 'bg-orange-100 text-orange-800';
      case 'under-contract': return 'bg-purple-100 text-purple-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredClients = clients.filter(client => {
    const matchesTab = selectedTab === 'all' || client.status === selectedTab;
    const matchesSearch = !searchQuery || 
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesTab && matchesSearch;
  });

  const ClientCard = ({ client }: { client: any }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{client.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={getTypeColor(client.type)}>
                    {client.type.charAt(0).toUpperCase() + client.type.slice(1)}
                  </Badge>
                  <Badge className={getStatusColor(client.status)}>
                    {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                  </Badge>
                  <Badge className={getStageColor(client.stage)}>
                    {client.stage.replace('-', ' ').charAt(0).toUpperCase() + client.stage.replace('-', ' ').slice(1)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < client.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                />
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-gray-500" />
              <span>{client.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-500" />
              <span>{client.phone}</span>
            </div>
          </div>

          {/* Client Details */}
          <div className="space-y-2">
            {client.type === 'buyer' && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Budget:</span>
                  <span className="font-medium">{formatCurrency(client.budget)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Preferred Areas: </span>
                  <span>{client.preferredAreas?.join(', ')}</span>
                </div>
              </>
            )}
            
            {client.type === 'seller' && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Property Value:</span>
                  <span className="font-medium">{formatCurrency(client.propertyValue)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Address: </span>
                  <span>{client.propertyAddress}</span>
                </div>
              </>
            )}

            {client.type === 'investor' && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Investment Budget:</span>
                  <span className="font-medium">{formatCurrency(client.budget)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Target Areas: </span>
                  <span>{client.preferredAreas?.join(', ')}</span>
                </div>
              </>
            )}
          </div>

          {/* Activity Stats */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg">
            {client.type === 'buyer' && (
              <>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.viewed}</div>
                  <div className="text-xs text-gray-600">Viewed</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.saved}</div>
                  <div className="text-xs text-gray-600">Saved</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm text-green-600">{client.properties.offers}</div>
                  <div className="text-xs text-gray-600">Offers</div>
                </div>
              </>
            )}
            
            {client.type === 'seller' && (
              <>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.listed}</div>
                  <div className="text-xs text-gray-600">Listed</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.showings}</div>
                  <div className="text-xs text-gray-600">Showings</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm text-green-600">{client.properties.offers}</div>
                  <div className="text-xs text-gray-600">Offers</div>
                </div>
              </>
            )}

            {client.type === 'investor' && (
              <>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.viewed}</div>
                  <div className="text-xs text-gray-600">Viewed</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{client.properties.saved}</div>
                  <div className="text-xs text-gray-600">Saved</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-sm text-green-600">{client.properties.purchased || 0}</div>
                  <div className="text-xs text-gray-600">Purchased</div>
                </div>
              </>
            )}
          </div>

          {/* Timeline */}
          <div className="space-y-1 text-xs text-gray-500">
            <div>Added: {new Date(client.addedDate).toLocaleDateString()}</div>
            <div>Last Contact: {new Date(client.lastContact).toLocaleDateString()}</div>
            <div>Agent: {client.agent}</div>
            <div>Source: {client.source}</div>
            {client.closedDate && (
              <div className="text-green-600 font-medium">
                Closed: {new Date(client.closedDate).toLocaleDateString()} - {formatCurrency(client.closedValue)}
              </div>
            )}
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="text-sm">
              <span className="text-gray-600">Notes: </span>
              <span className="italic">"{client.notes}"</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="flex-1">
              <Phone className="w-4 h-4 mr-1" />
              Call
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <Mail className="w-4 h-4 mr-1" />
              Email
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <MessageSquare className="w-4 h-4 mr-1" />
              Message
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ClientDialog = () => (
    <Dialog open={showClientDialog} onOpenChange={setShowClientDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Add a new client to your database
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={clientForm.name}
              onChange={(e) => setClientForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="John Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={clientForm.phone}
                onChange={(e) => setClientForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Client Type</Label>
              <Select value={clientForm.type} onValueChange={(value) => setClientForm(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">Buyer</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={clientForm.status} onValueChange={(value) => setClientForm(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">Budget/Property Value</Label>
            <Input
              id="budget"
              type="number"
              value={clientForm.budget}
              onChange={(e) => setClientForm(prev => ({ ...prev, budget: e.target.value }))}
              placeholder="500000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferredAreas">Preferred Areas</Label>
            <Input
              id="preferredAreas"
              value={clientForm.preferredAreas}
              onChange={(e) => setClientForm(prev => ({ ...prev, preferredAreas: e.target.value }))}
              placeholder="Miami, Tampa, Orlando (comma separated)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={clientForm.notes}
              onChange={(e) => setClientForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any relevant notes about this client..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowClientDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateClient}>
            Add Client
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Client Management</h1>
          <p className="text-gray-600">
            Manage your client relationships and track interactions
          </p>
        </div>
        <Button onClick={() => setShowClientDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
            <p className="text-xs text-muted-foreground">
              In database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {clients.filter(c => c.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently working
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.filter(c => c.status === 'closed').length}
            </div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(clients.reduce((sum, c) => sum + c.rating, 0) / clients.length).toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              Client satisfaction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search clients by name, email, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Clients Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({clients.filter(c => c.status === 'active').length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({clients.filter(c => c.status === 'inactive').length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({clients.filter(c => c.status === 'closed').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-6">
          {filteredClients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredClients.map((client) => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium mb-2">No clients found</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery 
                  ? 'No clients match your search criteria'
                  : selectedTab === 'all' 
                    ? "You haven't added any clients yet" 
                    : `No ${selectedTab} clients at this time`
                }
              </p>
              <Button onClick={() => setShowClientDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Client
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClientDialog />
    </div>
  );
};

export default BrokerClients;