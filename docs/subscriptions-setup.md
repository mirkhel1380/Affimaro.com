# Packages, review and subscription payment

Brand plans are Starter $19, Growth $49 and Business $99 USD per month. Agency plans are Starter $39, Growth $79 and Business $149 USD per month. Creator and affiliate accounts are free. All four account types need email verification, a complete role-specific application and an explicit owner approval.

| Package | Approved program partners | Agency client-directory records |
| --- | ---: | ---: |
| Starter | 100 | 5 |
| Growth | 500 | 25 |
| Business | 2,000 | 100 |

Every package currently supports one connected website, one program and one account owner. Agency directory entries are contact/engagement records; they do not connect another website or grant access to another brand account.

## Choose a package

The public Pricing buttons open account selection with the selected package. Brand and agency registration preserve that package through the sealed authentication flow and into the application. The applicant can review the choice before submitting. Owner approval opens the matching portal and saves the approved capacity package.

Approved brand accounts use Packages & billing at `/billing`. Agencies use `/agency/billing`. After profile approval, package selection proceeds directly to payment without a second owner review. Selection alone preserves existing paid capacity; verified live subscription payment activates the purchased package automatically. Historical pending selections can also proceed directly to payment. Downgrades are blocked while approved-partner or agency-directory usage exceeds the target package.

Package selection and capacity approval do not charge a card, create a Stripe subscription, mark an invoice paid, alter an existing subscription or send a partner payment.

## Configure subscription checkout

Configure the existing billing account and restricted Stripe key separately from partner payment connections. Keep the payment-data encryption key unchanged. This release reads:

- `AFFIMARO_BILLING_STRIPE_KEY`
- `AFFIMARO_BILLING_ACCOUNT_ID`
- `AFFIMARO_STARTER_PRICE_ID` — fixed $19 USD monthly price (1900 minor units)
- `AFFIMARO_GROWTH_PRICE_ID` — fixed $49 USD monthly price (4900 minor units)
- `AFFIMARO_BUSINESS_PRICE_ID` — fixed $99 USD monthly price (9900 minor units)
- `AFFIMARO_BILLING_MODE` (`test` or `live`)
- `AFFIMARO_BILLING_LIVE_ENABLED` and `AFFIMARO_BILLING_REQUIRED`

A missing price configuration does not disable package selection or the initial profile review. The private billing page explains the payment setup still needed and does not offer an unusable checkout button. A test checkout does not provide live paid entitlement. Live paid actions, when billing is required, need a recently verified paid subscription matching the paid package’s exact price and amount.

Every checkout retrieves the provider price, checks the account, mode, fixed monthly currency and approved amount, and shows an explicit review before creating a hosted checkout. An existing subscription is managed before any replacement; package approval does not silently modify it. No provider credentials, real checkout, charge, customer email or external payment was created by the four-portal update.

## Data and access

Exact account roles are stored server-side in `account_portals`. Existing brand/affiliate financial identifiers and records remain in their original accounting families. `plan_requests` stores requested and active package capacity; it is separate from Stripe’s billing tables. The owner-private native Site remains paused for the completed independent migration; its private links hand off to the independent host.

## On-site subscription payments

Migration `0014` adds a nullable public-key setting to the existing platform billing row. The owner enables **Payments inside Affimaro** in `/owner/settings` with the live publishable key from the already connected Stripe account. The restricted key, signed webhook, prices, original encryption keys and customer subscriptions are preserved. New sessions use the documented Endive `ui_mode=embedded_page` and Stripe.js `createEmbeddedCheckoutPage`, loaded directly from `https://js.stripe.com/endive/stripe.js` only when a customer opens payment. Card details go directly to Stripe; they do not enter Affimaro’s backend. Required bank authentication can still open the bank’s approval flow.

Version 3 freezes the embedded request and return origin. Version 2 hosted checkouts keep their original request and idempotency key so an existing payment is never silently replaced. Client secrets are returned only through the approved, same-origin customer API, never stored, logged or put in URLs. Reopening resumes the same session. Client completion alone does not activate access: the server rechecks the saved session, paid subscription invoice, exact price, account, mode, customer and metadata. Signed webhook fulfillment uses the same verification and activates capacity automatically.

Setup changes never create a customer charge. Without a saved publishable key, existing hosted checkout remains available; do not claim on-site payments are enabled before the owner saves this setting. Stripe’s form retains its required disclosures and payment authentication.
