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

// Affimaro software subscriptions are separate from merchant affiliate payouts.
export const billingAccounts=sqliteTable('billing_accounts',{
  id:text('id').primaryKey(),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  platformId:text('platform_id').notNull(),
  mode:text('mode').notNull(),
  customerId:text('customer_id'),
  subscriptionId:text('subscription_id'),
  priceId:text('price_id'),
  amount:integer('amount'),
  status:text('status').notNull().default('none'),
  invoicePaid:integer('invoice_paid').notNull().default(0),
  periodStart:integer('period_start'),
  periodEnd:integer('period_end'),
  cancelAtPeriodEnd:integer('cancel_at_period_end').notNull().default(0),
  lastVerifiedAt:text('last_verified_at'),
  lastError:text('last_error'),
  leaseId:text('lease_id'),
  leaseUntil:text('lease_until'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('billing_workspace_platform_mode').on(t.workspaceId,t.platformId,t.mode),uniqueIndex('billing_remote_subscription').on(t.platformId,t.mode,t.subscriptionId),check('billing_account_mode',sql`${t.mode} IN ('test','live')`),check('billing_status',sql`${t.status} IN ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')`),check('billing_flags',sql`${t.invoicePaid} IN (0,1) AND ${t.cancelAtPeriodEnd} IN (0,1)`),check('billing_amount',sql`${t.amount} IS NULL OR ${t.amount} BETWEEN 1 AND 99999999`)]);

export const billingCheckouts=sqliteTable('billing_checkouts',{
  id:text('id').primaryKey(),
  accountId:text('account_id').notNull().references(()=>billingAccounts.id),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  priceId:text('price_id').notNull(),
  amount:integer('amount').notNull(),
  returnOrigin:text('return_origin').notNull().default('https://affimaro-preview.kindsky66.chatgpt.site'),
  customerSnapshot:text('customer_snapshot'),
  payloadVersion:integer('payload_version').notNull().default(1),
  integrationSuffix:text('integration_suffix'),
  state:text('state').notNull(),
  sessionId:text('session_id'),
  encryptedUrl:text('encrypted_url'),
  expiresAt:integer('expires_at'),
  firstSubmittedAt:text('first_submitted_at').notNull(),
  lastError:text('last_error'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[index('billing_checkout_workspace').on(t.workspaceId,t.createdAt),uniqueIndex('billing_checkout_active').on(t.accountId).where(sql`${t.state} IN ('creating','open','review')`),uniqueIndex('billing_checkout_session').on(t.sessionId),check('billing_checkout_state',sql`${t.state} IN ('creating','open','review','expired','completed')`),check('billing_checkout_amount',sql`${t.amount} BETWEEN 1 AND 99999999`)]);

// Used only by the independent deployment. Sites keeps its own authentication.
export const authIdentities=sqliteTable('auth_identities',{
  providerId:text('provider_id').primaryKey(),
  userId:text('user_id').notNull().references(()=>accounts.id),
  createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('auth_identity_user_unique').on(t.userId)]);
export const authSessions=sqliteTable('auth_sessions',{
  id:text('id').primaryKey(),
  tokenHash:text('token_hash').notNull(),
  providerId:text('provider_id').notNull().references(()=>authIdentities.providerId),
  userId:text('user_id').notNull().references(()=>accounts.id),
  encryptedTokens:text('encrypted_tokens').notNull(),
  recoveryOnly:integer('recovery_only').notNull().default(0),
  expiresAt:integer('expires_at').notNull(),
  leaseId:text('lease_id'),
  leaseUntil:integer('lease_until'),
  createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('auth_session_token').on(t.tokenHash),index('auth_session_user').on(t.userId),check('auth_recovery_flag',sql`${t.recoveryOnly} IN (0,1)`)]);
export const authRateLimits=sqliteTable('auth_rate_limits',{
  id:text('id').primaryKey(),
  count:integer('count').notNull(),
  expiresAt:integer('expires_at').notNull(),
},t=>[index('auth_rate_expiry').on(t.expiresAt),check('auth_rate_count',sql`${t.count}>0`)]);

// Platform admission is distinct from an affiliate's application to a brand.
export const platformApplications=sqliteTable('platform_applications',{
  userId:text('user_id').primaryKey().references(()=>accounts.id),
  portal:text('portal').notNull(),
  status:text('status').notNull().default('draft'),
  profileJson:text('profile_json').notNull().default('{}'),
  revision:integer('revision').notNull().default(1),
  submittedAt:text('submitted_at'),
  reviewedAt:text('reviewed_at'),
  reviewedBy:text('reviewed_by').references(()=>accounts.id),
  reviewNote:text('review_note').notNull().default(''),
  transitionId:text('transition_id'),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[index('platform_application_queue').on(t.status,t.submittedAt),check('platform_application_portal',sql`${t.portal} IN ('brand','affiliate')`),check('platform_application_status',sql`${t.status} IN ('draft','pending','changes_requested','approved','rejected')`),check('platform_application_revision',sql`${t.revision}>0`)]);
export const platformAdmins=sqliteTable('platform_admins',{
  userId:text('user_id').primaryKey().references(()=>accounts.id),
  grantedAt:text('granted_at').notNull(),
});
export const platformReviewEvents=sqliteTable('platform_review_events',{
  id:text('id').primaryKey(),
  applicantId:text('applicant_id').notNull().references(()=>platformApplications.userId),
  actorId:text('actor_id').notNull().references(()=>accounts.id),
  action:text('action').notNull(),
  revision:integer('revision').notNull(),
  note:text('note').notNull().default(''),
  createdAt:text('created_at').notNull(),
},t=>[index('platform_review_history').on(t.applicantId,t.createdAt)]);

// The exact portal is separate from the existing business/publisher accounting family.
export const accountPortals=sqliteTable('account_portals',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),portal:text('portal').notNull(),createdAt:text('created_at').notNull(),
},t=>[check('account_portal_type',sql`${t.portal} IN ('brand','affiliate','creator','agency')`)]);
export const planRequests=sqliteTable('plan_requests',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),requestedPlan:text('requested_plan').notNull(),activePlan:text('active_plan'),status:text('status').notNull().default('pending'),revision:integer('revision').notNull().default(1),reviewNote:text('review_note').notNull().default(''),updatedAt:text('updated_at').notNull(),
},t=>[check('requested_plan_type',sql`${t.requestedPlan} IN ('starter','growth','business')`),check('active_plan_type',sql`${t.activePlan} IS NULL OR ${t.activePlan} IN ('starter','growth','business')`),check('plan_request_status',sql`${t.status} IN ('pending','approved','rejected')`),check('plan_request_revision',sql`${t.revision}>0`)]);
export const agencyClients=sqliteTable('agency_clients',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),name:text('name').notNull(),website:text('website').notNull(),contact:text('contact').notNull().default(''),status:text('status').notNull(),notes:text('notes').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('agency_clients_owner').on(t.userId),check('agency_client_status',sql`${t.status} IN ('prospect','active','on_hold','archived')`)]);
export const creatorContent=sqliteTable('creator_content',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),applicationId:text('application_id').references(()=>applications.id),title:text('title').notNull(),platform:text('platform').notNull(),status:text('status').notNull(),url:text('url'),notes:text('notes').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('creator_content_owner').on(t.userId),check('creator_content_status',sql`${t.status} IN ('idea','draft','published','archived')`)]);

// Independent platform subscription credentials; never merchant connections.
export const platformBillingSettings=sqliteTable('platform_billing_settings',{
 publishableKey:text('publishable_key'),
 id:text('id').primaryKey(),setupId:text('setup_id').notNull(),accountId:text('account_id').notNull(),mode:text('mode').notNull(),origin:text('origin').notNull(),
 encryptedCredential:text('encrypted_credential').notNull(),webhookPayload:text('webhook_payload').notNull(),portalPayload:text('portal_payload').notNull(),portalConfigurationId:text('portal_configuration_id'),encryptedWebhookSecret:text('encrypted_webhook_secret'),webhookId:text('webhook_id'),status:text('status').notNull(),
 configuredBy:text('configured_by').notNull().references(()=>accounts.id),leaseId:text('lease_id'),leaseUntil:text('lease_until'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[check('platform_billing_singleton',sql`${t.id}='stripe'`),check('platform_billing_mode',sql`${t.mode} IN ('test','live')`),check('platform_billing_status',sql`${t.status} IN ('pending','ready')`)]);
export const billingWebhookEvents=sqliteTable('billing_webhook_events',{
 eventId:text('event_id').primaryKey(),status:text('status').notNull(),leaseId:text('lease_id').notNull(),leaseUntil:text('lease_until').notNull(),createdAt:text('created_at').notNull(),processedAt:text('processed_at'),
},t=>[check('billing_webhook_status',sql`${t.status} IN ('processing','processed')`)]);

export const accountClosures=sqliteTable('account_closures',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),reason:text('reason').notNull().default(''),closedAt:text('closed_at').notNull(),
});
export const mediaProperties=sqliteTable('media_properties',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),kind:text('kind').notNull(),platform:text('platform').notNull(),name:text('name').notNull(),url:text('url').notNull(),relationship:text('relationship').notNull(),description:text('description').notNull().default(''),audience:text('audience').notNull().default(''),language:text('language').notNull().default('English'),challenge:text('challenge').notNull(),challengeExpiresAt:text('challenge_expires_at').notNull(),method:text('method').notNull(),status:text('status').notNull(),proofUrl:text('proof_url').notNull().default(''),reviewNote:text('review_note').notNull().default(''),verifiedAt:text('verified_at'),lastCheckedAt:text('last_checked_at'),revision:integer('revision').notNull().default(1),archived:integer('archived').notNull().default(0),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('media_property_user').on(t.userId,t.archived),index('media_property_queue').on(t.status,t.updatedAt),check('media_property_status',sql`${t.status} IN ('unverified','review_pending','verified','changes_requested','revoked')`),check('media_property_method',sql`${t.method} IN ('dns_txt','public_challenge')`),check('media_property_archived',sql`${t.archived} IN (0,1) AND ${t.revision}>0`)]);
export const mediaPropertyReviews=sqliteTable('media_property_reviews',{
 id:text('id').primaryKey(),propertyId:text('property_id').notNull().references(()=>mediaProperties.id),actorId:text('actor_id').notNull().references(()=>accounts.id),decision:text('decision').notNull(),note:text('note').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('media_review_property').on(t.propertyId,t.createdAt)]);

export const discoveryListings=sqliteTable('discovery_listings',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),listed:integer('listed').notNull().default(0),updatedAt:text('updated_at').notNull(),
},t=>[check('discovery_listed',sql`${t.listed} IN (0,1)`)]);
export const discoverySaved=sqliteTable('discovery_saved',{
 userId:text('user_id').notNull().references(()=>accounts.id),targetId:text('target_id').notNull().references(()=>accounts.id),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('discovery_saved_pair').on(t.userId,t.targetId)]);
export const discoveryInvitations=sqliteTable('discovery_invitations',{
 id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>accounts.id),recipientId:text('recipient_id').notNull().references(()=>accounts.id),programId:text('program_id').notNull().references(()=>programs.id),note:text('note').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('discovery_invite_inbox').on(t.recipientId,t.status),index('discovery_invite_sender').on(t.senderId,t.createdAt),uniqueIndex('discovery_invite_pending').on(t.programId,t.recipientId).where(sql`${t.status}='pending'`),check('discovery_invite_status',sql`${t.status} IN ('pending','accepted','declined','withdrawn')`)]);

export const programResources=sqliteTable('program_resources',{
 id:text('id').primaryKey(),programId:text('program_id').notNull().references(()=>programs.id),applicationId:text('application_id').references(()=>applications.id),kind:text('kind').notNull(),title:text('title').notNull(),description:text('description').notNull().default(''),url:text('url').notNull().default(''),body:text('body').notNull().default(''),status:text('status').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('program_resource_scope').on(t.programId,t.status,t.applicationId),check('program_resource_kind',sql`${t.kind} IN ('banner','image','text','document')`),check('program_resource_status',sql`${t.status} IN ('active','archived') AND ${t.revision}>0`)]);
export const programCoupons=sqliteTable('program_coupons',{
 id:text('id').primaryKey(),programId:text('program_id').notNull().references(()=>programs.id),applicationId:text('application_id').references(()=>applications.id),code:text('code').notNull(),title:text('title').notNull(),terms:text('terms').notNull(),startsAt:text('starts_at'),expiresAt:text('expires_at'),status:text('status').notNull(),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('program_coupon_scope').on(t.programId,t.status,t.applicationId),check('program_coupon_status',sql`${t.status} IN ('active','archived') AND ${t.revision}>0`)]);
export const linkClicks=sqliteTable('link_clicks',{
 id:text('id').primaryKey(),applicationId:text('application_id').notNull().references(()=>applications.id),source:text('source').notNull(),medium:text('medium').notNull(),referrerHost:text('referrer_host').notNull(),device:text('device').notNull(),country:text('country').notNull(),clickedAt:text('clicked_at').notNull(),
},t=>[index('link_click_application_time').on(t.applicationId,t.clickedAt),index('link_click_retention').on(t.clickedAt)]);

export const accountPreferences=sqliteTable('account_preferences',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),preferencesJson:text('preferences_json').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
},t=>[check('account_preferences_valid',sql`json_valid(${t.preferencesJson}) AND ${t.revision}>0`)]);

export const contactMessages=sqliteTable('contact_messages',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull(),topic:text('topic').notNull(),message:text('message').notNull(),
 status:text('status').notNull().default('new'),revision:integer('revision').notNull().default(1),emailHash:text('email_hash').notNull(),networkHash:text('network_hash').notNull(),payloadHash:text('payload_hash').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('contact_message_queue').on(t.status,t.createdAt),index('contact_message_email_window').on(t.emailHash,t.createdAt),index('contact_message_network_window').on(t.networkHash,t.createdAt),check('contact_message_status',sql`${t.status} IN ('new','in_progress','closed') AND ${t.revision}>0`),check('contact_message_topic',sql`${t.topic} IN ('general','account','integration','billing','partnership','other')`)]);

export const contactEmailSettings=sqliteTable('contact_email_settings',{
 id:text('id').primaryKey(),encryptedCredential:text('encrypted_credential').notNull(),enabled:integer('enabled').notNull().default(0),revision:integer('revision').notNull().default(1),configuredBy:text('configured_by').notNull().references(()=>accounts.id),updatedAt:text('updated_at').notNull(),
},t=>[check('contact_email_singleton',sql`${t.id}='resend' AND ${t.enabled} IN (0,1) AND ${t.revision}>0`)]);

export const contactReceipts=sqliteTable('contact_receipts',{
 number:integer('number').primaryKey({autoIncrement:true}),messageId:text('message_id').notNull().references(()=>contactMessages.id),status:text('status').notNull().default('pending'),payloadJson:text('payload_json'),attempts:integer('attempts').notNull().default(0),firstAttemptAt:text('first_attempt_at'),lastAttemptAt:text('last_attempt_at'),leaseId:text('lease_id'),leaseUntil:text('lease_until'),providerId:text('provider_id'),acceptedAt:text('accepted_at'),
},t=>[uniqueIndex('contact_receipt_message').on(t.messageId),check('contact_receipt_state',sql`${t.status} IN ('pending','failed','accepted','review') AND ${t.number}>0 AND ${t.number}<90000000 AND ${t.attempts}>=0`)]);

// Private, owner-reviewed identity evidence for commission recipients.
export const identityVerifications=sqliteTable('identity_verifications',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),submissionId:text('submission_id').notNull(),requiredDocuments:integer('required_documents').notNull(),status:text('status').notNull(),revision:integer('revision').notNull(),encryptedProfile:text('encrypted_profile').notNull(),submittedAt:text('submitted_at').notNull(),reviewedAt:text('reviewed_at'),reviewerId:text('reviewer_id').references(()=>accounts.id),reviewToken:text('review_token'),reason:text('reason'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('identity_submission_unique').on(t.submissionId),index('identity_review_queue').on(t.status,t.updatedAt),check('identity_status_valid',sql`${t.status} IN ('pending','approved','changes_requested','rejected','revoked') AND ${t.revision}>0 AND ${t.requiredDocuments} IN (2,3)`)]);
export const identityDocuments=sqliteTable('identity_documents',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),submissionId:text('submission_id').notNull(),slot:text('slot').notNull(),encryptedContent:text('encrypted_content').notNull(),bytes:integer('bytes').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[uniqueIndex('identity_document_slot').on(t.userId,t.submissionId,t.slot),index('identity_document_expiry').on(t.expiresAt),check('identity_document_valid',sql`${t.slot} IN ('front','back','selfie') AND ${t.bytes} BETWEEN 1 AND 512000`)]);
export const identityReviewEvents=sqliteTable('identity_review_events',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.id),submissionId:text('submission_id').notNull(),actorId:text('actor_id').notNull().references(()=>accounts.id),action:text('action').notNull(),documentSlot:text('document_slot'),revision:integer('revision').notNull(),reason:text('reason'),createdAt:text('created_at').notNull(),
},t=>[index('identity_review_history').on(t.userId,t.createdAt),check('identity_event_valid',sql`${t.action} IN ('submitted','document_viewed','approved','changes_requested','rejected','revoked') AND ${t.revision}>0 AND (${t.documentSlot} IS NULL OR ${t.documentSlot} IN ('front','back','selfie'))`)]);

export const memberProfiles=sqliteTable('member_profiles',{
 userId:text('user_id').primaryKey().references(()=>accounts.id),firstName:text('first_name').notNull().default(''),lastName:text('last_name').notNull().default(''),jobTitle:text('job_title').notNull().default(''),workPhone:text('work_phone').notNull().default(''),mobilePhone:text('mobile_phone').notNull().default(''),avatarJpeg:text('avatar_jpeg'),revision:integer('revision').notNull(),transitionId:text('transition_id').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[check('member_profile_valid',sql`${t.revision}>0 AND (${t.avatarJpeg} IS NULL OR length(${t.avatarJpeg})<=60000)`)]);
