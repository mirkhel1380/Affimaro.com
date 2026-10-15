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

The performance table shows up to 100 partnership/currency rows, ordered by order count with stable tie-breaking. If it is truncated, both the page and CSV label that fact. Overall metrics and chart counts still include all matching orders. Select one partnership to narrow the table.

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
| `partnership` | Orders created in the selected period, latest state | The displayed first 100 partnership/currency rows |
| `balance` | All-time current balance | Current approvals, reservations, disbursements, reversals and adjustments |

Financial columns end in `_minor`. Divide by `10^decimals` to obtain the currency amount; for example, `12345` with `decimals=2` means `123.45`. The export includes dates, view, generation time and a partnership-row truncation flag. A UTF-8 BOM supports spreadsheet applications. Text cells are quoted, embedded quotes/newlines are escaped, and leading formula characters are neutralized.

Reports and exports omit emails, full bank details, receipt links, provider credentials, encrypted values and provider account IDs. The read-only export endpoint is `/api/reports/export`. Responses are private and not cacheable; sign-in is required.

The pilot limits a report to 200 currency/precision groups. A broader result returns an explicit error instead of silently omitting money. Narrow the partnership or date scope. All-time balances can still require narrowing the partnership even when the order period is short.

## Verification limits

Automated SQLite tests cover tenant and role isolation, authorized selection, UTC boundaries, calendar errors, full-order aggregation, currency precision, approval/refund/source holds, reservations, net Stripe reversals, per-partnership debt, all-time versus period separation, CSV privacy/formula protection, truncation and exact money formatting. No financial provider call is needed to generate a report. Authenticated browser and mobile-layout walkthroughs remain pending because a supported browser QA surface is unavailable. The Site remains owner-private.
