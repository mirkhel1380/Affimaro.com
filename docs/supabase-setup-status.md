# Selected Supabase project

Project configuration was verified on 2026-10-15 through the connected Supabase account and a bounded read-only Auth settings request. The owner's completed email confirmation was independently verified on 2026-10-17.

| Item | Verified result |
| --- | --- |
| Project | Affimaro |
| Project ref | `bhxzkrypfxdheyjtxwqp` |
| API URL | `https://bhxzkrypfxdheyjtxwqp.supabase.co` |
| Region selected during owner setup | `ap-southeast-2` |
| Project status | `ACTIVE_HEALTHY` |
| Email provider | Enabled |
| Email confirmation | Required |
| Signup | Enabled |
| Application key | Active modern publishable key; no privileged key |

The independent build and deployment preflight use `self-hosted/supabase-project.json` by default. Its publishable key is a public API identifier, not an admin secret. A complete `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` environment pair can intentionally select another project; partial overrides are rejected. Native Sites identity and deployment settings remain unchanged.

## Owner setup and delivery test on 2026-10-15

- The owner created a Resend account and a sending-access API key, and entered that key directly in Supabase SMTP settings. No SMTP/API secret was shared in chat or stored in this repository.
- The owner reported saving both signup-confirmation and password-recovery templates with `{{ .Token }}`.
- The owner created one test Auth user with automatic confirmation disabled, then used **Send password recovery** in Supabase. They confirmed receiving the recovery email with a code. This verifies that tested recovery delivery path, not a completed application login or signup confirmation.
- A subsequent read-only query found one Auth user and zero email-verified users. Receiving a code alone does not confirm the account.
- No Affimaro domain has been purchased yet. The temporary `onboarding@resend.dev` sender can deliver only to the email address associated with the Resend account. Customer delivery still needs a verified owned domain.
- The owner connected GitHub to the Cloudflare Worker project `affimaro-com`. Its first deployment used the native build defaults and failed on a placeholder D1 ID. The owner supplied the independent D1 ID `9b4539f6-dd2a-4ce7-85c5-4733f799ed11`; its public account/database/origin selection is in source. On 2026-10-17 the owner completed migration, mapping and deployment; see [Cloudflare GitHub setup](cloudflare-github-setup.md) for current status.

New Free Supabase projects using default SMTP cannot edit Auth email templates under the [2026-06-03 change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier). Configuring custom SMTP restores customization without changing the Supabase plan.

Current setup status:

1. Signup-confirmation code verification succeeded for the owner on 2026-10-17. The app accepts provider codes from 6–10 digits. The owner reported successful independent-host sign-in and password recovery on 2026-10-18. See the prepared HTML under `supabase/templates/` and the [independent-hosting guide](independent-hosting.md).
2. Verify an owned sending domain and test delivery to intended users before customer signup. Provider quotas and sender setup are not verified by the public settings endpoint.
3. The owner saved the independent origin as Supabase Site URL and reported a successful Cloudflare deployment. Home/sign-in/recovery pages respond at that origin.
4. Encrypted data/key import and verified legacy mapping are complete. Preserve the populated target and the paused native source; do not repeat the import or recreate the owner.
5. Verify real signup, email receipt, recovery and session behavior on the independent host before opening traffic.

The initial project verification and later provider status queries were read-only. The test user, SMTP/template changes and recovery email were performed by the owner in their dashboard. The owner subsequently performed encrypted migration and verified identity mapping on the independent D1 target. The native Site remains owner-private, uses native authentication and is paused for cutover.

The owner-private Site includes `/setup/confirm-email`, originally used to enter a confirmation code before the independent host existed. It is limited to the current native account's registered email, offers an explicit resend, and retains no provider credentials or app sessions. The owner successfully submitted the code on 2026-10-17. A read-only provider query confirmed the existing user's email-confirmation timestamp. Legacy identity linking is complete, and the owner reported successful independent sign-in and password recovery on 2026-10-18.

## Workers transport correction on 2026-10-17

The owner's confirmation request returned HTTP 503 before reaching Supabase. The pinned Workers runtime rejects `redirect: 'error'` when constructing outbound requests, although Node accepts it. Runtime provider calls now use `redirect: 'manual'` and reject non-success responses without forwarding credentials, verification codes or writes to a redirect destination. Node-only deployment and migration preflight requests retain their supported redirect policy.

The new Workers-runtime regression test bundles the production confirmation and independent Auth handlers with the installed Wrangler toolchain. It verifies resend, code verification, identity checking, local session revocation and redirect rejection against an isolated provider fixture. The previous transport fails the same test with HTTP 503. The owner's subsequent real code submission succeeded and its provider confirmation was independently checked. Migration and deployment were completed later that day; the authenticated walkthrough remains pending.

`GET /api/setup/confirm-email` is a native-only, read-only provider-policy check behind the owner-private Site boundary. It returns only availability, uses the same transport as confirmation, and never reads account data, sends email or submits a code. This allows a deployed connection check without impersonating a visitor. Local Workers tests use an isolated provider because this container's Workerd DNS cannot resolve the external Supabase host directly.

## English setup UI and verified owner status on 2026-10-17

The setup page, form controls, success/help text and server-side error messages now use English with left-to-right layout. A read-only query of the existing Supabase user confirmed that `email_confirmed_at` is populated. No user was recreated, no password or email-verification policy was changed, and no legacy mapping or data migration was performed by this update.

## Independent browser form correction on 2026-10-17

The owner's first independent sign-in returned `Open the form on this site and try again.` before any credential check. Auth pages were served with `Referrer-Policy: no-referrer`, which makes browser HTML POST navigation send `Origin: null`. The source now serves `same-origin` so its own forms retain their origin without sending referrers to external sites. Exact-Origin checks, encrypted flow cookies, nonce checks and cross-site rejection remain enforced. A regression test fails with the previous policy (403) and passes with the corrected policy (303). Provider identities, passwords and confirmation settings are unchanged by this correction.

## Owner pilot closeout on 2026-10-18

The owner reported that independent sign-in and password recovery now work. Temporary native migration export enabled/owner/public-key settings were removed; the existing saved native version 19 was deployed successfully with environment revision 4. The source remains owner-private and paused, with its original data and payment key retained. No keys were regenerated, no rows were re-imported and no customer-domain or payment-provider setup is implied by this closeout.

The store setup now displays the current installation's Affimaro URL. WooCommerce plugin 0.3.1 starts without a default host, preserving saved connections and requiring new installations to use their own workspace address. Independent HMAC delivery is checked without a private Sites service token; optional native service access remains origin-bound. Real store attribution, checkout and refunds still need staging verification.
