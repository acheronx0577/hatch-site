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
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  DollarSign,
  User,
  Calendar,
  Phone,
  Mail,
  Eye,
  Edit,
  Send,
  AlertCircle
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/utils/export';

const formatDate = (dateString: string) => {
  return formatDateTime(dateString);
};

const BrokerOffers = () => {
  const [selectedTab, setSelectedTab] = useState('pending');
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [responseForm, setResponseForm] = useState({
    action: '',
    counterOffer: '',
    message: '',
    conditions: ''
  });

  // Mock offers data - in real app would come from API
  const offers = [
    {
      id: '1',
      propertyAddress: '123 Ocean Drive, Miami Beach, FL',
      propertyImage: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400',
      listingPrice: 875000,
      offerAmount: 850000,
      buyer: {
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '(555) 123-4567',
        preApproved: true,
        agent: 'Lisa Rodriguez'
      },
      status: 'pending',
      submittedDate: '2024-01-16T10:30:00',
      financing: 'Conventional',
      downPayment: '20%',
      closingDate: '2024-03-15',
      contingencies: ['Inspection', 'Financing', 'Appraisal'],
      message: 'We love this property and are excited to make it our home. We are pre-approved and ready to move quickly.',
      urgency: 'high',
      daysOnMarket: 15,
      competingOffers: 2
    },
    {
      id: '2',
      propertyAddress: '456 Sunset Boulevard, Tampa, FL',
      propertyImage: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400',
      listingPrice: 425000,
      offerAmount: 420000,
      buyer: {
        name: 'Maria Garcia',
        email: 'maria.garcia@email.com',
        phone: '(555) 987-6543',
        preApproved: true,
        agent: 'Mike Johnson'
      },
      status: 'pending',
      submittedDate: '2024-01-15T14:20:00',
      financing: 'FHA',
      downPayment: '3.5%',
      closingDate: '2024-04-01',
      contingencies: ['Inspection', 'Financing'],
      message: 'First-time homebuyer, very motivated and flexible on terms.',
      urgency: 'medium',
      daysOnMarket: 8,
      competingOffers: 0
    },
    {
      id: '3',
      propertyAddress: '789 Palm Avenue, Orlando, FL',
      propertyImage: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400',
      listingPrice: 320000,
      offerAmount: 315000,
      buyer: {
        name: 'David Chen',
        email: 'david.chen@email.com',
        phone: '(555) 456-7890',
        preApproved: true,
        agent: 'Sarah Williams'
      },
      status: 'accepted',
      submittedDate: '2024-01-12T09:15:00',
      responseDate: '2024-01-13T11:30:00',
      financing: 'Cash',
      downPayment: '100%',
      closingDate: '2024-02-15',
      contingencies: ['Inspection'],
      message: 'Cash offer, quick closing preferred.',
      urgency: 'low',
      daysOnMarket: 22,
      competingOffers: 1
    },
    {
      id: '4',
      propertyAddress: '321 Beach Road, Fort Lauderdale, FL',
      propertyImage: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400',
      listingPrice: 650000,
      offerAmount: 625000,
      buyer: {
        name: 'Jennifer Wilson',
        email: 'jennifer.wilson@email.com',
        phone: '(555) 321-0987',
        preApproved: false,
        agent: 'Robert Davis'
      },
      status: 'rejected',
      submittedDate: '2024-01-10T16:45:00',
      responseDate: '2024-01-11T10:20:00',
      financing: 'Conventional',
      downPayment: '10%',
      closingDate: '2024-05-01',
      contingencies: ['Inspection', 'Financing', 'Appraisal', 'Sale of Current Home'],
      message: 'Contingent on sale of current home.',
      urgency: 'low',
      daysOnMarket: 35,
      competingOffers: 0
    }
  ];

  const handleOfferResponse = () => {
    if (!responseForm.action) {
      toast.error('Please select an action');
      return;
    }

    // Mock response handling
    toast.success(`Offer ${responseForm.action} successfully! Buyer will be notified.`);
    setShowResponseDialog(false);
    setSelectedOffer(null);
    setResponseForm({
      action: '',
      counterOffer: '',
      message: '',
      conditions: ''
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'countered': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredOffers = offers.filter(offer => {
    if (selectedTab === 'all') return true;
    return offer.status === selectedTab;
  });

  const OfferCard = ({ offer }: { offer: any }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <img
                src={offer.propertyImage}
                alt="Property"
                className="w-16 h-16 object-cover rounded-lg"
              />
              <div>
                <h3 className="font-semibold text-lg">{offer.propertyAddress}</h3>
                <div className="flex items-center gap-4 mt-1">
                  <Badge className={getStatusColor(offer.status)}>
                    {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                  </Badge>
                  <Badge className={getUrgencyColor(offer.urgency)}>
                    {offer.urgency.charAt(0).toUpperCase() + offer.urgency.slice(1)} Priority
                  </Badge>
                  {offer.competingOffers > 0 && (
                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                      {offer.competingOffers} Competing Offers
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Submitted</div>
              <div className="text-sm font-medium">{formatDate(offer.submittedDate)}</div>
            </div>
          </div>

          {/* Offer Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-gray-600">List Price</div>
              <div className="font-semibold">{formatCurrency(offer.listingPrice)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Offer Amount</div>
              <div className="font-semibold text-green-600">{formatCurrency(offer.offerAmount)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Financing</div>
              <div className="font-semibold">{offer.financing}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Down Payment</div>
              <div className="font-semibold">{offer.downPayment}</div>
            </div>
          </div>

          {/* Buyer Info */}
          <div className="space-y-2">
            <h4 className="font-medium">Buyer Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Name: </span>
                <span className="font-medium">{offer.buyer.name}</span>
                {offer.buyer.preApproved && (
                  <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                    Pre-Approved
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-gray-600">Agent: </span>
                <span className="font-medium">{offer.buyer.agent}</span>
              </div>
              <div>
                <span className="text-gray-600">Email: </span>
                <span>{offer.buyer.email}</span>
              </div>
              <div>
                <span className="text-gray-600">Phone: </span>
                <span>{offer.buyer.phone}</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="space-y-2">
            <h4 className="font-medium">Terms & Conditions</h4>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-gray-600">Closing Date: </span>
                <span className="font-medium">{new Date(offer.closingDate).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Contingencies: </span>
                <span>{offer.contingencies.join(', ')}</span>
              </div>
              {offer.message && (
                <div>
                  <span className="text-gray-600">Message: </span>
                  <span className="italic">"{offer.message}"</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedOffer(offer);
                setShowResponseDialog(true);
              }}
              disabled={offer.status !== 'pending'}
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Respond
            </Button>
            <Button variant="outline" size="sm">
              <Phone className="w-4 h-4 mr-1" />
              Call Buyer
            </Button>
            <Button variant="outline" size="sm">
              <Mail className="w-4 h-4 mr-1" />
              Email
            </Button>
            <Button variant="outline" size="sm">
              <Eye className="w-4 h-4 mr-1" />
              View Property
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const ResponseDialog = () => (
    <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Respond to Offer</DialogTitle>
          <DialogDescription>
            {selectedOffer && `Offer for ${selectedOffer.propertyAddress} - ${formatCurrency(selectedOffer.offerAmount)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="action">Response Action *</Label>
            <Select value={responseForm.action} onValueChange={(value) => setResponseForm(prev => ({ ...prev, action: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select response action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accept">Accept Offer</SelectItem>
                <SelectItem value="reject">Reject Offer</SelectItem>
                <SelectItem value="counter">Counter Offer</SelectItem>
                <SelectItem value="request-info">Request More Information</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {responseForm.action === 'counter' && (
            <div className="space-y-2">
              <Label htmlFor="counterOffer">Counter Offer Amount</Label>
              <Input
                id="counterOffer"
                type="number"
                placeholder="Enter counter offer amount"
                value={responseForm.counterOffer}
                onChange={(e) => setResponseForm(prev => ({ ...prev, counterOffer: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message">Message to Buyer</Label>
            <Textarea
              id="message"
              placeholder="Enter your message to the buyer..."
              value={responseForm.message}
              onChange={(e) => setResponseForm(prev => ({ ...prev, message: e.target.value }))}
              rows={4}
            />
          </div>

          {(responseForm.action === 'accept' || responseForm.action === 'counter') && (
            <div className="space-y-2">
              <Label htmlFor="conditions">Additional Conditions</Label>
              <Textarea
                id="conditions"
                placeholder="Any additional terms or conditions..."
                value={responseForm.conditions}
                onChange={(e) => setResponseForm(prev => ({ ...prev, conditions: e.target.value }))}
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowResponseDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleOfferResponse}>
            <Send className="w-4 h-4 mr-2" />
            Send Response
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
          <h1 className="text-2xl font-bold">Offers Inbox</h1>
          <p className="text-gray-600">
            Manage incoming offers from potential buyers
          </p>
        </div>
        <Button variant="outline">
          <FileText className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Offers</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{offers.length}</div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {offers.filter(o => o.status === 'pending').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Awaiting response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {offers.filter(o => o.status === 'accepted').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Under contract
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4.2h</div>
            <p className="text-xs text-muted-foreground">
              Industry avg: 6.8h
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Offers List */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All Offers ({offers.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({offers.filter(o => o.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="accepted">Accepted ({offers.filter(o => o.status === 'accepted').length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({offers.filter(o => o.status === 'rejected').length})</TabsTrigger>
          <TabsTrigger value="countered">Countered (0)</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-6">
          {filteredOffers.length > 0 ? (
            <div className="space-y-4">
              {filteredOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium mb-2">No offers found</h3>
              <p className="text-gray-600">
                {selectedTab === 'all' 
                  ? "No offers have been submitted yet" 
                  : `No ${selectedTab} offers at this time`
                }
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ResponseDialog />
    </div>
  );
};

export default BrokerOffers;