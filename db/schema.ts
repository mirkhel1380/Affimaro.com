import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  website: text("website"),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("workspaces_owner_unique").on(t.ownerId)]);
export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(),
  windowDays: integer("window_days").notNull(),
  active: integer("active").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("programs_workspace_unique").on(t.workspaceId),check("program_rate_range",sql`${t.rateBps} BETWEEN 100 AND 5000`),check("program_window_range",sql`${t.windowDays} BETWEEN 1 AND 90`),check("program_active_boolean",sql`${t.active} IN (0,1)`)]);
export const affiliateProfiles = sqliteTable("affiliate_profiles", {
  userId: text("user_id").primaryKey().references(() => accounts.id),
  displayName: text("display_name").notNull(),
  channel: text("channel").notNull(),
  website: text("website"),
  bio: text("bio").notNull(),
  createdAt: text("created_at").notNull(),
});
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  programId: text("program_id").notNull().references(() => programs.id),
  affiliateUserId: text("affiliate_user_id").notNull().references(() => accounts.id),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("applications_program_user_unique").on(t.programId,t.affiliateUserId),index("applications_user_index").on(t.affiliateUserId),check("application_status_valid",sql`${t.status} IN ('pending','approved','suspended','rejected')`)]);
export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  actorId: text("actor_id").notNull().references(() => accounts.id),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("audit_workspace_index").on(t.workspaceId,t.createdAt)]);

// Server-only connection credentials must never be selected into page props.
export const storeConnections = sqliteTable("store_connections", {
  id:text("id").primaryKey(),
  workspaceId:text("workspace_id").notNull().references(()=>workspaces.id),
  storeUrl:text("store_url").notNull(),
  signingKey:text("signing_key").notNull(),
  active:integer("active").notNull(),
  lastSeen:text("last_seen"),
  createdAt:text("created_at").notNull(),
  platform:text("platform").notNull().default('woocommerce'),
},t=>[uniqueIndex("store_workspace_unique").on(t.workspaceId),check("store_active_boolean",sql`${t.active} IN (0,1)`)]);
export const referrals = sqliteTable("referrals", {
  id:text("id").primaryKey(),
  storeId:text("store_id").notNull().references(()=>storeConnections.id),
  applicationId:text("application_id").notNull().references(()=>applications.id),
  rateBps:integer("rate_bps").notNull(),
  createdAt:text("created_at").notNull(),
  expiresAt:text("expires_at").notNull(),
},t=>[index("referrals_application_index").on(t.applicationId),index("referrals_store_index").on(t.storeId)]);
export const orders = sqliteTable("orders", {
  id:text("id").primaryKey(),
  storeId:text("store_id").notNull().references(()=>storeConnections.id),
  referralId:text("referral_id").notNull().references(()=>referrals.id),
  applicationId:text("application_id").notNull().references(()=>applications.id),
  externalId:text("external_id").notNull(),
  revision:integer("revision").notNull(),
  currency:text("currency").notNull(),
  decimals:integer("decimals").notNull(),
  basis:integer("basis").notNull(),
  refundedBasis:integer("refunded_basis").notNull(),
  rateBps:integer("rate_bps").notNull(),
  commission:integer("commission").notNull(),
  status:text("status").notNull(),
  commissionState:text("commission_state").notNull(),
  needsReview:integer("needs_review").notNull(),
  createdAt:text("created_at").notNull(),
  receivedAt:text("received_at").notNull(),
},t=>[uniqueIndex("orders_store_external_unique").on(t.storeId,t.externalId),index("orders_application_index").on(t.applicationId),check("orders_amounts_valid",sql`${t.basis} >= 0 AND ${t.refundedBasis} >= 0 AND ${t.refundedBasis} <= ${t.basis} AND ${t.commission} >= 0`),check("orders_precision_valid",sql`${t.decimals} BETWEEN 0 AND 6`)]);
export const storeEvents = sqliteTable("store_events", {
  storeId:text("store_id").notNull().references(()=>storeConnections.id),
  eventId:text("event_id").notNull(),
  payloadHash:text("payload_hash").notNull(),
  response:text("response").notNull(),
  createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("store_event_unique").on(t.storeId,t.eventId)]);

export const bankProfiles=sqliteTable("bank_profiles",{
  userId:text("user_id").primaryKey().references(()=>accounts.id),
  encryptedDetails:text("encrypted_details").notNull(),
  accountHint:text("account_hint").notNull(),
  currency:text("currency").notNull(),
  updatedAt:text("updated_at").notNull(),
});
export const commissionApprovals=sqliteTable("commission_approvals",{
  orderId:text("order_id").primaryKey().references(()=>orders.id),
  amount:integer("amount").notNull(),
  revision:integer("revision").notNull(),
  approvedBy:text("approved_by").notNull().references(()=>accounts.id),
  approvedAt:text("approved_at").notNull(),
},t=>[check("approval_amount_valid",sql`${t.amount} >= 0`)]);
export const payoutRequests=sqliteTable("payout_requests",{
  id:text("id").primaryKey(),
  workspaceId:text("workspace_id").notNull().references(()=>workspaces.id),
  applicationId:text("application_id").notNull().references(()=>applications.id),
  affiliateUserId:text("affiliate_user_id").notNull().references(()=>accounts.id),
  currency:text("currency").notNull(),
  decimals:integer("decimals").notNull(),
  amount:integer("amount").notNull(),
  status:text("status").notNull(),
  method:text('method').notNull().default('bank'),
  reversedAmount:integer('reversed_amount').notNull().default(0),
  stripeTransferId:text('stripe_transfer_id'),
  encryptedDestination:text("encrypted_destination").notNull(),
  accountHint:text("account_hint").notNull(),
  reason:text("reason"),
  encryptedReceipt:text("encrypted_receipt"),
  referenceHash:text("reference_hash"),
  paidDate:text("paid_date"),
  paidBy:text("paid_by").references(()=>accounts.id),
  createdAt:text("created_at").notNull(),
  updatedAt:text("updated_at").notNull(),
},t=>[
  index("payout_user_index").on(t.affiliateUserId,t.createdAt),
  index("payout_workspace_index").on(t.workspaceId,t.createdAt),
  uniqueIndex("payout_reference_unique").on(t.workspaceId,t.referenceHash),
  uniqueIndex("payout_active_unique").on(t.applicationId,t.currency,t.decimals).where(sql`${t.status} IN ('requested','approved','processing')`),
  uniqueIndex('payout_stripe_transfer_unique').on(t.workspaceId,t.stripeTransferId),
  check("payout_status_valid",sql`${t.status} IN ('requested','approved','processing','paid','transferred','rejected','cancelled')`),
  check('payout_method_valid',sql`${t.method} IN ('bank','stripe')`),
  check('payout_reversal_valid',sql`${t.reversedAmount} BETWEEN 0 AND ${t.amount} AND (${t.method}='stripe' OR ${t.reversedAmount}=0)`),
  check('payout_stripe_currency',sql`${t.method}<>'stripe' OR (${t.currency}='USD' AND ${t.decimals}=2)`),
  check('payout_processing_method',sql`${t.status}<>'processing' OR ${t.method}='stripe'`),
  check('payout_transferred_fields',sql`${t.status}<>'transferred' OR (${t.method}='stripe' AND ${t.stripeTransferId} IS NOT NULL AND ${t.encryptedReceipt} IS NOT NULL AND ${t.paidDate} IS NOT NULL)`),
  check("payout_amount_valid",sql`${t.amount} BETWEEN 1 AND 1000000000000`),
  check("payout_decimals_valid",sql`${t.decimals} BETWEEN 0 AND 6`),
  check("payout_paid_fields",sql`${t.status} <> 'paid' OR (${t.encryptedReceipt} IS NOT NULL AND ${t.referenceHash} IS NOT NULL AND ${t.paidDate} IS NOT NULL AND ${t.paidBy} IS NOT NULL)`),
]);

export const shopifyAccounts=sqliteTable('shopify_accounts',{
  storeId:text('store_id').primaryKey().references(()=>storeConnections.id),
  shopDomain:text('shop_domain').notNull(),
  shopId:text('shop_id').notNull(),
  clientId:text('client_id').notNull(),
  encryptedSecret:text('encrypted_secret').notNull(),
  encryptedToken:text('encrypted_token').notNull(),
  tokenExpiresAt:text('token_expires_at').notNull(),
  scopes:text('scopes').notNull(),
  syncedThrough:text('synced_through'),
  syncSince:text('sync_since'),
  syncUntil:text('sync_until'),
  syncCursor:text('sync_cursor'),
  leaseId:text('lease_id'),
  leaseUntil:text('lease_until'),
  lastResult:text('last_result'),
});
export const shopifyPending=sqliteTable('shopify_pending',{
  storeId:text('store_id').notNull().references(()=>storeConnections.id),
  orderId:text('order_id').notNull(),
  reason:text('reason').notNull(),
  sourceRevision:integer('source_revision').notNull().default(0),
  updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('shopify_pending_order_unique').on(t.storeId,t.orderId)]);
export const programRuleRevisions=sqliteTable('program_rule_revisions',{
  id:text('id').primaryKey(),
  programId:text('program_id').notNull().references(()=>programs.id),
  rateBps:integer('rate_bps').notNull(),
  windowDays:integer('window_days').notNull(),
  active:integer('active').notNull(),
  effectiveAt:text('effective_at').notNull(),
},t=>[index('program_rule_time_index').on(t.programId,t.effectiveAt),check('rule_rate_valid',sql`${t.rateBps} BETWEEN 100 AND 5000`),check('rule_window_valid',sql`${t.windowDays} BETWEEN 1 AND 90`)]);

export const paymentConnections=sqliteTable('payment_connections',{
  id:text('id').primaryKey(),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  provider:text('provider').notNull(),
  mode:text('mode').notNull(),
  externalId:text('external_id').notNull(),
  label:text('label').notNull(),
  country:text('country'),
  currency:text('currency'),
  payoutsEnabled:integer('payouts_enabled'),
  status:text('status').notNull(),
  lastError:text('last_error'),
  encryptedCredential:text('encrypted_credential').notNull(),
  lastVerifiedAt:text('last_verified_at').notNull(),
  lastCheckedAt:text('last_checked_at').notNull(),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('payment_connection_workspace_provider').on(t.workspaceId,t.provider),check('payment_connection_provider',sql`${t.provider} IN ('stripe','wise')`),check('payment_connection_mode',sql`${t.mode} IN ('test','live')`),check('payment_connection_status',sql`${t.status} IN ('verified','attention')`)]);

export const stripeConnectSettings=sqliteTable('stripe_connect_settings',{
  workspaceId:text('workspace_id').primaryKey().references(()=>workspaces.id),
  connectionId:text('connection_id').notNull(),
  enabled:integer('enabled').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[check('stripe_setup_enabled_boolean',sql`${t.enabled} IN (0,1)`)]);
export const stripeRecipients=sqliteTable('stripe_recipients',{
  id:text('id').primaryKey(),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  applicationId:text('application_id').notNull().references(()=>applications.id),
  affiliateUserId:text('affiliate_user_id').notNull().references(()=>accounts.id),
  platformId:text('platform_id').notNull(),
  mode:text('mode').notNull(),
  country:text('country').notNull(),
  accountId:text('account_id'),
  state:text('state').notNull(),
  detailsSubmitted:integer('details_submitted').notNull().default(0),
  payoutsEnabled:integer('payouts_enabled').notNull().default(0),
  transfersActive:integer('transfers_active').notNull().default(0),
  requirementsCount:integer('requirements_count').notNull().default(0),
  lastError:text('last_error'),
  lastCheckedAt:text('last_checked_at'),
  createStartedAt:text('create_started_at'),
  leaseId:text('lease_id'),
  leaseUntil:text('lease_until'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('stripe_recipient_application_platform_mode').on(t.applicationId,t.platformId,t.mode),uniqueIndex('stripe_recipient_external_unique').on(t.platformId,t.mode,t.accountId),check('stripe_recipient_mode',sql`${t.mode} IN ('test','live')`),check('stripe_recipient_state',sql`${t.state} IN ('creating','needs_information','pending','ready','attention')`)]);

export const stripeTransferAttempts=sqliteTable('stripe_transfer_attempts',{
  id:text('id').primaryKey(),
  requestId:text('request_id').notNull().references(()=>payoutRequests.id),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  recipientId:text('recipient_id').notNull().references(()=>stripeRecipients.id),
  platformId:text('platform_id').notNull(),
  accountId:text('account_id').notNull(),
  amount:integer('amount').notNull(),
  state:text('state').notNull(),
  stripeTransferId:text('stripe_transfer_id'),
  firstSubmittedAt:text('first_submitted_at').notNull(),
  lastCheckedAt:text('last_checked_at'),
  lastError:text('last_error'),
  leaseId:text('lease_id'),
  leaseUntil:text('lease_until'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[index('stripe_attempt_request_index').on(t.requestId,t.createdAt),uniqueIndex('stripe_attempt_active_unique').on(t.requestId).where(sql`${t.state} IN ('processing','review')`),uniqueIndex('stripe_attempt_remote_unique').on(t.platformId,t.stripeTransferId),check('stripe_attempt_state',sql`${t.state} IN ('processing','review','failed','succeeded')`),check('stripe_attempt_amount',sql`${t.amount} BETWEEN 1 AND 99999999`)]);
