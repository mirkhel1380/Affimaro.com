# Applications, ownership and discovery

The four account roles have separate six-step applications and portal navigation. Progress is saved with revision checks; drafts accept unfinished text. Submission validates the complete role-specific schema. The owner still approves admission once; brand and agency subscriptions use the existing automatic paid verification workflow.

## Verify claimed properties

A member lists each website, social profile, newsletter, podcast, app or community in **Channels & ownership**. The catalog includes an Other option. Every declared primary/additional URL, agency website and creator portfolio must be covered by a currently verified property before admission approval. Additional active properties must also be verified. A concurrent revocation prevents approval.

Website DNS verification checks the exact `_affimaro-verify.<hostname>` TXT record against a unique account/property challenge. It uses only a fixed DNS-over-HTTPS endpoint; arbitrary submitted HTTP URLs are never fetched by the server. A DNS proof covers that hostname. Public website proofs cover their approved page or website path; social proofs cover the exact profile URL.

Other properties use a public code review. In the independent owner portal, open **Channel verification**, inspect the proof on the exact claimed property, confirm the publishing account and claimed relationship, enter the observed code, and record a decision and note. Do not accept a code on an unrelated account, a visitor comment, or a page controlled by somebody else. Request changes when control or authorization is unclear. Only then approve the account application. Codes last 14 days; verification must be renewed after 180 days or when control changes. This is control/authorized-management verification, not a legal title check. Approved social OAuth apps are not configured in this release.

## Discover partners

All four portals have a role-specific Discover entry, with directories for brands, affiliates, creators and agencies. Members can search, filter, paginate, save profiles and use in-app program invitations. A listing is opt-in under **My listing**. Only approved, open accounts with current verified channels are shown; business listings require an active represented program.

Only reviewed display/business details and verified public links appear. Contact email, phone, legal-registration fields, review notes, private client records and financial details are excluded. Audience ranges remain self-reported. Invitations stay inside Affimaro; accepting one creates a pending program application, never an approved partnership or a payment. Brands/agencies can invite only to their own active program.

## Close an account

**Account settings → Close my account** requires the current session, password reauthentication, typing CLOSE and explicit acknowledgement. The platform owner account cannot close through this feature. Outstanding commissions, refund debt, open payouts/transfers, pending or uncertain orders, incomplete store sync, active billing operations, open checkouts and unconfirmed continuing subscriptions block closure. Brand/agency subscribers first cancel renewal and check subscription status in billing. Confirmed period-end cancellation with a paid invoice allows closure after a fresh provider check. An unpaid saved checkout can be canceled without creating a charge.

Closure pauses programs and participation, removes discovery visibility and revokes every local session. A retained tombstone blocks sign-in even if a Supabase token has not expired. Identity mapping, transactions, encrypted payment records and review history remain. The owner can inspect closed accounts and media properties in Platform records. No live account is closed by deployment or tests.
