# Cloudflare hosting from GitHub

Connect the existing private repository `mirkhel1380/Affimaro.com` through **Connect GitHub** in Cloudflare Workers & Pages. Grant the Cloudflare GitHub App access to this repository. Keep the repository private.

## Build configuration

| Cloudflare field | Value |
| --- | --- |
| Worker/project name | `affimaro-com` |
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:self-hosted -- --deploy` |
| Preview command, if shown | `npm run deploy:self-hosted -- --dry-run` |
| Node version | `24` (set build variable `NODE_VERSION` if needed) |

The build runs the automated checks, TypeScript and isolated independent build. The deploy command checks the selected provider policy, actual Cloudflare account subdomain, exact built configuration and both readiness confirmations before changing resources. Disable non-production branch builds for now. A preview dry run does not publish a preview URL.

The ordinary `npm run build` and `dist/server/wrangler.json` belong to the owner-private native Site. The ordinary build now stops immediately when `WORKERS_CI=1`, with the correct independent commands in the error. The independent package is `dist-self-hosted/server/wrangler.json`; its entry strips spoofed native identity headers and requires the independent verified session. Use the commands above rather than an automatically inferred framework deployment.

## Account identified during owner setup

The owner supplied the account URL, deployment screenshots and new D1 ID on 2026-10-15:

| Public setting | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | `72d03e04f40638313952d19c5739c34d` |
| Worker/project name shown in the failed deployment | `affimaro-com` |
| Workers account subdomain | `m-mirkhel20.workers.dev` |
| `CLOUDFLARE_D1_DATABASE_ID` supplied after creating D1 | `9b4539f6-dd2a-4ce7-85c5-4733f799ed11` |
| Intended `APP_ORIGIN` | `https://affimaro-com.m-mirkhel20.workers.dev` |

These public identifiers are selected in `self-hosted/cloudflare-project.json`. The independent build, deployment preflight and migration target checks use them by default; build secrets remain separate. The intended origin is a configuration value, not a claim that a working deployment exists. D1 ownership has not yet been checked through authenticated Cloudflare access. Preflight must verify the account's workers.dev subdomain before deployment. When replacing it with an owned custom domain, update `APP_ORIGIN` and Supabase Site URL, rebuild, and deploy the matching package.

The first Git-connected deployment used the default `npm run build` and `npx wrangler deploy`, then failed because its native package referenced the placeholder D1 ID `00000000-0000-4000-8000-000000000000`. Updating only the database ID in Cloudflare's dashboard is insufficient: replace both build/deploy commands with the independent commands above. Do not retry deployment before completing the remaining prerequisites.

## Required before the first deployment

1. Use the owner's new independent D1 ID selected above and verify it belongs to the intended account; do not substitute the native Site database. No migrations or data import have run on it yet.
2. Configure a scoped build API token with **Workers Scripts: Edit** and **D1: Edit** for the intended account. The Workers Scripts permission also permits the subdomain ownership check. Add route/domain permissions only when attaching a custom domain. Cloudflare's default build token does not document D1 edit permission, so verify its permissions rather than assuming migrations will work.
3. The account, D1 and origin already come from source for this account. Intentional environment overrides are supported. Changing the account requires overriding the D1 and origin together; an origin-only override supports a future custom domain on the same account. The selected Supabase public settings also come from source; overrides must be a complete URL/key pair. Do not add blank overrides.
4. Add a new random 32-byte hex `AUTH_SESSION_ENCRYPTION_KEY` as a build secret, separate from the original payment key. The deployment script provisions the runtime authentication secret through stdin. Do not put secrets in Git or share them in chat. A Resend secret belongs in Supabase SMTP settings and is not needed in this build.
5. Complete the [original data/key migration and verified legacy identity mapping](independent-hosting.md#preserve-the-existing-data). The owner completed code verification on 2026-10-17 and the provider identity is now confirmed. This does not migrate data or link that identity to the original D1 account. Do not mark the migration complete yet.
6. Confirm provider email verification, both code templates and the intended test delivery, then explicitly set `AFFIMARO_DATA_MIGRATION_CONFIRMED=true` and `AFFIMARO_AUTH_CONFIGURATION_CONFIRMED=true` only when those prerequisites are complete. The current SMTP test is limited to the Resend owner's own email; customer traffic needs a verified sending domain and the live application walkthrough.

Build-time variables are separate from runtime bindings. The explicit deploy command writes the configured public runtime variables and authentication secret. Ordinary deployments preserve the original `PAYMENT_DATA_KEY_V1`; only the encrypted migration provisions that key. Keep the existing private Site and source data intact during setup.

Current status: GitHub is connected to `affimaro-com`. The owner supplied a new D1 ID after the first deployment failed. Its public selection is now in source. The owner reported saving the new authentication secret, and Supabase email confirmation was independently verified on 2026-10-17. Build token permissions, the saved secret’s deployment availability, migration, legacy identity mapping and a successful independent deployment remain pending. Neither readiness confirmation is enabled by this source change.

Primary references: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), and [account subdomain API](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/).
