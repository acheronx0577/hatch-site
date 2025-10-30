import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  CreditCard,
  Lock,
  ArrowLeft,
  Check,
  Home as HomeIcon,
  Shield,
  Calendar,
  DollarSign
} from 'lucide-react'
import { HatchLogo } from '@/components/HatchLogo'

export default function Payment() {
  const navigate = useNavigate()
  const location = useLocation()
  const plan = location.state?.plan

  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    billingAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States'
  })

  const [processing, setProcessing] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setPaymentData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = matches && matches[0] || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)

    // Simulate payment processing
    setTimeout(() => {
      setProcessing(false)
      // In a real app, this would integrate with Stripe, PayPal, etc.
      navigate('/broker/payment-success', { 
        state: { 
          plan,
          paymentData: {
            ...paymentData,
            cardNumber: '**** **** **** ' + paymentData.cardNumber.slice(-4)
          }
        } 
      })
    }, 3000)
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Plan Selected</CardTitle>
            <CardDescription>Please select a plan first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/broker/pricing')}>
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            {/* Logo - Clickable Home Button */}
            <div
              className="flex items-center cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => navigate('/')}
            >
              <HomeIcon className="h-6 w-6 text-blue-600 mr-2" />
              <HatchLogo className="h-12 md:h-16" />
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/broker/pricing')}
                className="flex items-center"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Pricing
              </Button>
            </nav>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Complete Your Subscription
            </h1>
            <p className="text-gray-600">
              You're just one step away from accessing all the powerful features of Hatch
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="w-5 h-5 mr-2" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg">{plan.name} Plan</h3>
                    <p className="text-gray-600 capitalize">{plan.billing} billing</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800">
                    Selected
                  </Badge>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-2xl text-blue-600">
                      ${plan.price}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Billed {plan.billing}
                  </p>
                </div>

                {plan.billing === 'yearly' && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center text-green-800">
                      <Check className="w-4 h-4 mr-2" />
                      <span className="font-semibold">You're saving 17%</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Compared to monthly billing
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-4 border-t">
                  <h4 className="font-semibold text-gray-900">What's included:</h4>
                  <div className="space-y-1">
                    {plan.name === 'Starter' && (
                      <>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Up to 25 active listings
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Basic lead management
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Email support
                        </div>
                      </>
                    )}
                    {plan.name === 'Professional' && (
                      <>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Up to 100 active listings
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Bulk upload system
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Team collaboration (5 users)
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Advanced analytics
                        </div>
                      </>
                    )}
                    {plan.name === 'Enterprise' && (
                      <>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Unlimited listings
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Unlimited team members
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          24/7 phone support
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          White-label solution
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Payment Information
                </CardTitle>
                <CardDescription>
                  Your payment information is secure and encrypted
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      placeholder="1234 5678 9012 3456"
                      value={paymentData.cardNumber}
                      onChange={(e) => handleInputChange('cardNumber', formatCardNumber(e.target.value))}
                      maxLength={19}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        placeholder="MM/YY"
                        value={paymentData.expiryDate}
                        onChange={(e) => handleInputChange('expiryDate', formatExpiryDate(e.target.value))}
                        maxLength={5}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        placeholder="123"
                        value={paymentData.cvv}
                        onChange={(e) => handleInputChange('cvv', e.target.value.replace(/\D/g, ''))}
                        maxLength={4}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cardholderName">Cardholder Name</Label>
                    <Input
                      id="cardholderName"
                      placeholder="John Doe"
                      value={paymentData.cardholderName}
                      onChange={(e) => handleInputChange('cardholderName', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="billingAddress">Billing Address</Label>
                    <Input
                      id="billingAddress"
                      placeholder="123 Main Street"
                      value={paymentData.billingAddress}
                      onChange={(e) => handleInputChange('billingAddress', e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="New York"
                        value={paymentData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        placeholder="NY"
                        value={paymentData.state}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      placeholder="10001"
                      value={paymentData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value.replace(/\D/g, ''))}
                      maxLength={5}
                      required
                    />
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center text-sm text-gray-600">
                      <Shield className="w-4 h-4 mr-2" />
                      <span>Your payment information is encrypted and secure</span>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg"
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Complete Payment - ${plan.price}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    By completing this purchase, you agree to our Terms of Service and Privacy Policy. 
                    You can cancel your subscription at any time.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
