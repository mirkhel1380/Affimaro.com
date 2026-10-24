# Recorded store setup progress

Brand store setup opens at `/workspace?tab=store`; an agency's represented program opens at `/agency/program?tab=store`. WooCommerce, custom website and Shopify controls retain that same portal after connection actions, refreshes and order navigation. Choosing a platform does not grant access to another account or connect another store.

The workspace overview distinguishes a saved connection, verification and received referral/order data. A valid signed connection test or a verified Shopify app alone is not treated as proof that an order has been imported. Connected workspaces show a recorded setup checklist:

- Create the one supported connection.
- Verify an active connection.
- Activate the represented partner program for new links and applications.
- For Shopify, finish sync with no outstanding saved data holds.
- Receive recorded referral data.
- Receive the first referred order.

These checks derive only from the signed-in business's existing connection, program, referral count, complete order totals and public Shopify status projection. They do not add a database table, decrypt credentials, contact a store, trigger sync or approve commission. Last activity and completed Shopify sync timestamps are shown in UTC. Referral evidence on Shopify comes from imported order conversions; it is not a count of every storefront visit.

Paused connections/programs, missing verification, first sync pending, another sync batch, data holds and a completed empty sync have separate explanations. Shopify test orders remain excluded by the existing adapter. An empty completed sync does not prove a failure and does not mark the first referred-order check complete. Receiving an order still requires separate eligibility and commission review.

The checklist is a saved snapshot. Refresh it after connection changes or a new delivery. Save a newly generated signing key before refreshing; the form still shows it only once. Opening the controls anchor preserves the current form. Creating a signed connection keeps the new key visible and provides the matching portal's refresh link. Rotating a key resets verification while preserving prior referrals and orders, so old order history cannot complete the current verification check.

Verification uses isolated real server views, recorded Shopify metadata and signed connection/referral/order fixtures. Both business roles and both partner-role denials are covered. Tests check paused states, program state, key rotation, incomplete sync, data holds, empty sync, portal-specific navigation and read-only/privacy behavior. No production connection, signing key, Shopify credentials, store order or financial record is changed. A real merchant-store walkthrough and dedicated mobile/browser visual QA remain unexercised.
