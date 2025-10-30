import Stripe from 'stripe'

// Initialize Stripe with secret key
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2025-08-27.basil',
})

export interface CreateCheckoutSessionParams {
  priceId: string
  userId: string
  userEmail: string
  successUrl: string
  cancelUrl: string
  planName: string
}

export async function createStripeCheckoutSession(params: CreateCheckoutSessionParams) {
  try {
    const { priceId, userId, userEmail, successUrl, cancelUrl, planName } = params

    // Create or retrieve customer
    let customer
    try {
      const existingCustomers = await stripe.customers.list({
        email: userEmail,
        limit: 1
      })
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0]
      } else {
        customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            userId: userId
          }
        })
      }
    } catch (error) {
      console.error('Error creating/retrieving customer:', error)
      throw new Error('Failed to create customer')
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId,
        planName: planName,
      },
      subscription_data: {
        metadata: {
          userId: userId,
          planName: planName,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    })

    return {
      sessionId: session.id,
      url: session.url,
    }
  } catch (error) {
    console.error('Error creating checkout session:', error)
    throw new Error('Failed to create checkout session')
  }
}

export async function createCustomerPortalSession(customerId: string, returnUrl: string) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })

    return {
      url: session.url,
    }
  } catch (error) {
    console.error('Error creating customer portal session:', error)
    throw new Error('Failed to create customer portal session')
  }
}

export async function getSubscriptionStatus(customerId: string) {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return {
        hasActiveSubscription: false,
        subscription: null,
      }
    }

    const subscription = subscriptions.data[0]
    return {
      hasActiveSubscription: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        priceId: subscription.items.data[0]?.price.id,
        planName: subscription.metadata.planName || 'Unknown',
      },
    }
  } catch (error) {
    console.error('Error getting subscription status:', error)
    return {
      hasActiveSubscription: false,
      subscription: null,
    }
  }
}

export async function handleStripeWebhook(payload: string, signature: string) {
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET
  
  if (!webhookSecret) {
    throw new Error('Missing Stripe webhook secret')
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session completed:', session.id)
        
        // Here you would update your database with the subscription info
        // await updateUserSubscription(session.metadata?.userId, session.subscription)
        break
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Payment succeeded:', invoice.id)
        
        // Handle successful recurring payment
        // await handleSuccessfulPayment(invoice)
        break
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Payment failed:', invoice.id)
        
        // Handle failed payment
        // await handleFailedPayment(invoice)
        break
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', subscription.id)
        
        // Handle subscription changes
        // await updateSubscriptionStatus(subscription)
        break
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription cancelled:', subscription.id)
        
        // Handle subscription cancellation
        // await handleSubscriptionCancellation(subscription)
        break
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return { received: true }
  } catch (error) {
    console.error('Webhook error:', error)
    throw error
  }
}

export { stripe }
