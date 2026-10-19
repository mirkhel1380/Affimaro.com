# Four dedicated portals

| Account | Sign-up | Home | Distinct tools |
| --- | --- | --- | --- |
| Brand | `/auth/brand/signup` | `/workspace` | Program, partners, connection, orders and business settings |
| Affiliate | `/auth/affiliate/signup` | `/partner` | Publisher profile, applications and referral links |
| Creator | `/auth/creator/signup` | `/creator` | Creator channel profile, private content planner, partnerships and earnings |
| Agency | `/auth/agency/signup` | `/agency` | Agency profile, private client directory and one represented program |

Each account has one immutable primary portal. Email verification creates a draft application, not an operating workspace or approved partnership. Creator applications include platform, formats, publishing rhythm and portfolio. Agency applications include agency name/site/services/client context and the represented brand. The owner can approve, request details or decline each complete submission.

`account_portals` records exact role ownership independently from the original merchant/publisher accounting families. Creator commission uses the established partner accounting; agency program management uses the established business accounting, with identity-scoped records and an exact role check on dedicated pages. Shared finance components do not create a dashboard role switch. Provider `user_metadata`, query parameters and submitted role/status fields never grant privileges.

The additive D1 migration creates `account_portals`, `plan_requests`, `creator_content` and `agency_clients`. It preserves existing account IDs, workspaces, programs, sessions, financial records, encrypted provider settings and keys. Existing admissions retain their original brand/affiliate role; existing approved brands receive the Starter capacity record. The independent owner bootstrap remains idempotent and checks the established verified identity before deployment.

Creator content is limited to 250 private entries. Only an owned, currently approved program application can be attached. Marking an item published requires an HTTPS URL but does not publish externally, validate a conversion or create commission. The planner never reads another creator’s records.

Agency client records store a contact, website, engagement status and notes. The owner must confirm authority before saving. Records do not create or connect a store, provision a second program or allow access to another account. One represented brand program is managed per agency account. Package limits apply atomically to new records and approved partner additions.

See `subscriptions-setup.md` for package capacities and the separation between capacity requests and actual subscription payment.

Verification uses isolated SQLite/D1-compatible transactions, real server-rendered TSX, four mocked provider authentication journeys, full existing regression tests, TypeScript, both production builds and live public/anonymous HTTP checks. Browser/device visual QA is unavailable in this environment; no authenticated production owner session is fabricated.

Approved brands and agencies choose a paid package and proceed directly to payment. The owner reviews profiles, not package purchases. Verified live payment activates capacity automatically; affiliate and creator accounts remain free.
