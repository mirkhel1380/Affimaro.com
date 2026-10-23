# Public preview and partnership workspaces

`/preview` opens all four customer portals without authentication. These pages use the production shell, presentation styles and role-specific application form, with fictional sample records. They never query production customer data or make application/payment/closure requests. Browser-local sample actions can be reset. Existing `/demo/{brands,affiliates,creators,agencies}` links redirect to these previews. The private owner portal and every production write API retain authentication.

## Real account navigation

Affiliates and creators use **My brands**. Brands and agencies use **My partners**. Both have All, Approved, Pending, Invitations, Declined and Suspended views, search and pagination. Invitation status is separate from partnership status. Brand/agency invitations belong to their own represented program. A partner who accepts an invitation creates or reopens a pending application; acceptance never automatically approves a partnership.

Approved partner rows open **Assets, coupons & links**. Brands/agencies publish hosted asset URLs, plain-text promotional copy and store coupon details, either for all approved partners or one approved partnership. Pending, rejected, foreign or closed accounts cannot read another partnership’s resources. Active coupon dates and assigned scope are enforced server-side. Create and test coupons in the merchant’s store before publishing; Affimaro does not create store discounts or infer commission from code use.

## Recorded link clicks

New dashboard and invitation links use `/r/{application_id}`. The redirect resolves an approved, open partnership and active, verified store; its destination comes only from the saved connection. Existing WooCommerce/custom `affimaro_ref` and Shopify `ref`/UTM parameters are preserved. No arbitrary request-supplied redirect destination is accepted.

GET requests record source, medium, referring hostname, broad device category, country and UTC timestamp. Full referring URLs, IPs and raw user-agent strings are excluded. Known crawlers, preview fetches and HEAD requests do not count. Recording is best effort; a telemetry failure does not stop the store redirect. Counts describe raw recorded events, not verified unique people, consented store sessions or purchases. The separate private **Clicks** page is scoped to the member’s own partnerships or represented program. It can filter by partnership and 7/30/90 UTC calendar-day periods. A daily trend graph includes zero-click days, an interactive day selector and an accessible daily-values table. A source distribution graph uses the same account, partnership and date scope as the activity table. Public previews use the same graphs with filtered fictional data. Older rows are pruned in bounded batches when links are used. Historical direct-to-store links and imported Shopify conversion sessions are not retroactively counted here.

No real accounts, invitations, coupon discounts, payments or visitor clicks are created by the tests or public preview.


## Program applicant review

Brands open `/workspace/partners/{application_id}` and agencies open `/agency/partners/{application_id}` from **Review application** in My partners. The server resolves ownership through the signed-in member's represented program; other brands, agencies and partner roles cannot read the record. The review is available for a submitted program applicant even if their discovery listing is private. Only promotional profile fields and current public channel status are shared. Contact details, legal fields, verification challenges/evidence notes, internal owner notes and payment details are excluded.

The shared review panel shows affiliate/creator-specific audience and content information, self-reported promotion plans, current channel verification and the program's decision. Approval through the existing API rechecks that the applicant's account is open and approved and that all claimed properties still have current verification. Subscription and package-capacity checks remain in place. Declining or suspending a partnership stays available without granting new access. Neither action initiates payment. Existing approved partnerships are not automatically changed by viewing the review.

Sending an invitation returns to the sender's own My partners invitation list. Accepting an invitation returns affiliates/creators to their own pending program applications. Acceptance remains separate from final program approval. Public sample reviews are available at `/preview/brand/relationships/profile/alex` and `/preview/agency/relationships/profile/sofia`; all sample decisions remain browser-local.
