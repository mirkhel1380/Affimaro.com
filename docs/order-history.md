# Complete referred order history

Every customer portal now has **Reports → Referred orders**:

| Portal | Private path | Record scope |
| --- | --- | --- |
| Brand | `/workspace/orders` | Orders in the owned program's store |
| Agency | `/agency/orders` | Orders in the agency's represented program's store |
| Affiliate | `/partner/orders` | Orders attributed to that affiliate's applications |
| Creator | `/creator/orders` | Orders attributed to that creator's applications |

Existing dashboard tables retain their latest 100 received orders and link to the full history. The full history does not have that 100-order limit. It uses the saved 25/50/100 page-size preference. Equal delivery timestamps have a stable order-ID tie breaker. A page beyond the current result count resolves to the last available page, including after filters narrow the result.

Search matches a literal case-insensitive substring of the external order ID or counterpart's display name. It does not search emails or customer data. Commission state, currency and all-history/7/30/90-day creation-date filters combine with search and are retained in pagination. Applying filters starts at page one. Known repeated or invalid filters show a recoverable error. Query parameters cannot select a user, workspace or role; the saved account controls authority. Page numbers are bounded to 1,000,000.

Date windows use UTC calendar days and the original order creation time. Displayed timestamps use the member's saved timezone and date-format preferences. Rows sort by their latest received update. Cards count every matching order across pages, including older orders needing review. Currency amounts retain each row's own precision; currencies are never added together. Currency choices are bounded to 200 saved currencies and retain a current selection, with a visible limit label; an unfiltered view still includes every currency.

The existing effective-commission query is reused: an unresolved Shopify source hold presents the order as needing review with zero estimated commission. Clearing the hold allows the saved current state to appear again. Current commission state is separate from business approval and payment status. Suspension or store pause does not erase historical orders. An order's store must match its application's program workspace.

This is a read-only view of saved data. It does not sync stores, contact providers, create orders, approve commissions, move money, change signing keys or rewrite history. Summary, page rows and currency choices are read in one D1 batch. No schema migration is needed. Existing approval and payment controls remain in Payments; dated aggregate exports remain in Performance reports. No order-by-order CSV export is added here.

The public four-role previews point to their existing fictional order examples, with no login or real account access. They do not claim to be a live connected order history.

Isolated SQLite and actual server-page fixtures cover all four roles, more than 100 orders, stable tied pagination, old review rows, combined filters, UTC boundaries, precision, source holds, malformed input, inconsistent store associations, saved preferences and read-only behavior. A real authenticated customer walkthrough and dedicated mobile visual checks remain unexercised.
