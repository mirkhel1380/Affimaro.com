# Complete partner payment history

Every customer portal has **Payments / Earnings → Payment history**. This page covers partner commission requests; subscription invoices remain in Package & billing.

| Account | Private history path | Scope |
| --- | --- | --- |
| Brand | `/workspace/payment-history` | Requests in the owned program |
| Agency | `/agency/payment-history` | Requests in the represented program |
| Affiliate | `/partner/payment-history` | Requests belonging to that affiliate |
| Creator | `/creator/payment-history` | Requests belonging to that creator |

Existing payment dashboards keep their up-to-100 request summaries and link to the complete history. History has no 100-request ceiling. It uses the saved 25/50/100 page-size preference and sorts by original request creation time, then request ID, newest first. A page beyond the remaining results resolves to the last matching page.

Literal case-insensitive search matches request ID or counterpart display name. Status, payment method, currency and all-history/7/30/90-day creation-date filters combine and remain in pagination. Date boundaries use UTC; displayed table timestamps follow the member's saved timezone and date format. Request amounts retain their own currency/precision and are not added together. Currency choices are bounded to the first 200 and retain a current selection; an unfiltered view still includes all currencies.

Open requests include requested, approved and processing. The Stripe-transfers status includes transfers with reversals; separate partial/full reversal filters use the saved reversed amount. A recorded bank/Wise payment does not prove bank receipt. A verified Stripe transfer records connected-account credit; a later bank payout is separate. Existing status explanations are reused.

**Open request** selects only a request in the current member's own program/participant scope and shows its latest saved state. The selected record can remain visible outside the current filters after a manual status change. Search submission and pagination clear the selection; selecting a row retains the current filters and page. Foreign or malformed selections show a recoverable reset without disclosing another account's records.

The selected card reuses the existing explicit controls for cancelling, reviewing, recording a completed transfer or reviewing/checking a Stripe transfer. Current coverage and store-sync flags use the same shared queries as the original payment dashboard. Old requests do not bypass fresh backend checks. Destinations and receipts stay behind the existing explicit details action and audit. Opening history does not decrypt a destination, contact a provider, check a transfer, approve commission or send money.

## CSV

The existing private endpoint `/api/payments/export` retains its merchant/partner view and filename/columns. Both dashboard and history downloads now include every matching request across all pages, up to 5,000 rows. A larger request returns an explicit 409 error; narrow the date, status, method, currency or search instead of receiving a silently partial file. Download buttons report errors in place and refuse a non-CSV sign-in response. History disables downloads above the limit.

The selected request is independent of the CSV filters. UI download links remove selection and page. The endpoint rejects selected-request, authority, unknown or repeated filter keys. Page, if supplied directly, never limits the exported rows. Actual saved role and identity determine scope; the view parameter cannot grant another role's access.

The existing CSV format retains request IDs, counterpart names, amount/currency/status, destination ending, request time, recorded payment date, decline reason, method, reversed minor units and Stripe transfer ID. Full destinations, encrypted values, provider credentials and receipt links are excluded. UTF-8 BOM, quoting and formula neutralization are preserved. Responses remain private and non-cacheable.

## Verification and boundaries

History joins the request to its actual participant, application program and workspace, including suspended historical partnerships. Summary counts, visible rows, selected request and currency choices share one read-only D1 batch. No schema migration, financial provider setting, key, callback, transfer operation, stored balance or approval rule is changed. Preview navigation points to the existing clearly fictional payment-history examples.

Automated fixtures exercise more than 100 requests, all four roles, direct selections, combined filters, reversals, UTC boundaries, precision, saved preferences, coverage/source holds, full CSVs, limits, privacy and the actual endpoint/server pages. Explicit approval is exercised only in isolated SQLite records. No live card, transfer, bank destination or customer payment request is changed. Authenticated production and dedicated mobile visual walkthroughs remain unexercised.

Stripe's official security guidance was consulted for server-side credential and least-privilege boundaries. This feature adds no Stripe API call or SDK/version change; the existing frozen integration remains in place. See [API key security](https://docs.stripe.com/keys-best-practices) and [restricted keys](https://docs.stripe.com/keys/restricted-api-keys).
