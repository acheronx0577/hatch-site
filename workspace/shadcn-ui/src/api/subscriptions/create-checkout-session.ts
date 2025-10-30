import { supabase } from '@/lib/supabase'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
})

export async function createCheckoutSession(priceId: string, userId: string) {
  try {
    // Get user's firm information
    const { data: membership } = await supabase
      .from('firm_memberships')
      .select('firm_id')
      .eq('user_id', userId)
      .eq('role', 'primary_broker')
      .single()

    if (!membership) {
      throw new Error('User must be a primary broker to create subscriptions')
    }

    // Get firm details
    const { data: firm } = await supabase
      .from('firms')
      .select('*')
      .eq('id', membership.firm_id)
      .single()

    if (!firm) {
      throw new Error('Firm not found')
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/broker/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing?canceled=true`,
      customer_email: firm.primary_contact_email,
      metadata: {
        userId,
        firmId: membership.firm_id,
      },
    })

    return { url: session.url }
  } catch (error) {
    console.error('Error creating checkout session:', error)
    throw error
  }
}
