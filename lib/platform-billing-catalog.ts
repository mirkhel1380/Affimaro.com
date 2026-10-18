import type {Plan} from './plan-requests';
// Public identifiers selected and verified in the owner's existing Stripe account.
export const platformBillingCatalog={
 accountId:'acct_1URuU7EOXOLDxQKu',mode:'live' as const,
 prices:{starter:'price_1URvUfEOXOLDxQKughiotpTR',growth:'price_1URvUlEOXOLDxQKuFFbRqBtg',business:'price_1URvUrEOXOLDxQKuXuGlQodx'} as Record<Plan,string>,
};
export const subscriptionEvents=[
 'checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired',
 'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed',
] as const;
