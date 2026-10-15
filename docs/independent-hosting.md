# Independent hosting and email sign-in

Affimaro has two deployment targets. The existing owner-private ChatGPT Site retains Sites authentication. The independent target uses Cloudflare Workers/D1 and Supabase Auth. Its source and deployment workflow are prepared, and the owner-created Supabase project is selected for the independent build. See the [verified project status](supabase-setup-status.md). The independent domain, hosting, email delivery and production cutover remain unconfigured.

## Boundaries

- Native: `vite.config.ts`, `build/sites-worker.ts`, `npm run build`. Publish only through Sites. Its audience and existing runtime payment key are unchanged.
- Independent: `vite.self-hosted.config.ts`, `self-hosted/worker.ts`, `npm run build:self-hosted`. The builder uses an isolated source copy because the current Vinext version writes manifests under `dist/`. The resulting package is `dist-self-hosted/`; the native package is untouched.
- Never deploy the native Worker as an ordinary public Cloudflare Worker. Only the independent entry strips caller-supplied `oai-authenticated-user-*` headers and replaces them with a verified session identity.
- Business records continue to use D1. Supabase stores authentication identities and passwords; no application password is stored in D1. This is a web sign-in flow, not yet a native mobile authentication API.

## Supabase configuration

The owner created the Affimaro project `bhxzkrypfxdheyjtxwqp`. The independent build now uses its URL and active modern publishable key by default, with live verified-email settings confirmed. This code does not create a project, select a paid plan, change provider settings or email anyone during setup.

1. Enable the email/password provider and **Confirm email**. The server checks `/auth/v1/settings` before password login, signup or code verification and refuses access if automatic email confirmation is enabled.
2. Set the Site URL to the independent `APP_ORIGIN`, with HTTPS and no path. This app does not accept session tokens in callback URLs.
3. Configure the signup confirmation and password-recovery email templates to show `{{ .Token }}`. For example, use `Your Affimaro verification code` / `Your Affimaro password reset code` as the subjects and `<p>Your code is <strong>{{ .Token }}</strong>.</p>` as the body. Do not require a confirmation-link click: users submit the code at `/auth/verify`.
4. Keep the provider’s configured OTP length (the app accepts 6–10 digits), set an appropriate expiry and a real sending identity/SMTP service. Test delivery to the intended users. Provider email quotas, sender verification and any provider costs require the owner's account setup.
5. The selected project URL and active publishable key are already bound in `self-hosted/supabase-project.json`. To intentionally use another project, set both `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` together; partial overrides fail validation. Never use a service/admin key in the running web app.

Passwords are 12–128 characters for signup/reset. Login accepts an existing password up to 128 characters. Forms require an encrypted, short-lived HttpOnly flow cookie, a matching nonce and the exact Origin. The server limits request size and stores salted, shared throttles for the email and Cloudflare client IP. Passwords and provider tokens are never reflected into HTML or URLs.

The browser receives an opaque `__Host-affimaro_session` cookie: Secure, HttpOnly, SameSite=Lax, Path=/, with a maximum 30-day lifetime. Only its SHA-256 hash is stored in D1. Provider access/refresh tokens are separately encrypted with `AUTH_SESSION_ENCRYPTION_KEY`. Authenticated requests verify the current provider user; refresh rotation uses a D1 lease. Provider outages fail closed. Recovery sessions last ten minutes and cannot access business pages. A successful password reset removes all local sessions and attempts global provider sign-out. Logout revokes the local session even during a provider outage.

## Cloudflare and deployment settings

Use a Cloudflare account, an HTTPS custom domain managed by that account, a new D1 database named `affimaro`, and a scoped API token permitted to manage that Worker/D1 database and attach the intended domain. Independent `workers.dev` and preview URLs are disabled. Do not use the native Site's D1 ID or domain.

| Setting | Where | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Local secret / GitHub production secret | Scoped Cloudflare deployment access |
| `CLOUDFLARE_ACCOUNT_ID` | Local setting / GitHub production secret | Intended hosting account |
| `CLOUDFLARE_D1_DATABASE_ID` | Local setting / GitHub production secret | New independent D1 database |
| `APP_ORIGIN` | Local setting / GitHub production variable | Exact independent HTTPS origin |
| `SUPABASE_URL` | Optional local / GitHub production variable | Paired project override; defaults to the selected Affimaro project |
| `SUPABASE_PUBLISHABLE_KEY` | Optional local / GitHub production variable | Paired key override; defaults to the active Affimaro publishable key |
| `AUTH_SESSION_ENCRYPTION_KEY` | Local secret / GitHub production secret | New random 32-byte lowercase hex key, separate from the payment key |
| `PAYMENT_DATA_KEY_V1` | Existing Worker secret, copied only by the encrypted migration | **Original** payment key; ordinary deployments never overwrite it |

Generate the new authentication key in a password manager or another secure local secret store and preserve it across deployments. Do not commit keys, put them in command arguments, or change `PAYMENT_DATA_KEY_V1`. Existing payment ciphertext is bound to the original account/request IDs and original key. The migration helper provisions the original payment key on the target; it is deliberately absent from the normal CI upload, so an accidental CI value cannot replace it.

The existing optional `AFFIMARO_BILLING_*` settings remain separate from merchant payment credentials. Carry them across if configured. Omitted billing settings preserve the pilot; no price or live payment is invented. Stripe Checkout freezes the return origin with each attempt; new Checkout, portal and receiving-account links use the configured independent origin.

## Preserve the existing data

There is an existing native account. Do not start a fresh public database or silently create a replacement account based on matching email.

1. Resolve pending Stripe transfers, uncompleted/unknown Checkout sessions, recipient creation and sync leases while the source is still running. The exporter rejects unfinished financial operations and leases.
2. On a trusted operator machine with Node 24, run `node scripts/migrate-self-hosted.mjs keygen`. Enter a private-key passphrase of at least 16 characters at the hidden prompt. The helper creates a 3072-bit RSA public key and a passphrase-encrypted private key under ignored `.migration/`, with restrictive permissions and no overwriting. Keep the private key and passphrase separate.
3. On the **source** Site, set `AFFIMARO_MIGRATION_ENABLED=true`, `AFFIMARO_MIGRATION_OWNER_ID` to the exact existing owner's account ID and `AFFIMARO_MIGRATION_EXPORT_PUBLIC_KEY` to the public PEM. These flags are not enabled by the code change. The migration page remains 404 without the matching authenticated owner and configuration.
4. When ready for the export window, set `AFFIMARO_MIGRATION_MAINTENANCE=true` on the source. This blocks business pages, writes and machine delivery. Wait **at least two minutes** for earlier requests to finish. Keep a record of the current source version. Do not enable writes on both hosts.
5. Open `/migration` as that owner, confirm the paused source and saved private key, and download the encrypted bundle. It includes allowlisted business tables, original IDs, store signing keys, encrypted records and original payment/billing settings. It excludes authentication sessions, rate limits and unrelated native credentials. The bundle uses AES-256-GCM and an RSA-OAEP-SHA256 wrapped random key; plaintext secrets never leave this response. The pilot exporter refuses more than 5,000 rows per table or about 4 MiB total rather than truncating.
6. Inspect locally with `node scripts/migrate-self-hosted.mjs inspect --bundle PATH`. The hidden passphrase prompt opens the bundle. Validation checks the allowlist, scalar types, SQL constraints and foreign keys in a temporary in-memory database. Only table counts and export time are printed.
7. Build the independent package using the intended account/domain/D1/Supabase settings. Apply the append-only schema to the **new empty independent** D1 with `node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config dist-self-hosted/server/wrangler.json`. Keep public traffic offline.
8. Import with `node scripts/migrate-self-hosted.mjs import --bundle PATH --apply`. The helper checks the independent target, a fresh export and empty application tables. It validates locally, imports through a restricted temporary SQL file, checks row counts, and copies the original payment/billing secrets through stdin. It removes that temporary file. An import/provider failure can require private inspection or a new empty target; the script does not claim cross-provider atomicity. Do not retry into a partially populated database or delete source data.
9. Prepare the corresponding **email-verified Supabase user** for each legacy account. Signup code verification can finish at the provider while the app returns the expected migration-mapping message. Obtain its exact provider UUID from the intended Supabase project. On the operator machine only, set `SUPABASE_ADMIN_KEY` temporarily and run `node scripts/migrate-self-hosted.mjs link --account-id ORIGINAL_ID --provider-id VERIFIED_UUID` to check, then add `--apply` to link. The helper verifies the provider's user directly, requires its confirmed email to match the selected legacy account and preserves all original IDs. Unique constraints prevent replacing an existing mapping. Remove the temporary admin key afterward; it is never deployed or exported.
10. Preserve the native source and encrypted backup. Disable/remove migration export configuration once the target is verified. Keep the old source paused during the cutover; if rolling back before accepting new writes, unpause the source and leave the target offline. After new writes begin, reconcile them explicitly before a rollback.

The current native Site is **not** paused and none of these export/import steps have run. No original data or encryption key has been moved by this implementation.

## Publish the independent target

`npm run deploy:self-hosted -- --check` validates settings and the provider's verified-email policy without changing resources. Then run `npm run build:self-hosted` and `npm run deploy:self-hosted -- --dry-run`. Configuration must match the exact built package.

Once data, original keys and identity mappings are ready, and email delivery/templates have been tested, set `AFFIMARO_DATA_MIGRATION_CONFIRMED=true` and `AFFIMARO_AUTH_CONFIGURATION_CONFIRMED=true` in the deployment process. `npm run deploy:self-hosted -- --deploy` applies append-only migrations, uploads runtime secrets through stdin and deploys the independent package. Do not populate these confirmations until their checks are actually complete. A missing setting or confirmation stops deployment.

GitHub's **Deploy independent Affimaro** workflow is manual (`workflow_dispatch`). Configure the `production` environment's variables/secrets above and optional billing settings first. The workflow requires both data/email readiness inputs, runs tests/type checks/build and a dry run, then deploys. Pushing source does not publish the independent target or change the native Site audience.

## Verify before opening customer traffic

Check actual signup, inbox delivery, wrong/expired codes, login, logout and password reset on the intended domain. Confirm the legacy owner sees the same workspace and payment history. Use a second independent account to confirm tenant isolation. Test both desktop and mobile form layouts. Check that forged identity headers cannot reach protected data.

Update store endpoint configuration to the new origin while retaining each signing key. Keep old delivery paused during switching; allow queued retries to reach the new host, then reconcile order counts, refunds and commission balances. Recheck provider access, receiving accounts and subscription status against the intended provider accounts. Verify existing callbacks and new Stripe links return to the intended origin.

Automated SQLite/provider-boundary tests and both builds run without real email or financial-provider operations. A live Supabase/Cloudflare deployment, authenticated browser walkthrough, real email receipt, store checkout and provider/financial walkthrough remain required. The native mobile app is still planned.

Primary references: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [server auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Auth REST API](https://github.com/supabase/auth/blob/master/openapi.yaml), [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), and the locked Vinext/Cloudflare package documentation.
