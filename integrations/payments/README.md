# Business payment account setup

Affimaro can check access to a business owner's Stripe account or Wise business profile. These connections read account information only. These account-access checks do not send money, verify settlement, onboard recipients, create Wise transfers or fund payments. The separate owner-enabled Stripe recipient setup is described in the [Stripe Connect guide](stripe-connect-setup.md). Each business pays from its own accounts. Bank/Wise transfers are completed outside Affimaro; USD Stripe transfers have a separate review and confirmation flow.

Open **Payments → Business payments → Payment connections** while signed in as the business owner. Create a business workspace first. The Site remains private; connecting an account does not change who can access it.

## Stripe account access

1. In your own Stripe Dashboard, choose the testing environment or live account you want to check.
2. Create a restricted key with permission to read the current account and balance. Prefer a restricted key to an unrestricted secret key. Affimaro accepts `rk_test_`, `rk_live_`, `sk_test_` and `sk_live_` keys, not publishable `pk_` keys.
3. In Affimaro, select **Test / sandbox** or **Live**, enter the key in the password field, and select **Check and save Stripe account**.
4. Affimaro reads the current account and verifies its environment using the balance response. A mismatch, missing read permission, malformed response or failed request prevents saving the replacement credential. Existing credentials remain intact if replacement verification fails.

The card shows the provider account ID, business label, country, default currency, last check time and Stripe's account-level `payouts_enabled` setting. This setting concerns that Stripe account; it does **not** mean affiliates can withdraw commission through Affimaro. No bank details, balances, owner email, key or provider response body are returned to the dashboard.

The outbound calls are `GET https://api.stripe.com/v1/account` and `GET https://api.stripe.com/v1/balance`, pinned with `Stripe-Version: 2026-09-30.endive`. The request does not accept an arbitrary host, account context header or endpoint from a browser. Balance amounts are discarded rather than displayed or treated as commission funds.

USD affiliate account transfers require an eligible Stripe Connect platform and a verified live receiving account created through Affimaro's owner-enabled Express onboarding. An ordinary Stripe account or a pasted affiliate account ID is insufficient. The business reviews and confirms each transfer, then checks its status manually; see the [transfer guide](stripe-transfers-setup.md). Bank payouts and webhooks are not implemented by Affimaro.

## Wise business profile access

1. Use your own Wise **business** account. In Wise, open **Your Account → Connect and manage apps → API tokens** and create a personal API token if available to your account.
2. Find the numeric business profile ID associated with that token. For a developer-managed account, Wise's documented profile-list endpoint returns the available profile IDs. Do not use a recipient, transfer, personal profile or unrelated business ID.
3. In Affimaro, select the matching environment and enter the token and business profile ID. Sandbox and live tokens are separate.
4. Select **Check and save Wise account**. The selected profile must appear among the profiles accessible to the token, must have type `BUSINESS`, and must not report an inactive profile state.

Affimaro uses the versioned profile-list API `2026Q4`:

- Test: `GET https://api.wise-sandbox.com/2026Q4/profiles`
- Live: `GET https://api.wise.com/2026Q4/profiles`

The card shows only the selected profile ID, business label, country when available and last check time. Personal profile details, business addresses, dates of birth, tokens and raw responses are discarded. An account-access check does not prove completed KYC, transfer permissions, available funds, supported routes or recipient readiness.

This is an owner-managed account-access pilot. A Wise partnership/OAuth customer authorization flow is not implemented. Provider rules for personal tokens, supported regions and funding access still apply. Do not interpret a successful check as an approved Wise Platform partnership or an entitlement to perform financial transactions for customers.

## Recheck, replace and remove

**Check access again** makes fresh read requests. Failed checks mark the connection as needing attention, retain its last successful check time and show a fixed, sanitized explanation. Old checks are labeled after 24 hours. Nothing polls automatically. Another tab replacing a credential prevents an older in-flight check from overwriting the new connection.

**Replace connection** checks the replacement with the provider before saving it. The replacement can select a different test/live environment or business account. Only one current connection per provider per business is supported.

**Remove** requires an explicit click on the card's removal confirmation. This removes the saved connection and encrypted credential from active Affimaro storage. It does not revoke the provider key, delete a Stripe/Wise account, or remove commission/bank-payment records. Revoke unneeded credentials in the provider's own dashboard.

## Recording a completed bank or Wise transfer

The affiliate still saves a bank destination in the balance currency. The business reviews commission, approves the request, completes the exact transfer outside Affimaro, and then chooses **Record completed transfer**.

Choose **Bank transfer** or **Wise bank transfer**, enter the unique completed-transfer reference, UTC date and optional private HTTPS receipt link, and confirm the transfer has already been completed to the saved destination. Saving a Wise account connection is not required to record a completed manual Wise bank transfer. It does not verify that transfer either.

A Stripe transfer to a connected account is not equivalent to bank settlement and is not offered as a manual bank-payment method. Existing reservation, refund, currency-isolation and recent-Shopify-sync checks remain in effect. The transfer method is retained inside the encrypted receipt and shown only to the affiliate and the relevant business owner. Earlier receipts without a method are shown as bank transfers. CSV exports continue to exclude bank account numbers and receipt details.

## Credential and data handling

- Credentials are entered only in the authenticated Site form. Do not paste keys into chat, source, GitHub, URLs or download files.
- Only the owner of the business workspace can save, inspect the non-secret connection summary, recheck or remove its connections.
- Credentials use AES-256-GCM with a random IV and authenticated context containing the workspace, provider and connection generation. The existing server-only `PAYMENT_DATA_KEY_V1` encrypts them; do not replace or rotate it without a versioned data migration.
- All provider requests use fixed HTTPS endpoints, header authentication, refused redirects, a ten-second timeout per request and a bounded response body. Browser writes require authenticated same-origin JSON.
- Provider errors are not reflected verbatim or logged with credentials. Connection changes and checks have atomic audit records. Dashboard payloads and CSV exports do not include encrypted or plaintext keys.

## Verification limits

Automated tests use controlled Stripe/Wise responses and exercise encryption boundaries, ownership, mode mismatches, failed credential replacement, source failures, stale checks, removal and rollback. No real merchant credential was supplied; no live Stripe/Wise account check or transfer has been executed. Authenticated browser and mobile-layout walkthroughs remain pending in an environment with supported browser access.

## Official references

- [Stripe account API](https://docs.stripe.com/api/accounts/retrieve)
- [Stripe current-account retrieval in the official SDK](https://github.com/stripe/stripe-node/blob/master/src/resources/Accounts.ts)
- [Stripe balance API](https://docs.stripe.com/api/balance/balance_retrieve)
- [Stripe API versioning](https://docs.stripe.com/upgrades)
- [Wise personal API tokens](https://docs.wise.com/guides/developer/auth-and-security/personal-api-token)
- [Wise profile list API](https://docs.wise.com/api-reference/profile/profilelist)
- [Wise environments](https://docs.wise.com/guides/developer/environments)
