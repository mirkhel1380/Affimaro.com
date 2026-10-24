# Complete commission approval queues

Brand: `/workspace/commission-approvals`. Agency: `/agency/commission-approvals`.
Both are available under Payments → Commission approvals and from the existing
Partner payments summary. The old dashboard retains its 100-order summary;
the new queue makes every matching saved order reachable through pagination.
Affiliates and creators do not receive business approval navigation or authority.

## Filters and pages

- Literal external/internal order ID or partner-name search, at most 100 characters.
- Awaiting approval, store sync needed, needs source review, approved, pending,
  reversed, ineligible, no payable commission, or all review states.
- Exact currency and all/7/30/90-calendar-day original creation date, in UTC.
- Saved 25/50/100-row page size and timestamp preferences.
- Ready approvals appear first, followed by stale-sync and source-review groups,
  then other states. Within each group: received update descending, ID descending.
  Oversized valid pages resolve to the last actual page; empty results use page 1.

Review-state option counts follow search, currency and dates across all states.
Summary cards count the currently matching orders, ready approvals and source/sync
blocks. They do not sum amounts with different currencies or precisions.
The selector limits visible currency choices to 200 and retains a selected value;
unfiltered order history includes every currency.

`q`, `state`, `currency`, `range`, `page` and `order` are the only query keys.
Repeated fields, malformed values and query-selected authority are rejected with
a recoverable reset link. Selection requires a UUID. Unknown/foreign selected
orders are not replaced with a different order or a global queue.

## Read boundaries and source states

Saved account type determines access. Every row joins its order application to
the program and owned workspace, and requires its store to belong to that same
workspace. Historical suspended partnerships remain readable. No database schema,
payment destination, encryption key, provider or callback configuration changes.

Effective commission, approval coverage and Shopify source readiness reuse the
existing shared queries. A pending Shopify source hold projects zero commission
and source-review state. Stale, incomplete, leased or inactive Shopify sources
block approval where the current payment controls already require it. The queue
does not start a store sync, contact a provider or decrypt credentials.

Stats, page, selected detail, scoped state counts and currency choices share one
read batch. Only public order/approval fields and the partner display name are
selected; store credentials and internal source-hold reasons are excluded.

## Explicit approval

The existing PaymentAction posts only `orderId` and the displayed `revision` to
the existing `approveCommission` API. Its current same-origin, approved-account,
business-family, workspace ownership, revision and source checks remain intact.
There is no bulk approval or approval during a page read.

Opening an old order retains filters and current page. After an explicit approval
and reload, selected detail shows the current state even if it left the filters.
Page navigation clears selection; a new filter form starts at page 1. A changed
order revision is rejected by the existing write path and must be reviewed again.
Approval covers commission; a separate partner payment request and explicit
payment workflow remain necessary. It does not approve a platform application or
move money.

## Preview and verification

Account-free business previews use `/preview/{brand|agency}/commission-approvals`.
They show clearly fictional existing sample orders. Preview actions only display
local notices and cannot call the payment API.

The isolated tests exercise 131+ records, both business roles, foreign and free
accounts, inconsistent store/program data, current approval coverage, reduced
commission and later increases, source holds and sync blocks, UTC boundaries,
literal search, saved preferences, stale pages and old selected orders. Bundled
actual pages and the existing actual API exercise access and explicit revision
guards without using production accounts or payment data.

Authenticated production walkthrough and dedicated mobile/browser visual QA are
not covered by the automated checks. Existing responsive tables, shared form,
pagination, theme and navigation components are retained.
