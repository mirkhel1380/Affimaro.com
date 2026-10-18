# Getting started

`/start` is the authenticated brand setup guide; `/start?view=affiliate` is the affiliate guide. The server determines which guide the account can open from its saved primary role. An opposite-role link returns to the account's own guide. Account and matching dashboard pages link to it. The public website explains where to begin and distinguishes current Starter features from planned packages.

## Separate accounts and registration

`/get-started` offers separate brand and affiliate registration. `/auth/brand/signup` collects a business name, while `/auth/affiliate/signup` collects the affiliate's main channel. The role and minimal setup details are bound in the encrypted verification flow; the password is never retained there. After provider-verified email confirmation, only a draft platform application is created. The applicant completes the detailed profile at `/application` and submits it for the Affimaro owner to review. Approval provisions only the corresponding business workspace or affiliate profile. Until then, protected navigation, APIs and exports remain blocked. Neither signup applies to a program, opens a subscription nor configures a payment destination.

`/login` offers separate sign-in pages. A brand account cannot sign in to the affiliate portal, and an affiliate account cannot sign in to the brand portal. Use a separate email/account for the other role. Existing legacy records keep their original identifiers; an account that already owns a business remains a brand account. Its historical affiliate record is preserved without providing a role switch. Unassigned accounts choose one primary role in their application. The established platform owner retains existing access; other unreviewed accounts still need a complete application and manual approval. Authenticated pages and APIs enforce this separation on the server.

The guide reads existing records only. It does not create profiles, workspaces, applications, subscriptions, provider connections, orders or payments. Each step links to the existing form or dashboard responsible for that action. Progress is recalculated on each visit; no local checklist or manually persisted completion flag is used.

## Business progress

The six steps cover the account profile, workspace, reviewed/active program, active/verified store, first approved affiliate and first received attributed order. A new workspace's default rules are not considered reviewed until the owner saves program settings. Pausing a program or connection returns its current setup step to incomplete. An old received order remains a historical milestone and never proves commission approval, refund verification or payment settlement.

A saved store URL or generated signing key does not count as a verified connection. WooCommerce and custom websites need a signed delivery; Shopify verification follows its existing connected-account state. Neither verification alone proves that any order has arrived. Shopify orders still require dashboard sync. The invitation card copies the owner's current program application path using the current host.

## Affiliate progress

The five steps cover the account profile, affiliate profile, a submitted application, an available approved referral link and a received referred order. Pending applications and approved programs without an eligible store display “Awaiting business.” Referral-link eligibility matches the existing portal: approved application, active program and active connection with a verification timestamp. Pausing/suspending any of these removes current referral readiness without erasing application/order history. Business subscriptions and business workspaces are not prerequisites for affiliate access.

## Program invitation journey

After platform approval, an authenticated `/join/[programId]` keeps a new partner's account, affiliate-profile form and application review on the same invitation path. It shows three steps: account, affiliate profile and sending an application. Saving or editing a profile returns to that invitation without applying. The partner separately chooses **Apply to this program**, with a disclosure of the profile fields shared with the business. No business workspace, subscription, email invitation or payment is created by this journey. A submitted request completes the application steps, rather than guaranteeing approval or earnings.

Owners see their sharing link and cannot apply to themselves. Other brand accounts also cannot apply to a program; they see guidance to use a separate affiliate account. A paused program offers no new setup/application form. Existing pending, declined, suspended or approved applications retain their current status and never silently reapply. Approved partners can copy their referral link directly from the invitation, using the same format and eligibility as the affiliate portal for WooCommerce, Shopify and custom websites. Pausing a program/connection, clearing verification or suspending approval removes current referral availability.

Profile form and Apply errors offer a sign-in link back through the invitation if the session expires. The existing protected route and same-origin API checks remain in place. Invitation loading reads only program details and the current applicant's own profile/status; approved-link lookup selects public store metadata with explicit current-user and eligibility filters. It never reads signing keys, payment credentials, bank destinations, orders or subscription records, and executes no writes. No schema or runtime-secret change is required.

Isolated SQL and real component-rendering tests cover account → profile → explicit application, owner/tenant isolation, duplicate requests, pauses, decisions, link parity across all three platforms, safe text escaping and read-only loading. A real authenticated browser walkthrough remains a separate device check.

## Access and verification

Every business summary derives its owner and workspace from server identity; affiliate aggregates derive the current applicant from the same identity. Only minimal counts and program/connection states are selected. Store signing keys, encrypted credentials, bank destinations, payment details and subscription records are not loaded. No schema or runtime-secret change is needed.

The independent entry includes `/start` in its authenticated route set, strips spoofed identity headers, resolves the session, and adds `Cache-Control: private, no-store` and `Vary: Cookie`. The route is dynamic. Native Sites keeps its existing identity and paused owner-private publication. The mobile service worker continues to fetch private navigation from the network and never adds the guide to its offline cache.

Automated tests use the real SQL migrations in isolated databases and provider fixtures. They cover empty accounts, read-only loading, separate owners/affiliates, rules review, saved-versus-verified connections, real order milestones, paused/suspended eligibility, verified sessions, anonymous/header-spoofed requests and provider revocation. Production HTTP checks verify anonymous redirects and cache headers. Supported browser preview is unavailable; the authenticated visual/form walkthrough remains a user/device check.

Authentication reference: [Supabase server-side caching guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache).
