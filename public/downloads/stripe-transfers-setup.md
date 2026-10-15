# USD commission transfers to Stripe

Affimaro supports an owner-confirmed transfer of approved USD commission from a business's own live Stripe balance to an affiliate's saved Stripe Express receiving account. Affimaro does not hold the funds. Stripe credits the connected account; its later payout to a bank is a separate Stripe process.

Transfers are not triggered by approval, page load, onboarding completion or a schedule. The business must open a fresh review and explicitly confirm each send.

## Requirements

- The business has configured its own eligible Stripe Connect platform and connected a verified **live** Stripe account in Business payments.
- The API key can read the current account, balance, connected accounts and transfers, and can create transfers. The separate onboarding feature also needs account/account-link creation permissions.
- The affiliate is approved for that business and has a live receiving account set up through [Stripe receiving-account setup](stripe-connect-setup.md). This pilot supports recipients legally based in the same country as the business Stripe account.
- Stripe reports submitted recipient details, active transfers, enabled payouts and no currently due or pending-verification requirements. The affiliate checks its status within five minutes before requesting Stripe payment.
- The commission balance is USD with two decimal places. This pilot's limit is $999,999.99 per request. Larger balances and other currencies can use the existing bank workflow; the Stripe request is not silently truncated.
- The business has enough available USD in Stripe. Stripe's route, source-balance and transfer restrictions still apply. Affimaro uses the provider's default available-balance transfer source; it does not fund transfers from pending charges.

Test Stripe accounts cannot settle real commission balances. This is a live-only ledger path. No test response is accepted as evidence of disbursement.

## Affiliate request

In **Payments → Affiliate payments**, check the relevant live receiving account, then select **Request USD to Stripe** on its USD balance card. A saved bank profile is not required for this method.

The server derives the amount from approved available commission and reserves the full amount for that business/currency/precision group. Only one requested, approved or processing request can be open per group, regardless of whether the destination is bank or Stripe. A destination snapshot is encrypted with context bound to the affiliate and request. It cannot be replaced by changing a later account/profile.

Before business approval, the affiliate may cancel. The business may decline a requested/approved request so it can be recreated with a corrected destination or amount. An in-flight Stripe request cannot be cancelled, declined or recorded as a bank payment while its result is unknown.

## Business review and send

1. Review and approve the request in **Payments → Business payments**.
2. For Shopify-derived commission, finish a complete sync within five minutes of financial approval/sending. Incomplete or held source data cannot fund a new transfer.
3. Select **Review Stripe transfer**. Affimaro refreshes Stripe account identity/environment, receiver readiness, commission coverage and available USD.
4. Review the exact amount, business Stripe account, saved affiliate Stripe account and available balance shown. The opaque review token is owner/request/destination/connection bound and expires after five minutes.
5. Confirm the displayed send authorization and select **Confirm and send**. The server rechecks eligibility and claims the request atomically before making the provider write.

The business sends the requested amount to the Stripe receiving account. Its later bank payout timing, conversion, restrictions and fees follow Stripe's settings. A successful account transfer is shown as **sent to Stripe**, not verified bank receipt.

## Pending results and safe retries

Every financial attempt has a durable ID, a frozen amount/destination/payload, a stable Stripe idempotency key, a unique transfer group and a short operation lease. The request changes to **Stripe pending** before any transfer POST. Its amount stays reserved.

If a response is lost, invalid, rate limited or otherwise unconfirmed, Affimaro holds the attempt for review. Use **Check Stripe transfer status** first. The business's own Stripe API is queried by the known transfer ID, or by the unique group if the original response was lost. A matching transfer settles the ledger without another send.

If no transfer is found, a fresh review may safely retry the same frozen attempt and idempotency key within 23 hours. It rechecks current commission/source coverage and receiving-account readiness before another POST. Unknown attempts older than that window are not resubmitted automatically, because Stripe may prune idempotency records after 24 hours. They remain held for business review; this pilot has no administrative reset/attachment flow. Investigate the attempt metadata and request logs in Stripe before support-assisted recovery.

The specific Stripe `balance_insufficient` rejection confirms that the transfer could not complete. That attempt is closed as rejected and the request returns to approved while retaining its commission reservation. A later confirmed send uses a new attempt. Other unconfirmed errors remain held conservatively, including permission/transport failures.

## Verification and ledger rules

Affimaro accepts only a matching live USD Transfer object: amount, saved destination, transfer group, attempt/request/workspace metadata, ID, currency, environment, reversal range and source transaction must agree with the saved attempt. The business's authenticated Stripe platform identity is checked before provider reads/writes. Browser inputs cannot choose an amount, destination, platform context, API host, transfer ID or arbitrary idempotency key.

The authenticated same-origin endpoint `/api/stripe-transfers` exposes only `preview`, `send` and `reconcile`. Sending requires the owner-bound review token and explicit confirmation. Provider URLs are fixed HTTPS endpoints, redirects are refused, requests have a ten-second timeout and response bodies are bounded. Keys and raw provider errors are not returned or logged.

The request and attempt settle with an atomic audit record only after provider evidence is verified. Financial writes recheck current coverage inside the claim transaction. A refund after Stripe has already executed can create carry-forward debt; the actual transfer is still recorded. There is no automatic debit or transfer reversal initiated by Affimaro.

## Reversed transfers

**Check Stripe transfer status** also reads provider-reported full or partial reversals. The recorded reversed amount only increases; an older source snapshot cannot undo an already verified reversal. Net disbursement is the sent amount less its verified reversal. This adjusts available commission and carry-forward debt without editing the original requested amount.

Reconciliation is manual. If a reversal occurs in Stripe, it is not reflected here until a status check succeeds. Affimaro does not create a reversal, refund or bank payout.

## Records and existing bank payments

Bank/Wise manual payment records remain supported. Stripe requests use separate processing/transferred states and cannot be manually marked paid. Bank records migrate with their original IDs, amounts, encrypted destinations/receipts and references intact; their default method remains bank.

Full destination and receipt details are revealed only to that affiliate or the relevant business owner. CSV exports include method, status, verified Stripe reference and reversed minor units, while excluding bank numbers, receipt links, credentials and encrypted values.

## Verification limits

Automated SQLite/provider-boundary tests cover reservations, ownership, review expiry, exact amounts/destinations, idempotency, lost responses, unknown results, insufficient balance, source/coverage races, provider mismatches, refunds/reversals, operation leases, audit rollback and legacy bank-data migration. They use controlled Stripe responses. No real Stripe credential was supplied and no live or sandbox-provider money movement was executed. End-to-end provider and authenticated browser/mobile-layout testing remain outstanding. The Site remains an owner-private pilot.

Official references: [Create transfer](https://docs.stripe.com/api/transfers/create), [List transfers](https://docs.stripe.com/api/transfers/list), [Transfer object](https://docs.stripe.com/api/transfers/object), [Idempotency](https://docs.stripe.com/api/idempotent_requests), [Stripe error codes](https://docs.stripe.com/error-codes), [D1 foreign-key migrations](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
