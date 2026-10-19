# Public preview and partnership workspaces

`/preview` opens all four customer portals without authentication. These pages use the production shell, presentation styles and role-specific application form, with fictional sample records. They never query production customer data or make application/payment/closure requests. Browser-local sample actions can be reset. Existing `/demo/{brands,affiliates,creators,agencies}` links redirect to these previews. The private owner portal and every production write API retain authentication.

## Real account navigation

Affiliates and creators use **My brands**. Brands and agencies use **My partners**. Both have All, Approved, Pending, Invitations, Declined and Suspended views, search and pagination. Invitation status is separate from partnership status. Brand/agency invitations belong to their own represented program. A partner who accepts an invitation creates or reopens a pending application; acceptance never automatically approves a partnership.

Approved partner rows open **Assets, coupons & links**. Brands/agencies publish hosted asset URLs, plain-text promotional copy and store coupon details, either for all approved partners or one approved partnership. Pending, rejected, foreign or closed accounts cannot read another partnership’s resources. Active coupon dates and assigned scope are enforced server-side. Create and test coupons in the merchant’s store before publishing; Affimaro does not create store discounts or infer commission from code use.

## Recorded link clicks

New dashboard and invitation links use `/r/{application_id}`. The redirect resolves an approved, open partnership and active, verified store; its destination comes only from the saved connection. Existing WooCommerce/custom `affimaro_ref` and Shopify `ref`/UTM parameters are preserved. No arbitrary request-supplied redirect destination is accepted.

GET requests record source, medium, referring hostname, broad device category, country and UTC timestamp. Full referring URLs, IPs and raw user-agent strings are excluded. Known crawlers, preview fetches and HEAD requests do not count. Recording is best effort; a telemetry failure does not stop the store redirect. Counts describe raw recorded events, not verified unique people, consented store sessions or purchases. The separate private **Clicks** page is scoped to the member’s own partnerships or represented program. It can filter by partnership and 7/30/90 UTC calendar-day periods. A daily trend graph includes zero-click days, an interactive day selector and an accessible daily-values table. A source distribution graph uses the same account, partnership and date scope as the activity table. Public previews use the same graphs with filtered fictional data. Older rows are pruned in bounded batches when links are used. Historical direct-to-store links and imported Shopify conversion sessions are not retroactively counted here.

No real accounts, invitations, coupon discounts, payments or visitor clicks are created by the tests or public preview.
