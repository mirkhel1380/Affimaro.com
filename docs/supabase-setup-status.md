# Selected Supabase project

Verified on 2026-10-15 through the connected Supabase account and a bounded read-only Auth settings request.

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
- The owner connected GitHub to the Cloudflare Worker project `affimaro-com`. Its first deployment used the native build defaults and failed on a placeholder D1 ID. The owner then supplied the new independent D1 ID `9b4539f6-dd2a-4ce7-85c5-4733f799ed11`; its public account/database/origin selection is in source. Authenticated Cloudflare ownership checks, build credential permissions, migration and a successful independent deployment remain pending. See [Cloudflare GitHub setup](cloudflare-github-setup.md).

New Free Supabase projects using default SMTP cannot edit Auth email templates under the [2026-06-03 change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier). Configuring custom SMTP restores customization without changing the Supabase plan.

The following setup is still pending:

1. Test actual signup confirmation and code verification. The app accepts provider codes from 6–10 digits. See the prepared HTML under `supabase/templates/` and the [independent-hosting guide](independent-hosting.md).
2. Verify an owned sending domain and test delivery to intended users before customer signup. Provider quotas and sender setup are not verified by the public settings endpoint.
3. Apply the independent Cloudflare build/deploy commands and complete credential/secret setup for the selected account, D1 and intended origin.
4. Preserve and migrate existing data/payment keys and explicitly map verified Supabase identities.
5. Verify real signup, email receipt, recovery and session behavior on the independent host before opening traffic.

The initial project verification and later status queries were read-only. The test user, SMTP/template changes and recovery email were performed by the owner in their dashboard. No database rows have been migrated and no independent deployment has been published. The current Site remains owner-private and uses its native authentication.

The owner-private Site now includes `/setup/confirm-email` to enter a confirmation code before the independent host is deployed. It is limited to the current native account's registered email, offers an explicit resend, and retains no provider credentials or app sessions. The latest live query still showed one unconfirmed provider user before this helper was implemented; successful end-to-end confirmation awaits the owner's code submission. Receiving emails and saving the Cloudflare authentication secret do not complete data/key migration or legacy identity linking.

## Workers transport correction on 2026-10-17

The owner's confirmation request returned HTTP 503 before reaching Supabase. The pinned Workers runtime rejects `redirect: 'error'` when constructing outbound requests, although Node accepts it. Runtime provider calls now use `redirect: 'manual'` and reject non-success responses without forwarding credentials, verification codes or writes to a redirect destination. Node-only deployment and migration preflight requests retain their supported redirect policy.

The new Workers-runtime regression test bundles the production confirmation and independent Auth handlers with the installed Wrangler toolchain. It verifies resend, code verification, identity checking, local session revocation and redirect rejection against an isolated provider fixture. The previous transport fails the same test with HTTP 503. This does not replace the owner's real email-code submission or the still-pending independent-host migration and deployment checks.

`GET /api/setup/confirm-email` is a native-only, read-only provider-policy check behind the owner-private Site boundary. It returns only availability, uses the same transport as confirmation, and never reads account data, sends email or submits a code. This allows a deployed connection check without impersonating a visitor. Local Workers tests use an isolated provider because this container's Workerd DNS cannot resolve the external Supabase host directly.
