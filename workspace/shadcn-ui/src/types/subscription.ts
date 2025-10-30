export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  max_listings?: number;
  max_clients?: number;
  priority_support?: boolean;
  analytics_access?: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'inactive' | 'cancelled' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
}

export interface Firm {
  id: string;
  name: string;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  seats_purchased?: number | null;
  seats_used?: number | null;
  tier?: string | null;
  [key: string]: unknown;
}

export interface SubscriptionResponse {
  firm: Firm;
  membership: {
    firm_id: string;
    role?: string;
    status?: string;
    [key: string]: unknown;
  };
  current_plan: SubscriptionPlan;
  usage: {
    seats_used: number;
    seats_available: number;
    storage_used_gb: number;
    api_calls_used: number;
  };
  billing: {
    next_billing_date: Date;
    amount_due: number;
    payment_method: {
      type: string;
      last4?: string;
    };
  };
}

export interface UsageMetrics {
  listings_used: number;
  clients_used: number;
  max_listings: number;
  max_clients: number;
}

export interface BillingInfo {
  card_last_four?: string;
  card_brand?: string;
  billing_email?: string;
  billing_address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface PaymentMethod {
  id: string;
  type: 'card';
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  billing_details: Record<string, unknown>;
  created: number;
}

export interface Invoice {
  id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  created: number;
  due_date?: number;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  lines: {
    data: Array<{
      description?: string;
      amount: number;
      period?: {
        start: number;
        end: number;
      };
    }>;
  };
}

export interface SubscriptionContextType {
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  plans: SubscriptionPlan[];
  usage: UsageMetrics | null;
  billingInfo: BillingInfo | null;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  refreshSubscription: () => Promise<void>;
  updateSubscription: (planId: string) => Promise<boolean>;
  cancelSubscription: () => Promise<boolean>;
  updatePaymentMethod: (paymentMethodId: string) => Promise<boolean>;
  downloadInvoice: (invoiceId: string) => Promise<void>;
}

export const PRICING_PLANS: SubscriptionPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started.',
    price: 99,
    interval: 'month',
    features: ['Up to 5 seats', 'Standard support']
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'Ideal for growing brokerages.',
    price: 199,
    interval: 'month',
    features: ['Up to 15 seats', 'Priority support'],
    max_listings: 500,
    priority_support: true
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'Advanced analytics and automation.',
    price: 399,
    interval: 'month',
    features: ['Unlimited seats', 'Dedicated success manager'],
    max_listings: 2000,
    priority_support: true,
    analytics_access: true
  }
];
