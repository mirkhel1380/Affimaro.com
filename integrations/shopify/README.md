# Shopify dashboard sync — Affimaro pilot

This adapter reads orders from Shopify when the business clicks **Sync Shopify orders** inside its signed-in Affimaro workspace. It supports both the independent installation and the owner-private ChatGPT Site. There is no public webhook, OAuth callback, storefront script, background polling job or Shopify App Store listing in this pilot. It does not change access controls.

## Connect your own store

1. Create an app in the Shopify Dev Dashboard for the organization that owns your store. Install it on that organization's store. The **client credentials grant** works only when the app and store belong to the same organization; a collaborator app owned by another organization is not enough.
2. Configure and grant `read_orders`. Access to older orders additionally needs Shopify's approved `read_all_orders` scope. Follow Shopify's current permission requirements for customer-journey data.
3. Open Affimaro → Business workspace → Store. Each workspace supports one store. Choose Shopify, enter the exact `your-store.myshopify.com` domain, app client ID and client secret, then Verify and connect.
4. Credentials are sent only to that fixed Shopify domain for verification. The returned shop identity must match. Client secrets and expiring access tokens are encrypted with the server runtime key, never included in dashboard props or returned to the browser. Tokens are refreshed server-side before expiry.
5. Keep the program attribution window between 1 and 30 days. Shopify's native conversion-session history supports up to 30 days, so longer windows are rejected for this adapter.

Never put app secrets in a referral URL, source repository or support message. Enter them only into the signed-in Affimaro connection form. No real Shopify credentials are bundled with this source.

## Referral links and commission rules

An approved affiliate's portal provides a storefront link containing an `af_…` referral code and Affimaro UTM fields. Shopify records the customer sessions it can attribute to a purchase. During sync, Affimaro chooses the latest matching Affimaro session preceding the order, within the program window and Shopify's 30-day native history.

The adapter uses Shopify's recorded session timestamp. It does not trust a submitted customer timestamp or accept browser-submitted order amounts. A customer's consent, browser restrictions and Shopify's own attribution availability can prevent session attribution. A missing or unfinished journey is not invented.

Program rule revisions are recorded from connection/setup onward. The rate and window effective at the recorded session are copied into the referral; changing the program before the first sync does not rewrite that session's rate. Referrals before store connection are not backfilled. At first import the partner and program must still be active under this pilot's shared order-eligibility rules. Later refunds keep the original attribution/rate, including after suspension or program pause.

Session counts represent referral sessions attached to imported conversions, **not all storefront clicks or unique visitors**. Native Shopify test orders are excluded from commission.

## Sync and review

- Each click processes up to three changed orders and retries the oldest two pending orders. Use Continue Shopify sync until the current range is complete. Progress is stored server-side and resumes after errors or page reloads.
- Shopify changes are queried within a fixed timestamp range, with a 15-minute overlap on later completed runs. Failed fetches do not advance past the failed order. Parallel syncs are blocked by a short server lease.
- Run a complete sync within five minutes before approving Shopify commission, approving its payment request or recording its bank transfer. Server-side financial writes enforce this freshness rule. Opening the page alone does not sync data.
- Session data can become available after order creation without changing the order's update time. Those orders remain in a retry queue. Pending IDs and review reasons are visible in store settings; customer contact information is not imported.
- Shopify's standard order scope is limited to recent orders. Older refunds need the additional historical-order permission. If Shopify cannot return an already imported order, that order's payable commission is held at zero until readable source data is restored.
- This pilot reads up to 50 order lines, 50 lines per refund, 20 shipping lines per refund and 50 journey moments. If a relevant connection has more pages, the order is held for a larger adapter rather than calculating from an incomplete page. A healthy retry releases the hold. An older snapshot cannot clear a hold created by a newer revision.

## Amounts and refunds

Amounts use **shop currency**, exact decimal-string conversion and integer minor units. Shipping and taxes are excluded from commission. Line-item taxes are subtracted from tax-inclusive subtotals; allocated merchandise refunds reduce the basis. Full-refunded, voided and cancelled orders accrue zero. Pending, authorized and partly paid orders do not accrue payable commission.

Refund allocations must reconcile with Shopify's refund totals and current subtotal. Unallocated refunds, ambiguous edits, unsupported precision or incomplete financial pages are held for review with no payable commission. The last verified source snapshot is preserved; shared reports and approval/payment calculations apply the source hold. Paid refunds or review holds reduce future available commission in the same business/currency group. Affimaro never debits an affiliate's bank.

Unknown or changed attribution/currency cannot overwrite an already imported order. Monotonic source revisions and event receipts prevent duplicate commission and old updates restoring refunded balances. Where two conflicting snapshots share a revision, the order is held until consistent source data is available.

## What still needs a live store

The adapter is verified with an isolated SQLite database and a mocked Shopify API. No actual merchant credentials, live Shopify installation, end-to-end customer checkout, browser walkthrough or real bank transfer were available in the authoring environment. Verify a real store's permissions, attribution readiness, taxes, refunds and payment workflow before production use. Shopify test orders are intentionally excluded, so a fixture passing does not prove native attribution on a live shop.

## Primary references

- [Client credentials for stores in your organization](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)
- [CustomerJourneySummary and its native window](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CustomerJourneySummary)
- [CustomerVisit referral codes and UTM parameters](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CustomerVisit)
- [Order financial fields](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order)
- [Refund financial fields](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Refund)

The adapter pins Shopify Admin GraphQL API version `2026-10`. Reassess the schema and supported version before its Shopify support period ends.
