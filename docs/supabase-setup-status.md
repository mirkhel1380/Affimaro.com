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
- The owner opened their Cloudflare Workers & Pages account. Git connection, independent D1, credentials, migration and deployment remain pending. See [Cloudflare GitHub setup](cloudflare-github-setup.md).

New Free Supabase projects using default SMTP cannot edit Auth email templates under the [2026-06-03 change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier). Configuring custom SMTP restores customization without changing the Supabase plan.

The following setup is still pending:

1. Test actual signup confirmation and code verification. The app accepts provider codes from 6–10 digits. See the prepared HTML under `supabase/templates/` and the [independent-hosting guide](independent-hosting.md).
2. Verify an owned sending domain and test delivery to intended users before customer signup. Provider quotas and sender setup are not verified by the public settings endpoint.
3. Configure the independent application origin and Cloudflare account/D1 deployment settings.
4. Preserve and migrate existing data/payment keys and explicitly map verified Supabase identities.
5. Verify real signup, email receipt, recovery and session behavior on the independent host before opening traffic.

The initial project verification and later status queries were read-only. The test user, SMTP/template changes and recovery email were performed by the owner in their dashboard. No database rows have been migrated and no independent deployment has been published. The current Site remains owner-private and uses its native authentication.
