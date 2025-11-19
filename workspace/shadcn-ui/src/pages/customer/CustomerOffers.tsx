import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  Calendar,
  DollarSign,
  Home,
  AlertCircle
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/export';

const CustomerOffers = () => {
  const [selectedTab, setSelectedTab] = useState('all');

  // Mock offers data
  const offers = [
    {
      id: '1',
      propertyAddress: '123 Ocean Drive, Miami Beach, FL',
      propertyImage: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400',
      offerAmount: 850000,
      listingPrice: 875000,
      status: 'pending',
      submittedDate: '2024-01-15',
      responseDate: null,
      agent: 'Sarah Johnson',
      contingencies: ['Inspection', 'Financing'],
      message: 'We love this property and are excited to make it our home.',
      timeline: [
        { date: '2024-01-15', event: 'Offer submitted', status: 'completed' },
        { date: '2024-01-16', event: 'Under review', status: 'current' },
        { date: null, event: 'Response expected', status: 'pending' }
      ]
    },
    {
      id: '2',
      propertyAddress: '456 Sunset Boulevard, Tampa, FL',
      propertyImage: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400',
      offerAmount: 420000,
      listingPrice: 425000,
      status: 'accepted',
      submittedDate: '2024-01-10',
      responseDate: '2024-01-12',
      agent: 'Mike Rodriguez',
      contingencies: ['Inspection', 'Appraisal'],
      message: 'Competitive offer with quick closing.',
      timeline: [
        { date: '2024-01-10', event: 'Offer submitted', status: 'completed' },
        { date: '2024-01-11', event: 'Under review', status: 'completed' },
        { date: '2024-01-12', event: 'Offer accepted', status: 'completed' },
        { date: '2024-01-25', event: 'Inspection scheduled', status: 'current' }
      ]
    },
    {
      id: '3',
      propertyAddress: '789 Palm Avenue, Orlando, FL',
      propertyImage: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400',
      offerAmount: 310000,
      listingPrice: 320000,
      status: 'rejected',
      submittedDate: '2024-01-08',
      responseDate: '2024-01-09',
      agent: 'Lisa Chen',
      contingencies: ['Inspection', 'Financing'],
      message: 'First-time buyer, very motivated.',
      timeline: [
        { date: '2024-01-08', event: 'Offer submitted', status: 'completed' },
        { date: '2024-01-09', event: 'Offer rejected', status: 'completed' }
      ]
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'countered': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'accepted': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'countered': return <MessageSquare className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
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
          {/* Property Info */}
          <div className="flex gap-4">
            <img
              src={offer.propertyImage}
              alt="Property"
              className="w-20 h-20 object-cover rounded-lg"
            />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{offer.propertyAddress}</h3>
              <div className="flex items-center gap-4 mt-2">
                <div className="text-sm">
                  <span className="text-gray-600">Your Offer: </span>
                  <span className="font-semibold text-green-600">{formatCurrency(offer.offerAmount)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">List Price: </span>
                  <span className="font-semibold">{formatCurrency(offer.listingPrice)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Status and Dates */}
          <div className="flex items-center justify-between">
            <Badge className={getStatusColor(offer.status)}>
              {getStatusIcon(offer.status)}
              <span className="ml-1 capitalize">{offer.status}</span>
            </Badge>
            <div className="text-sm text-gray-600">
              Submitted {formatDate(offer.submittedDate)}
              {offer.responseDate && (
                <span> • Responded {formatDate(offer.responseDate)}</span>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Timeline</h4>
            <div className="space-y-1">
              {offer.timeline.map((step, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${
                    step.status === 'completed' ? 'bg-green-500' :
                    step.status === 'current' ? 'bg-blue-500' :
                    'bg-gray-300'
                  }`} />
                  <span className={step.status === 'current' ? 'font-medium' : 'text-gray-600'}>
                    {step.event}
                  </span>
                  {step.date && (
                    <span className="text-gray-500 ml-auto">{formatDate(step.date)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-gray-600">Agent: </span>
              <span className="font-medium">{offer.agent}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-600">Contingencies: </span>
              <span>{offer.contingencies.join(', ')}</span>
            </div>
            {offer.message && (
              <div className="text-sm">
                <span className="text-gray-600">Message: </span>
                <span className="italic">"{offer.message}"</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="flex-1">
              <MessageSquare className="w-4 h-4 mr-1" />
              Message Agent
            </Button>
            {offer.status === 'accepted' && (
              <Button size="sm" className="flex-1">
                <Calendar className="w-4 h-4 mr-1" />
                Next Steps
              </Button>
            )}
            {offer.status === 'rejected' && (
              <Button size="sm" className="flex-1">
                <FileText className="w-4 h-4 mr-1" />
                New Offer
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Offers</h1>
          <p className="text-gray-600">
            Track all your submitted offers and their status
          </p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700">
          <Home className="w-4 h-4 mr-2" />
          Browse Properties
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
              Submitted this month
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
              Moving forward
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round((offers.filter(o => o.status === 'accepted').length / offers.length) * 100)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Acceptance rate
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
              <p className="text-gray-600 mb-4">
                {selectedTab === 'all' 
                  ? "You haven't submitted any offers yet" 
                  : `No ${selectedTab} offers at this time`
                }
              </p>
              <Button className="bg-green-600 hover:bg-green-700">
                <Home className="w-4 h-4 mr-2" />
                Start Browsing Properties
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Help Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-800 mb-2">Need Help with Your Offers?</h3>
              <p className="text-sm text-blue-700 mb-3">
                Our team is here to help you navigate the offer process and increase your chances of success.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-blue-700 border-blue-300">
                  Contact Support
                </Button>
                <Button variant="outline" size="sm" className="text-blue-700 border-blue-300">
                  Offer Tips & Guide
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerOffers;