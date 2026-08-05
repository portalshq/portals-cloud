/**
 * Billing schema types for Stripe integration
 * These types correspond to the billing_* tables in the database
 * Designed for future migration to cloud application server
 */

export type BillingCustomer = {
  id: string // Stripe Customer ID
  email?: string
  name?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type ProductType = 'production-team' | 'studio' | 'studio-pilot' | 'onboarding'

export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'

export type BillingSubscription = {
  id: string // Stripe Subscription ID
  customerId: string
  productType: ProductType
  status: SubscriptionStatus
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
  cancelAtPeriodEnd: boolean
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export type BillingInvoice = {
  id: string // Stripe Invoice ID
  subscriptionId?: string
  customerId: string
  status: InvoiceStatus
  amount: number // Amount in cents
  currency: string
  dueDate?: Date
  paidAt?: Date
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type BillingPayment = {
  id: string // Stripe Payment Intent ID
  invoiceId?: string
  customerId: string
  amount: number // Amount in cents
  currency: string
  status: string
  productType?: ProductType
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type CheckoutSessionStatus = string | null

export type BillingCheckoutSession = {
  id: string // Stripe Session ID
  customerId?: string
  paymentIntentId?: string
  productType: ProductType
  status: CheckoutSessionStatus
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// Database row types
type BillingCustomerRow = {
  id: string
  email: string | null
  name: string | null
  metadata: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

type BillingSubscriptionRow = {
  id: string
  customer_id: string
  product_type: string
  status: string
  current_period_start: Date | string | null
  current_period_end: Date | string | null
  cancel_at_period_end: boolean
  metadata: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

type BillingInvoiceRow = {
  id: string
  subscription_id: string | null
  customer_id: string
  status: string
  amount: number
  currency: string
  due_date: Date | string | null
  paid_at: Date | string | null
  metadata: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

type BillingPaymentRow = {
  id: string
  invoice_id: string | null
  customer_id: string
  amount: number
  currency: string
  status: string
  product_type: string | null
  metadata: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

type BillingCheckoutSessionRow = {
  id: string
  customer_id: string | null
  payment_intent_id: string | null
  product_type: string
  status: string
  metadata: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

// Row to model converters
function billingCustomerFromRow(row: BillingCustomerRow): BillingCustomer {
  return {
    id: row.id,
    email: row.email || undefined,
    name: row.name || undefined,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function billingSubscriptionFromRow(row: BillingSubscriptionRow): BillingSubscription {
  return {
    id: row.id,
    customerId: row.customer_id,
    productType: row.product_type as ProductType,
    status: row.status as SubscriptionStatus,
    currentPeriodStart: row.current_period_start ? new Date(row.current_period_start) : undefined,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : undefined,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function billingInvoiceFromRow(row: BillingInvoiceRow): BillingInvoice {
  return {
    id: row.id,
    subscriptionId: row.subscription_id || undefined,
    customerId: row.customer_id,
    status: row.status as InvoiceStatus,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function billingPaymentFromRow(row: BillingPaymentRow): BillingPayment {
  return {
    id: row.id,
    invoiceId: row.invoice_id || undefined,
    customerId: row.customer_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    productType: row.product_type as ProductType | undefined,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function billingCheckoutSessionFromRow(row: BillingCheckoutSessionRow): BillingCheckoutSession {
  return {
    id: row.id,
    customerId: row.customer_id || undefined,
    paymentIntentId: row.payment_intent_id || undefined,
    productType: row.product_type as ProductType,
    status: row.status,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export {
  billingCustomerFromRow,
  billingSubscriptionFromRow,
  billingInvoiceFromRow,
  billingPaymentFromRow,
  billingCheckoutSessionFromRow,
}
