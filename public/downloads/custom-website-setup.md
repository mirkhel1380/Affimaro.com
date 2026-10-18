# Affimaro custom website connection

Version 0.1.0 · Node.js 22.13 or newer · Server-side integration

Connect a website with its own backend to Affimaro. Your developer installs this client in that backend, registers eligible referral visits, and delivers order and refund snapshots from your trusted order system. This is a developer integration, rather than a browser script or an automatic installation.

## 1. Create and verify a connection

1. Open Affimaro → Business workspace → Store → **Custom website**.
2. Enter the exact public HTTPS home URL, including any subdirectory.
3. Create the connection. Save its connection ID and one-time signing key in your backend’s secret settings. Each workspace connects one website or store.
4. Download `affimaro-custom.mjs` and place it in a server-only directory as `affimaro.mjs`.
5. Use the Affimaro URL displayed in your workspace. The current independent pilot supports this connection; the old native preview remains paused.

The key must stay on your backend. Do not place it in storefront JavaScript, a mobile app, a public repository, analytics, URLs, logs or a public environment variable. Creation and rotation show it once; normal dashboards never return it.

```js
// Server-only setup. Supply these values through your backend’s secret settings.
import {createAffimaroClient} from './affimaro.mjs';

export const affimaro = createAffimaroClient({
  origin: process.env.AFFIMARO_URL,
  connectionId: process.env.AFFIMARO_CONNECTION_ID,
  signingKey: process.env.AFFIMARO_SIGNING_KEY,
  storeUrl: process.env.WEBSITE_HOME_URL,
});

await affimaro.ping(); // {connected: true}; refresh Store settings to see verification
```

Run the connection test on your server. Rotating a key stops deliveries signed with the old key until you update your server. Pausing the connection stops referral and order/refund deliveries; resume and drain your queue before reviewing commission.

## 2. Capture a referral visit

After a business approves an affiliate, and its program and verified connection are active, the affiliate portal provides a link like:

```text
https://your-website.example/?affimaro_ref=<application UUID>
```

On a visit with this parameter, apply your site’s consent preference before tracking. Your backend calls:

```js
// applicationId comes from affimaro_ref on the landing request.
// referralEvent.id is a UUID already saved in your durable server outbox.
const referral = await affimaro.referral(applicationId, {
  eventId: referralEvent.id,
});
// Returns {referralId, expiresAt}.
```

Your developer must persist the accepted `referralId` and `expiresAt` in your server-side session or database. Use a secure, opaque, HttpOnly session cookie to associate subsequent visits; never trust an unsigned referral ID supplied by a browser at checkout. When an order is created, copy that trusted attribution onto the order in your database. Keep it there for all later revisions and refunds, even after the visit’s session expires.

Consent changes should stop new tracking and clear the visit’s attribution according to your site’s settings. An order already recorded still needs accurate payment/refund corrections. Do not create synthetic referral visits while importing old orders.

The API checks the application against this connection’s business. Only an approved affiliate in an active program can register a referral. The rate and attribution window are locked when the referral is accepted. Capture promptly: a purchase made before an accepted referral cannot receive retroactive commission.

## 3. Send trusted order and refund snapshots

Build each snapshot from your server’s order database and verified payment/refund events. Do not accept the amount, payment status or referral ID directly from storefront input. Send a complete cumulative snapshot, rather than a financial delta:

```js
// orderSnapshot and deliveryEvent come from your order database and durable outbox.
await affimaro.order({
  orderId: orderSnapshot.id,                 // e.g. "ORDER-2026-1001"
  revision: orderSnapshot.revision,         // starts at 1; increases on each change
  referralId: orderSnapshot.referralId,     // accepted attribution saved on the order
  createdAt: orderSnapshot.createdAt,       // original UTC ISO timestamp ending in Z
  currency: 'USD',
  decimals: 2,
  basis: 12000,                            // $120.00 eligible merchandise
  refundedBasis: 2500,                     // $25.00 cumulative merchandise refund
  status: 'completed',
  refundUnallocated: false,
}, {eventId: deliveryEvent.id});
```

| Field | Contract |
| --- | --- |
| `orderId` | Stable string, 1–128 ASCII characters. Start with a letter or number; remaining characters may also be `.`, `_`, `:`, `-`. UUIDs and numeric strings are supported. |
| `revision` | Positive safe integer, increasing whenever the order’s financial snapshot changes. Persist it in your database; wall-clock timestamps alone are unsafe revision counters. |
| `referralId` | Affimaro’s accepted referral UUID, preserved on the order. Orders without valid attribution should not be delivered here. |
| `createdAt` | Original order creation time in UTC. It must fall within the accepted referral’s window for first-ingestion eligibility. |
| `currency`, `decimals` | Three uppercase currency letters and the precision used by this order, from 0 to 6. They remain fixed for the order. Currencies stay separate. |
| `basis` | Merchandise after discounts, excluding tax, shipping and fees, in integer minor units. |
| `refundedBasis` | Cumulative eligible merchandise refunded, in the same units, between zero and `basis`. |
| `status` | One of the exact status values below. |
| `refundUnallocated` | `true` if a refund cannot yet be reliably allocated to eligible merchandise. Holds commission for review until corrected. |

Amounts may be at most 1,000,000,000,000 minor units. Use the currency precision from your order system rather than assuming every currency has two decimals. Never send customer names, addresses, card numbers or payment credentials.

| Source state | Send status | Commission effect |
| --- | --- | --- |
| Awaiting payment | `pending` or `on-hold` | No accrued commission |
| Payment confirmed; fulfillment may remain | `processing` or `completed` | Accrues on eligible net merchandise |
| Cancelled or failed | `cancelled` or `failed` | Reverses accrued commission |
| Fully refunded | `refunded`, with the complete cumulative refund | Reverses accrued commission |
| Partial refund of a paid order | Keep `processing` or `completed`; increase `refundedBasis` | Recalculates remaining commission |
| Refund allocation unresolved | Use the correct status and `refundUnallocated: true` | Zero accrued commission until a corrected revision |

Order attribution, original creation time, currency and precision are immutable. An old revision cannot overwrite a newer one; an identical revision with changed financial values is rejected. Affiliate/program eligibility is checked on the first ingestion. An initially ineligible order cannot later become eligible by replaying it. Corrections to an existing eligible order remain possible after an affiliate or program is paused.

## 4. Reliable delivery

Your developer must implement the session/order persistence and a durable outbox worker. This client signs and sends events; it does not provide a queue, cron job, storefront consent component or payment verification.

1. Save a UUID event ID and the exact payload in the outbox before the first attempt. Save order snapshots alongside the order update in your own database transaction.
2. Supply that event ID to `referral()` and `order()`; both require it. The client uses stable order field serialization. Retry the same event ID with the unchanged payload; do not create a fresh referral event after an ambiguous timeout.
3. Mark a delivery complete only after a verified success response. Store returned referral attribution before allowing it onto an order. The same event ID and payload replay the original result without another order or referral.
4. Retry network failures, timeouts, HTTP 408/429 and 5xx responses with backoff. The client exposes `error.eventId`, `error.status`, `error.code` and `error.retryable`. It does not automatically retry. Permanent 400/403/409 errors need investigation; 401 normally requires checking the key, connection state and server clock. Redirects are rejected and never followed with credentials.
5. A financial correction uses a higher order revision and a new event ID. A lower revision response with `stale: true` is safe to acknowledge because a later revision is already recorded.
6. Monitor queue failures and verify that all payment/refund updates have arrived before approving commission or recording affiliate payments. No automated reconciliation with your payment provider is included.

Pausing a connection also rejects new deliveries. Rotation keeps recorded referrals and orders intact. Update your backend key, run `ping()`, and resume/retry the original queued events with their original IDs and payloads. Do not clear your queue or recreate the connection to repair a delivery failure.

## HTTP protocol for other backends

Other languages can implement the same protocol. POST UTF-8 JSON to `<Affimaro URL>/api/custom/event`, with `Content-Type: application/json`, a body at most 16 KiB, and these headers:

| Header | Value |
| --- | --- |
| `X-Affimaro-Store` | Custom website connection UUID |
| `X-Affimaro-Event` | Persisted event UUID |
| `X-Affimaro-Timestamp` | Current Unix timestamp in seconds, within five minutes of Affimaro |
| `X-Affimaro-Signature` | Lowercase hexadecimal HMAC-SHA256, using the signing-key string as UTF-8 text, over `timestamp + "." + eventId + "." + rawJsonBody` |

Do **not** hex-decode the key or reserialize the body after signing. Each retry signs its unchanged body and event ID using a fresh timestamp. No Supabase key, user cookie or provider secret is required by this machine endpoint on the independent host.

Payloads are strict: `{kind: "ping", storeUrl}`, `{kind: "referral", applicationId}`, or `{kind: "order", ...the documented order fields}`. Success is HTTP 200 with `{ok: true, data: ...}`. Ping returns `{connected: true}`; referral returns `{referralId, expiresAt}`; order returns `{orderId, accepted: true}` or `{orderId, stale: true}`. Errors return `{ok: false, error: "..."}` and an appropriate non-2xx status. The endpoint accepts only custom website connections; WooCommerce and Shopify credentials cannot be used here.

## Verify before sharing live links

Use a staging website/workspace and a real approved test affiliate. Verify consent, referral capture, payment pending → confirmed, partial/full refunds, cancellations, duplicate/retried events, delayed revisions, key rotation and pause/resume. Check the same totals in business orders, the affiliate portal and reports. Estimated commission still requires business approval. This integration never sends an affiliate payment or charges a customer.

Affimaro’s receiver and downloadable client are covered by isolated automated tests. A real website checkout and refund walkthrough remains necessary for your implementation.
