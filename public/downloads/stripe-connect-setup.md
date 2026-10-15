# Stripe receiving-account setup

This pilot lets a business enable Stripe-hosted Express receiving-account setup for approved affiliates. The business uses its own Stripe platform and account credentials. Each affiliate consents before opening setup, then supplies verification, bank and agreement information directly on Stripe.

This feature prepares receiving accounts only. It does not transfer commission, debit the business, verify a bank payment, modify payout requests or move funds through Affimaro. The bank/Wise request and manual-payment workflow remains the way to record commission payments.

## Business owner setup

1. Register and configure Stripe Connect in your own Stripe Dashboard. Complete the platform profile and configure onboarding branding. Your platform must be eligible to create Express connected accounts.
2. In **Payments → Business payments → Payment connections**, verify a test Stripe account first. Use a restricted key with the required permissions when available. Existing account-access verification needs current-account and balance read access; recipient setup additionally needs connected-account creation/retrieval and account-link creation permissions.
3. In **Affiliate Stripe receiving accounts**, review the displayed platform account, test/live mode and country.
4. Confirm that Connect is configured for your business and accept the responsibilities shown. Your business controls these connected accounts and is responsible for the Connect fees and account losses assigned to its Stripe platform. This confirmation does not register or approve your business with Stripe.
5. Select **Enable affiliate Stripe setup**. The control starts disabled. Replacing or reconnecting the Stripe credential changes its connection generation and requires another explicit enable action, even for the same Stripe account.

The owner can pause new setup links. Pausing or removing credentials does not delete connected accounts already created in Stripe. Previously created recipients for the same Stripe account and mode are preserved when keys are replaced.

## Affiliate setup

1. Sign in to Affimaro, create an affiliate profile and obtain the business's approval.
2. Open **Payments → Affiliate payments → Your Stripe receiving accounts**.
3. Select the relevant business. The card shows test/live mode and the supported recipient country. This pilot supports only a recipient whose actual residence or legally established business is in the same country as the business's Stripe account. Stripe's own eligibility rules still apply.
4. Select **Set up Stripe receiving**, confirm your actual country and consent to creating or continuing your receiving account for that business. The country is fixed once creation starts.
5. Continue to Stripe and enter your own information there. Affimaro does not prefill an email address, bank account, identity documents, agreement acceptance or IP address into account creation. Only the requested country, account-controller settings, transfer capability and internal correlation IDs are sent.
6. When you return, select **Check Stripe status**. Returning from Stripe does not prove completion. If a link expires or is already used, the refresh page prompts you to continue with a new authenticated setup link.

Only the affiliate owning that approved membership can open its onboarding links. A business owner can inspect its own recipients' status but cannot open their private onboarding links. A suspended or unapproved membership cannot begin or continue setup.

## What the status means

- **Setup started**: the local recipient record exists; account creation has not been verified yet.
- **More information needed**: Stripe still needs submitted details or currently due requirements.
- **Under Stripe review**: the account is awaiting verification or lacks active receiving/payout capability.
- **Receiving account ready**: a fresh Stripe account response reports submitted details, active transfers, enabled payouts, no currently due or pending-verification requirements and no disabling reason.
- **Needs attention**: the latest operation failed, account identity could not be confirmed or Stripe restricted the account. Previous successful check time and the account reference are retained.

Readiness concerns receiving-account setup. It does not prove a commission payment, a specific currency route, available business funds or future transfer eligibility. Checks are manual; no webhook or automatic background status refresh is installed. Cards show the last successful verification time and label checks older than 24 hours.

## API and identity boundaries

The authenticated same-origin endpoint is `/api/stripe-connect`, with strictly validated `configure`, `start` and `check` actions. Owner and affiliate identities come from Sites. A browser cannot choose another owner, account ID, transfer amount, capability, platform context, callback URL or API host.

The API version is pinned to `2026-09-30.endive`. Allowed Stripe operations are:

- `GET /v1/account` and `GET /v1/balance` to verify the current platform's identity, country and test/live environment.
- `POST /v1/accounts` to create the recipient. The Express controller assigns fee payment and payment-loss responsibility to the application and uses Stripe-hosted requirement collection. Only the transfers capability is explicitly requested; Stripe's requirements apply.
- `GET /v1/accounts/{savedAccountId}` to verify a saved receiving account.
- `POST /v1/account_links` to create a single-use onboarding link.

All requests go to `https://api.stripe.com` with encrypted business credentials decrypted only on the server. Redirects are refused, each request has a ten-second timeout and response bodies are capped at 256 KiB. Errors are sanitized. No transfer, payout, charge, refund or funding endpoint is implemented.

Recipient metadata binds the Stripe account to its stored workspace, application and recipient generation. Account ID, country, controller and metadata must match on each refresh. A newly selected platform account or test/live mode cannot reuse a recipient from another platform/environment.

Onboarding links are accepted only under `https://connect.stripe.com/setup/`, returned only to the authenticated affiliate, never saved or logged, and never included in dashboard queries. Return and refresh locations are fixed to this Site's `/payments?view=affiliate` route. Changing the Site origin requires updating `STRIPE_RETURN_ORIGIN` in server source. Neither callback sets an account ready or a payment paid.

## Retries and recovery

A unique local record is reserved before creation, with one recipient per membership/platform/mode. Account creation uses a stable Stripe idempotency key derived from the reserved recipient ID and a fixed request body. Short leases prevent overlapping creation/status operations. Successful account identity and audit writes are atomic.

If Stripe creates an account but the response is lost or the local save fails, the same key and request body are reused on retry. Because Stripe may prune idempotency records after 24 hours, an unknown creation older than 23 hours is held for business review rather than automatically creating another account. This pilot has no administrative account-attachment or reset flow for that case; investigate the correlated recipient metadata in Stripe before a support-assisted recovery.

## Verification limits

Automated tests cover owner enablement, explicit affiliate consent, tenant isolation, immutable country, private callback/link rules, account reuse, ambiguous creation retries, environment isolation, readiness, leases, paused setup, provider failure and audit rollback. They use controlled Stripe responses. No merchant Connect credential or real receiving-account walkthrough was supplied, so no actual Stripe account was created and no live or test-provider onboarding session was executed. Authenticated browser/mobile-layout QA remains pending in a supported environment.

Official references: [Express accounts](https://docs.stripe.com/connect/express-accounts), [account creation](https://docs.stripe.com/api/accounts/create), [account links](https://docs.stripe.com/api/account_links/create), [hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding), [idempotency](https://docs.stripe.com/api/idempotent_requests).
