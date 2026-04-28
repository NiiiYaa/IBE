export type ConnectionStatus = 'disconnected' | 'qr' | 'connected'
export type ClientContext = { orgId?: number; propertyId?: number }

export function clientKey(ctx: ClientContext): string {
  if (ctx.propertyId) return `property-${ctx.propertyId}`
  if (ctx.orgId) return `org-${ctx.orgId}`
  return 'system'
}

export type OnMessageFn = (from: string, body: string, ctx: ClientContext, myPhone?: string) => Promise<string>
export type OnReadyFn = (phone: string, ctx: ClientContext) => void
