# Affimaro reports

Open **Reports** in your account navigation. These reports use saved store orders, commission approvals and payment records. They do not load sample dashboard data or send funds.

## Views and filters

- **Business reports** include only the signed-in owner's business and its affiliate applications.
- **Affiliate reports** include only the signed-in affiliate's applications, including their recorded history after a partnership is paused or suspended.
- Choose all available partnerships or one affiliate/business-program combination. A partnership ID cannot grant access to another user's data.
- Choose the last 7, 30 or 90 days, including today, or a custom period of up to 366 days. Dates use UTC. Both selected dates are included, and future end dates are rejected.
- The partnership selector shows up to 200 entries and always retains an authorized current selection. More entries are labeled. A selection from outside the current report returns an error.

Date filters select orders by their original creation timestamp, rather than their import, approval or payment date. Every selected order is read in its latest recorded state. A refund imported today can therefore revise a report for an earlier period. These are current-state performance reports, not a historical ledger or a period cash-flow statement.

## Performance definitions

**Referred orders** counts all recorded orders in the selected scope and period, including pending, ineligible, refunded and held orders. Counts and aggregate totals cover every matching order; they are not limited to the existing latest-100 order table.

**Accruing commission** counts source orders whose commission state is accrued and which are not held for missing Shopify data. A zero-value order can still meet that state. **Orders needing review** counts source review states and Shopify data holds.

**Eligible net merchandise** includes only accrued, unheld orders: the recorded merchandise basis after discounts, less allocated merchandise refunds. Tax, shipping and fees are excluded by the store adapter. Ineligible or held orders contribute zero to this figure.

**Estimated commission** uses the latest imported commission, with zero commission for Shopify source-data holds. **Approved commission** is capped at the lower of that effective commission and the business's saved approval for each order. An increase above a previous approval needs a new approval in Payments.

Currencies and decimal precision remain separate throughout. USD with two decimal places is not added to USD with three decimal places. No exchange rate or conversion is applied. Unsafe aggregate integers are refused rather than displayed or exported as rounded money.

The daily chart counts orders across the selected partnerships and currencies; it does not combine monetary values. Dates without orders have zero counts. Expand **View daily counts** for the complete accessible table.

The performance table shows up to 100 partnership/currency rows, ordered by order count with stable tie-breaking, and labels that screen limit. Overall metrics and chart counts include every matching order. The CSV download reads all matching partnership/currency rows up to an explicit 5,000-row limit; it is not restricted to the screen summary. Select one partnership to narrow the table or export.

## Current commission balances

The balances section is explicitly **all time**. It follows the partnership filter, but not the order date filter. It must not be interpreted as payments made during the selected order period.

- **Currently approved:** all current, approval-capped commission for the selected partnerships.
- **Reserved requests:** requested, approved and processing requests. An unknown Stripe result remains reserved.
- **Bank / Wise recorded:** amounts the business recorded as completed outside Affimaro. These are not independently verified bank receipts.
- **Stripe sent, after reversals:** verified connected-account transfers less their latest verified reversals. This does not prove the later payout to a bank.
- **Stripe reversals verified:** provider-reported reversal amounts already recorded after manual status checks.
- **Available approved commission:** approved commission minus disbursements and reservations, floored at zero for each partnership/currency/precision group.
- **Carry-forward adjustment:** disbursements above the current approved cap, calculated per group. One affiliate's debt does not consume another affiliate's available balance.
- **Open reservations needing review:** the reserved portion no longer covered by current approved commission after accounting for disbursements.

Eligibility to approve, request or send funds remains governed by Payments, including partnership status, source freshness, destination readiness and coverage checks. Opening a report does not perform those actions. Stripe reversals appear only after a successful transfer status check.

## Data freshness

Report sections are read together in one read-only database batch. **Generated** identifies the report request time, not proof that every store or provider is current.

Shopify data updates after the business completes a manual dashboard sync. The page shows the last completed sync, an in-progress sync and paused connections when applicable. WooCommerce shows the last signed store delivery; that timestamp does not prove every storefront change has arrived. Up to 100 business connections are shown, with a truncation label when needed.

Affimaro does not have a comparable complete visit denominator across the two store adapters. Reports do not display a conversion rate or treat Shopify's imported conversion sessions as all storefront visits.

## CSV export

**Export report CSV** applies the same authenticated role, partnership and date filters. The file contains:

| Section | Time basis | Contents |
| --- | --- | --- |
| `performance_total` | Orders created in the selected period, latest state | Totals per currency and precision |
| `daily_orders` | Orders created in the selected period, latest state | Every UTC day's order/review counts, including zeros |
| `partnership` | Orders created in the selected period, latest state | Every matching partnership/currency row, up to 5,000 |
| `balance` | All-time current balance | Current approvals, reservations, disbursements, reversals and adjustments |

Financial columns end in `_minor`. Divide by `10^decimals` to obtain the currency amount; for example, `12345` with `decimals=2` means `123.45`. The export includes dates, view, generation time and the existing partnership-row truncation flag. Successful downloads are complete and set that flag to false. An export with more than 5,000 performance rows returns an explicit narrowing error and creates no partial CSV. The limit counts partnership/currency/precision performance rows, not individual orders; daily rows, currency totals and current balances are also included. The existing limit of 200 currency/precision groups still applies. A UTF-8 BOM supports spreadsheet applications. Text cells are quoted, embedded quotes/newlines are escaped, and leading formula characters are neutralized.

Reports and exports omit emails, full bank details, receipt links, provider credentials, encrypted values and provider account IDs. The read-only export endpoint is `/api/reports/export`. Responses are private and not cacheable; sign-in and a currently approved account are required. Date and partnership filters are identical to the report. No extra limit or authority query parameter is accepted. The browser downloads only a successful CSV response; session, size or other errors appear beside the button while the report stays open. A sign-in HTML page is never saved as a CSV. Changing report filters resets that button state.

The pilot limits a report to 200 currency/precision groups. A broader result returns an explicit error instead of silently omitting money. Narrow the partnership or date scope. All-time balances can still require narrowing the partnership even when the order period is short.

## Verification limits

Automated SQLite tests cover tenant and role isolation, authorized selection, UTC boundaries, calendar errors, full-order aggregation, currency precision, approval/refund/source holds, reservations, net Stripe reversals, per-partnership debt, all-time versus period separation, CSV privacy/formula protection, truncation and exact money formatting. No financial provider call is needed to generate a report. Authenticated browser and mobile-layout walkthroughs remain pending because a supported browser QA surface is unavailable. The native Sites publication remains owner-private. The independent Affimaro website has public pages; customer reports and exports require authentication.


## Click activity and click CSV

**Clicks** is separate from the order and commission reports above. All four portals can search recorded source, medium and referrer-host text and filter by country, device, partnership and the existing 7/30/90 UTC calendar-day windows. The same filters and account scope apply to metric cards, the complete daily graph, leading sources, activity pagination and CSV. Those report sections are read in one read-only database batch. Country options come from the member's own selected period and partnership. Business activity rows identify the partner; affiliate and creator rows identify the brand.

The partnership selector is bounded to the first 2,000 entries and retains an authorized current selection even when it falls outside that list. Authorization checks the actual owned application separately from the display list. Totals and downloads still include every matching partnership. A malformed or foreign selection shows a recoverable filter error on the page; it never selects another account's records.

**Download clicks CSV** exports every matching event across activity pages, up to 5,000 rows. A larger request returns an explicit error rather than a partial file; narrow the supported date, partnership, source, country or device filters. The browser reports download errors in place. The CSV uses UTC timestamps, UTF-8, quoted cells and spreadsheet-formula neutralization. It contains brand, business-visible partner name, reported source/medium, referrer hostname, broad device type and country. It omits emails, account identifiers, bank/payment/provider details, IPs, full referring URLs and visitor identities. Existing history remains readable after a partnership is suspended.

The read-only endpoint is `/api/clicks/export`. It derives portal and account scope from the authenticated member, rejects unknown or repeated query keys, and returns private, non-cacheable downloads. It never calls a financial provider, creates click events or changes orders, requests or commission records. Raw events are not verified unique visitors or a conversion-rate denominator. Known crawler/prefetch exclusions and the existing ninety-day retention remain unchanged.

Isolated database, actual endpoint and server-page fixtures cover all four roles, combined filters, graph/table agreement, selected partnership bounds, cross-page exports, permission failures, CSV privacy and formula protection, explicit export limits and read-only behavior. Live authenticated download and dedicated mobile/browser visual QA remain unexercised.

## Complete performance export verification

Isolated actual endpoint and report-page tests cover every saved account role, selected and foreign partnerships, performance rows beyond 100, an exact 5,000-row successful export, an explicit 5,001-row error and narrowing recovery. CSV grouped totals agree with dashboard totals and keep currency precision, refund/approval caps and Shopify source holds. UTC period counts remain separate from all-time balances, net recorded reversals and reservations. Anonymous, unapproved, repeated/unknown-filter and unsafe-integer responses remain private errors. Download tests cover successful CSV saves, server errors and successful non-CSV sign-in responses. No production account, commission, transfer, subscription or provider configuration is changed by verification. Live authenticated download and dedicated mobile/browser visual QA remain unexercised.
