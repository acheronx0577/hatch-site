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
  Eye,
  Edit,
  Share2,
  BarChart3,
  Camera,
  MapPin,
  DollarSign,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  Heart,
  Download
} from 'lucide-react';
import { formatCurrency } from '@/utils/export';

const BrokerListings = () => {
  const [selectedTab, setSelectedTab] = useState('active');
  const [showListingDialog, setShowListingDialog] = useState(false);
  const [editingListing, setEditingListing] = useState<any>(null);
  
  const [listingForm, setListingForm] = useState({
    address: '',
    city: '',
    state: 'FL',
    zipCode: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    squareFeet: '',
    propertyType: '',
    description: '',
    features: ''
  });

  // Mock listings data
  const listings = [
    {
      id: '1',
      address: '123 Ocean Drive',
      city: 'Miami Beach',
      state: 'FL',
      zipCode: '33139',
      price: 875000,
      originalPrice: 900000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1800,
      propertyType: 'Single Family',
      status: 'active',
      daysOnMarket: 15,
      views: 1247,
      saves: 89,
      inquiries: 23,
      showings: 12,
      offers: 2,
      images: [
        'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800'
      ],
      description: 'Beautiful oceanfront property with stunning views and modern amenities.',
      features: ['Pool', 'Garage', 'Waterfront', 'Balcony'],
      listingDate: '2024-01-01',
      lastUpdated: '2024-01-10',
      agent: 'Sarah Johnson',
      mlsNumber: 'A11234567',
      priceHistory: [
        { date: '2024-01-01', price: 900000, event: 'Listed' },
        { date: '2024-01-10', price: 875000, event: 'Price Reduction' }
      ]
    },
    {
      id: '2',
      address: '456 Sunset Boulevard',
      city: 'Tampa',
      state: 'FL',
      zipCode: '33602',
      price: 425000,
      originalPrice: 425000,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1200,
      propertyType: 'Condo',
      status: 'pending',
      daysOnMarket: 8,
      views: 892,
      saves: 67,
      inquiries: 18,
      showings: 15,
      offers: 3,
      images: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'
      ],
      description: 'Modern condo in downtown Tampa with city views and luxury finishes.',
      features: ['Gym', 'Parking', 'Balcony'],
      listingDate: '2024-01-08',
      lastUpdated: '2024-01-15',
      agent: 'Mike Rodriguez',
      mlsNumber: 'T87654321',
      priceHistory: [
        { date: '2024-01-08', price: 425000, event: 'Listed' }
      ]
    },
    {
      id: '3',
      address: '789 Palm Avenue',
      city: 'Orlando',
      state: 'FL',
      zipCode: '32801',
      price: 320000,
      originalPrice: 335000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1500,
      propertyType: 'Single Family',
      status: 'sold',
      daysOnMarket: 22,
      views: 654,
      saves: 45,
      inquiries: 12,
      showings: 8,
      offers: 1,
      images: [
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800'
      ],
      description: 'Charming family home in quiet neighborhood with great schools nearby.',
      features: ['Garage', 'Garden', 'Fireplace'],
      listingDate: '2023-12-15',
      lastUpdated: '2024-01-05',
      agent: 'Lisa Chen',
      mlsNumber: 'O11223344',
      soldDate: '2024-01-05',
      soldPrice: 315000,
      priceHistory: [
        { date: '2023-12-15', price: 335000, event: 'Listed' },
        { date: '2024-01-01', price: 320000, event: 'Price Reduction' },
        { date: '2024-01-05', price: 315000, event: 'Sold' }
      ]
    }
  ];

  const resetListingForm = () => {
    setListingForm({
      address: '',
      city: '',
      state: 'FL',
      zipCode: '',
      price: '',
      bedrooms: '',
      bathrooms: '',
      squareFeet: '',
      propertyType: '',
      description: '',
      features: ''
    });
  };

  const handleCreateListing = () => {
    if (!listingForm.address || !listingForm.price) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Mock listing creation
    toast.success('Listing created successfully!');
    setShowListingDialog(false);
    resetListingForm();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'sold': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredListings = listings.filter(listing => {
    if (selectedTab === 'all') return true;
    return listing.status === selectedTab;
  });

  const ListingCard = ({ listing }: { listing: any }) => {
    const priceChange = listing.price - listing.originalPrice;
    const priceChangePercent = ((priceChange / listing.originalPrice) * 100).toFixed(1);

    return (
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="relative">
          <img 
            src={listing.images[0]} 
            alt={listing.address}
            className="w-full h-48 object-cover"
          />
          <div className="absolute top-2 left-2">
            <Badge className={getStatusColor(listing.status)}>
              {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
            </Badge>
          </div>
          <div className="absolute top-2 right-2 flex gap-2">
            {priceChange < 0 && (
              <Badge className="bg-red-100 text-red-800">
                Price Drop
              </Badge>
            )}
            <Badge variant="outline" className="bg-white/90">
              <Camera className="w-3 h-3 mr-1" />
              {listing.images.length}
            </Badge>
          </div>
          <div className="absolute bottom-2 left-2">
            <Badge variant="outline" className="bg-white/90">
              MLS: {listing.mlsNumber}
            </Badge>
          </div>
        </div>
        
        <CardContent className="p-4">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xl text-green-600">{formatCurrency(listing.price)}</h3>
                {priceChange !== 0 && (
                  <div className={`flex items-center gap-1 text-sm ${priceChange < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {priceChange < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    {priceChangePercent}%
                  </div>
                )}
              </div>
              <p className="text-gray-600">{listing.address}</p>
              <p className="text-sm text-gray-500">{listing.city}, {listing.state} {listing.zipCode}</p>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{listing.bedrooms} beds</span>
              <span>{listing.bathrooms} baths</span>
              <span>{listing.squareFeet.toLocaleString()} sqft</span>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Views:</span>
                  <span className="font-medium">{listing.views.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Saves:</span>
                  <span className="font-medium">{listing.saves}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Showings:</span>
                  <span className="font-medium">{listing.showings}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Offers:</span>
                  <span className="font-medium text-green-600">{listing.offers}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Days on Market: {listing.daysOnMarket}</span>
              <span className="text-gray-600">Agent: {listing.agent}</span>
            </div>

            {listing.status === 'sold' && (
              <div className="p-2 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">
                  <strong>Sold:</strong> {formatCurrency(listing.soldPrice)} on {new Date(listing.soldDate).toLocaleDateString()}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" className="flex-1">
                <Eye className="w-4 h-4 mr-1" />
                View
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <BarChart3 className="w-4 h-4 mr-1" />
                Analytics
              </Button>
              <Button variant="outline" size="sm">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const ListingDialog = () => (
    <Dialog open={showListingDialog} onOpenChange={setShowListingDialog}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Listing</DialogTitle>
          <DialogDescription>
            Add a new property listing to your portfolio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Property Address *</Label>
            <Input
              id="address"
              value={listingForm.address}
              onChange={(e) => setListingForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={listingForm.city}
                onChange={(e) => setListingForm(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Miami"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select value={listingForm.state} onValueChange={(value) => setListingForm(prev => ({ ...prev, state: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FL">Florida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={listingForm.zipCode}
                onChange={(e) => setListingForm(prev => ({ ...prev, zipCode: e.target.value }))}
                placeholder="33139"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Listing Price *</Label>
              <Input
                id="price"
                type="number"
                value={listingForm.price}
                onChange={(e) => setListingForm(prev => ({ ...prev, price: e.target.value }))}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyType">Property Type</Label>
              <Select value={listingForm.propertyType} onValueChange={(value) => setListingForm(prev => ({ ...prev, propertyType: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single Family">Single Family</SelectItem>
                  <SelectItem value="Condo">Condo</SelectItem>
                  <SelectItem value="Townhouse">Townhouse</SelectItem>
                  <SelectItem value="Multi-Family">Multi-Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input
                id="bedrooms"
                type="number"
                value={listingForm.bedrooms}
                onChange={(e) => setListingForm(prev => ({ ...prev, bedrooms: e.target.value }))}
                placeholder="3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                type="number"
                step="0.5"
                value={listingForm.bathrooms}
                onChange={(e) => setListingForm(prev => ({ ...prev, bathrooms: e.target.value }))}
                placeholder="2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="squareFeet">Square Feet</Label>
              <Input
                id="squareFeet"
                type="number"
                value={listingForm.squareFeet}
                onChange={(e) => setListingForm(prev => ({ ...prev, squareFeet: e.target.value }))}
                placeholder="1800"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={listingForm.description}
              onChange={(e) => setListingForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the property features and highlights..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="features">Features</Label>
            <Input
              id="features"
              value={listingForm.features}
              onChange={(e) => setListingForm(prev => ({ ...prev, features: e.target.value }))}
              placeholder="Pool, Garage, Waterfront (comma separated)"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowListingDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateListing}>
            Create Listing
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
          <h1 className="text-2xl font-bold">Listing Management</h1>
          <p className="text-gray-600">
            Manage your property listings and track performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowListingDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Listing
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{listings.length}</div>
            <p className="text-xs text-muted-foreground">
              Active portfolio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {listings.filter(l => l.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently marketed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Days on Market</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(listings.reduce((sum, l) => sum + l.daysOnMarket, 0) / listings.length)}
            </div>
            <p className="text-xs text-muted-foreground">
              Market average: 45 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {listings.reduce((sum, l) => sum + l.views, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Listings Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All Listings ({listings.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({listings.filter(l => l.status === 'active').length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({listings.filter(l => l.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="sold">Sold ({listings.filter(l => l.status === 'sold').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-6">
          {filteredListings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium mb-2">No listings found</h3>
              <p className="text-gray-600 mb-4">
                {selectedTab === 'all' 
                  ? "You haven't created any listings yet" 
                  : `No ${selectedTab} listings at this time`
                }
              </p>
              <Button onClick={() => setShowListingDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Listing
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ListingDialog />
    </div>
  );
};

export default BrokerListings;