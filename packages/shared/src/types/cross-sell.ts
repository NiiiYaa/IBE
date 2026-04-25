export type CrossSellPricingModel = 'per_item' | 'per_night'
export type CrossSellProductStatus = 'active' | 'inactive'
export type CrossSellPaymentMode = 'informational' | 'online'

export interface CrossSellProduct {
  id: number
  name: string
  description: string
  imageUrl: string | null
  price: number
  tax: number
  pricingModel: CrossSellPricingModel
  currency: string
  status: CrossSellProductStatus
  sortOrder: number
}

export interface CrossSellConfig {
  enabled: boolean
  paymentMode: CrossSellPaymentMode
  showExternalEvents: boolean
  products: CrossSellProduct[]
}

export interface CrossSellProductCreate {
  name: string
  description: string
  imageUrl?: string | null
  price: number
  tax: number
  pricingModel: CrossSellPricingModel
  currency: string
  status: CrossSellProductStatus
  sortOrder?: number
}

export interface CrossSellProductUpdate {
  name?: string
  description?: string
  imageUrl?: string | null
  price?: number
  tax?: number
  pricingModel?: CrossSellPricingModel
  currency?: string
  status?: CrossSellProductStatus
  sortOrder?: number
}

export interface CrossSellConfigUpdate {
  enabled?: boolean
  paymentMode?: CrossSellPaymentMode
  showExternalEvents?: boolean
}

// Public endpoint response (active products only)
export interface PublicCrossellResponse {
  enabled: boolean
  paymentMode: CrossSellPaymentMode
  showExternalEvents: boolean
  products: CrossSellProduct[]
}
