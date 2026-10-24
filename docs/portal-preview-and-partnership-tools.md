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

Sending an invitation returns to the sender's own My partners invitation list. Accepting an invitation returns affiliates/creators to that program's application page, which shows its current state even when a decision has already been made. Acceptance remains separate from final program approval. Public sample reviews are available at `/preview/brand/relationships/profile/alex` and `/preview/agency/relationships/profile/sofia`; all sample decisions remain browser-local.

## Payment record clarity

Destination and receipt requests recognize brand and agency ownership through the represented program, while affiliates and creators can view only their own requests. The permission check runs before decrypting destination data. Private details stay out of initial page HTML and reports.

Wallet request controls use the full reserved balance, rather than inferring an open request from the latest 100 displayed rows. An older open request continues to disable a duplicate request. The server's existing reservation, idempotency and coverage checks remain authoritative.

Payment status explicitly separates waiting for review, approved but unpaid, an unconfirmed transfer, a bank/Wise transfer recorded by the business, and verified credit to a Stripe receiving account. Partial/full reversals and cancelled/declined reservations have their own descriptions. These labels do not prove bank receipt or initiate a provider operation. Commission controls respect the source state and sync readiness and do not label unresolved source rows approved.

## Changes during application and review

A new application is inserted only while its program is still active and both accounts are open. A pause or closure that commits after the form was opened cannot create a new application or a misleading application-received audit event. Existing unique application records and manual program review remain in place.

For approval, the server captures the applicant's account-approval revision, application state and current channel-evidence revisions before awaiting subscription eligibility. The database update requires that exact evidence and application state to remain current, with all active channels still verified and fresh. A concurrent account closure, profile change, channel update or competing decision leaves the newer state intact and asks the reviewer to reload. The existing paid-package and partner-capacity checks remain mandatory. Declining or suspending a partnership does not require an approval snapshot or start a payment. Audit events are written only when the corresponding application update succeeds.

An invitation to a closed business shows that the program is unavailable and links to retained My brands records. It does not offer reapplication or promotion links. A temporary pause retains its separate explanation. Verification is covered by isolated concurrency fixtures and the actual request handlers with a controlled subscription-check fixture; no live applications, decisions, invitations, closures or payments are created by these tests.

## Reviewed profiles on program application pages

Program join pages show the applicant's reviewed promotional profile with affiliate- or creator-specific information. The old inline account and four-field partner-profile editors are replaced by links to the full Affimaro application. A legacy partner profile alone does not make a new program application ready: the account's professional profile must be approved and its listed properties must have current ownership verification. Missing or stale verification links directly to Channels & ownership, carrying the selected program through the existing application journey. Pending program applicants see the same repair route if their channel evidence needs attention.

The promotional preview uses the same whitelist as program applicant reviews. It excludes private contact, legal, payment, reviewer and ownership-challenge fields. The complete account profile stays in the applicant's own application page. Returning from that approved profile says **Return to program** for a program destination and **Continue to payment** for brand/agency billing; affiliate and creator accounts retain their free portal destinations. Agency program owners and brand program owners receive links to their own partnership pages. Public requests, approval, subscription and capacity checks remain authoritative; these display changes do not send applications, modify profiles, change existing partnerships or start payments on page load.


## Invitation lifecycle and current decisions

Discovery's Invitations link opens the dedicated My partners/My brands invitation inbox. Older Discovery invitation URLs redirect to that inbox in the member's own portal, preserving the search and valid invitation-status filters. Each invitation shows its own history separately from the current application in that exact program. Existing approved applicants can open their partnership tools; businesses can open their own applicant review. No application from another program supplies this status.

A pending invitation older than a later decline or suspension cannot reopen that application. The business must withdraw the stale invitation and send a fresh one if it wants the partner to reapply. A fresh invitation is ordered after the previous decision, including consecutive actions within one millisecond or small request-clock differences. Accepting it preserves the original application identity and reopens it only as pending. Accepting an invitation while a direct application is already pending or approved preserves that application's state. Final program approval always remains a separate business decision.

The acceptance transaction rechecks the active represented program, both accounts, current application decision, recipient admission revision and exact verified channel evidence before recording the application, accepted invitation and audit together. Audit failures roll back the transaction. Paused, closed, superseded and verification-blocked inbox cards explain the next step without offering an invalid acceptance action. Senders' current admission and channel evidence and the prior application state are also checked at insertion. A state change returns a conflict; only the actual twenty-invitations-per-day limit returns a quota response.

Isolated database, actual-handler and server-page fixtures cover these states and all four role routes, including anonymous, cross-origin and foreign-actor denials. These checks do not send real invitations, approve real partners or initiate financial operations.


## Responding from the program page

A reviewed affiliate or creator opening `/join/{program_id}` sees their own pending invitation for that exact represented program, including the invitation note and the current application decision. The page reuses the dedicated inbox card and existing response API. When a new invitation follows a decline or suspension, the recipient can respond there instead of being left with only the earlier decision message. Reading the page does not submit an application or change the invitation. A first invitation has one explicit application action; the competing direct-apply button is suppressed while the invitation is pending.

The response returns to the same program so its latest application state is visible. A fresh invitation reopens a declined or suspended application only as pending, using its existing identity. An already approved application stays approved when the recipient acknowledges its invitation. Older invitations, paused programs and stale channel ownership retain their existing explanations and cannot offer an invalid acceptance action. The lookup requires the signed-in recipient, exact program, current program owner as sender, pending invitation status and open accounts. Other recipients, business roles and unrelated programs receive no invitation note. The isolated server-view fixtures cover both recipient portals and invitations from both business roles, unsafe note text, state changes and read-only rendering. No live invitation, decision or payment is created by the tests.


## Editing assets and coupon codes

Brands and agencies can open **Edit asset** or **Edit coupon** in their own resource library. The editor loads the exact active resource from the represented program, including when older records fall outside the displayed history. Titles, permitted-use text, URLs or promotional copy, partner assignment, coupon terms and validity dates can be changed without replacing the record identity or its creation time. Switching an asset type clears the unused URL or copy field. Archived records remain history and cannot be edited through a stale form. Active records are listed before archived history so newer archives cannot hide current materials.

Saving uses the existing paid-business access gate and an exact resource revision. It rechecks the current approved, open business owner and, for exclusive resources, an approved open partnership in the same program inside the database update. A concurrent edit, archive, account closure or changed assignment cannot overwrite newer data. Active coupon code uniqueness is checked for the program and assignment. The edit and its audit event commit or roll back together. Publishing now uses the same final assignment guard. Archiving remains available without a paid-subscription gate.

The form keeps an unavailable current assignment selected; it never silently changes an exclusive resource to all partners. The owner must explicitly choose a valid scope. Coupon dates display in the member's local timezone after the form initializes, preserve an unchanged stored instant including milliseconds, and convert changed values back to UTC before validation. The library distinguishes **Scheduled**, **Available**, **Expired** and **Archived**. Recipients continue to receive only active, currently valid codes and assets assigned to their own approved partnership. Updating an Affimaro coupon does not create or update a discount in the merchant's store.

Isolated database, actual API, server-rendered editor and timezone fixtures cover both business roles, both recipient roles, stale revisions, wrong roles/programs, strict request fields, paid access, concurrent assignment changes, audit rollback, unavailable selections and UTC boundaries. Tests do not modify live customer resources, store discounts or financial records. Dedicated mobile/browser visual QA remains deferred under the owner's current priorities.
