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

The following setup is still pending:

1. Configure signup and password-recovery email templates with `{{ .Token }}`; the app accepts provider codes from 6–10 digits. See the prepared HTML under `supabase/templates/` and the [independent-hosting guide](independent-hosting.md).
2. Configure and test real email delivery before customer signup. Provider quotas and sender setup are not verified by the public settings endpoint.
3. Configure the independent application origin and Cloudflare account/D1 deployment settings.
4. Preserve and migrate existing data/payment keys and explicitly map verified Supabase identities.
5. Verify real signup, email receipt, recovery and session behavior on the independent host before opening traffic.

No auth users were created, email messages sent, database rows migrated, provider settings changed or independent deployment published during the read-only project verification. The current Site remains owner-private and uses its native authentication.
