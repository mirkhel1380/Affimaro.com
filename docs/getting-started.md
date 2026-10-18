# Getting started

`/start` is the authenticated business setup guide; `/start?view=affiliate` shows the affiliate guide. Both use the current server-verified identity and preserve the selected guide when sign-in is required. Account, workspace and billing pages link to the guide. The public website explains where to begin and distinguishes current Starter features from planned packages.

The guide reads existing records only. It does not create profiles, workspaces, applications, subscriptions, provider connections, orders or payments. Each step links to the existing form or dashboard responsible for that action. Progress is recalculated on each visit; no local checklist or manually persisted completion flag is used.

## Business progress

The six steps cover the account profile, workspace, reviewed/active program, active/verified store, first approved affiliate and first received attributed order. A new workspace's default rules are not considered reviewed until the owner saves program settings. Pausing a program or connection returns its current setup step to incomplete. An old received order remains a historical milestone and never proves commission approval, refund verification or payment settlement.

A saved store URL or generated signing key does not count as a verified connection. WooCommerce needs a signed delivery; Shopify verification follows its existing connected-account state. Neither verification alone proves that any order has arrived. Shopify orders still require dashboard sync. The invitation card copies the owner's current program application path using the current host.

## Affiliate progress

The five steps cover the account profile, affiliate profile, a submitted application, an available approved referral link and a received referred order. Pending applications and approved programs without an eligible store display “Awaiting business.” Referral-link eligibility matches the existing portal: approved application, active program and active connection with a verification timestamp. Pausing/suspending any of these removes current referral readiness without erasing application/order history. Business subscriptions and business workspaces are not prerequisites for affiliate access.

## Access and verification

Every business summary derives its owner and workspace from server identity; affiliate aggregates derive the current applicant from the same identity. Only minimal counts and program/connection states are selected. Store signing keys, encrypted credentials, bank destinations, payment details and subscription records are not loaded. No schema or runtime-secret change is needed.

The independent entry includes `/start` in its authenticated route set, strips spoofed identity headers, resolves the session, and adds `Cache-Control: private, no-store` and `Vary: Cookie`. The route is dynamic. Native Sites keeps its existing identity and paused owner-private publication. The mobile service worker continues to fetch private navigation from the network and never adds the guide to its offline cache.

Automated tests use the real SQL migrations in isolated databases and provider fixtures. They cover empty accounts, read-only loading, separate owners/affiliates, rules review, saved-versus-verified connections, real order milestones, paused/suspended eligibility, verified sessions, anonymous/header-spoofed requests and provider revocation. Production HTTP checks verify anonymous redirects and cache headers. Supported browser preview is unavailable; the authenticated visual/form walkthrough remains a user/device check.

Authentication reference: [Supabase server-side caching guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache).
