import { supabase } from '@/lib/supabase'

export interface SubscriptionStatus {
  hasActiveSubscription: boolean
  subscriptionTier?: string
  isLoading: boolean
}

export async function checkUserSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  try {
    // Get user's firm membership
    const { data: membership, error: membershipError } = await supabase
      .from('firm_memberships')
      .select('firm_id, role')
      .eq('user_id', userId)
      .single()

    if (membershipError || !membership) {
      return { hasActiveSubscription: false, isLoading: false }
    }

    // Get firm's subscription status
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('subscription_status, subscription_tier')
      .eq('id', membership.firm_id)
      .single()

    if (firmError || !firm) {
      return { hasActiveSubscription: false, isLoading: false }
    }

    return {
      hasActiveSubscription: firm.subscription_status === 'active',
      subscriptionTier: firm.subscription_tier,
      isLoading: false
    }
  } catch (error) {
    console.error('Error checking subscription status:', error)
    return { hasActiveSubscription: false, isLoading: false }
  }
}
