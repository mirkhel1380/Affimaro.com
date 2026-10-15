# Cloudflare hosting from GitHub

Connect the existing private repository `mirkhel1380/Affimaro.com` through **Connect GitHub** in Cloudflare Workers & Pages. Grant the Cloudflare GitHub App access to this repository. Keep the repository private.

## Build configuration

| Cloudflare field | Value |
| --- | --- |
| Worker/project name | `affimaro` |
| Production branch | `main` |
| Root directory | Repository root (`/`) |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:self-hosted -- --deploy` |
| Preview command, if shown | `npm run deploy:self-hosted -- --dry-run` |
| Node version | `24` (set build variable `NODE_VERSION` if needed) |

The build runs the automated checks, TypeScript and isolated independent build. The deploy command checks the selected provider policy, actual Cloudflare account subdomain, exact built configuration and both readiness confirmations before changing resources. Disable non-production branch builds for now. A preview dry run does not publish a preview URL.

The ordinary `npm run build` and `dist/server/wrangler.json` belong to the owner-private native Site. The independent package is `dist-self-hosted/server/wrangler.json`; its entry strips spoofed native identity headers and requires the independent verified session. Use the commands above rather than an automatically inferred framework deployment.

## Account identified during owner setup

The owner supplied the account URL and screenshot on 2026-10-15:

| Public setting | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | `72d03e04f40638313952d19c5739c34d` |
| Workers account subdomain | `m-mirkhel20.workers.dev` |
| Intended `APP_ORIGIN`, if the Worker is named `affimaro` | `https://affimaro.m-mirkhel20.workers.dev` |

The intended origin is a configuration value, not a claim that a Worker or live deployment already exists. Preflight must verify it against the connected account before deployment. When replacing it with an owned custom domain, update the origin and Supabase Site URL, rebuild, and deploy the matching package.

## Required before the first deployment

1. Create the independent D1 database and obtain `CLOUDFLARE_D1_DATABASE_ID`; do not substitute the native Site database.
2. Configure a scoped build API token with **Workers Scripts: Edit** and **D1: Edit** for the intended account. The Workers Scripts permission also permits the subdomain ownership check. Add route/domain permissions only when attaching a custom domain. Cloudflare's default build token does not document D1 edit permission, so verify its permissions rather than assuming migrations will work.
3. Add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` and `APP_ORIGIN` as build settings. The selected Supabase public settings already come from source; overrides must be a complete URL/key pair.
4. Add a new random 32-byte hex `AUTH_SESSION_ENCRYPTION_KEY` as a build secret, separate from the original payment key. The deployment script provisions the runtime authentication secret through stdin. Do not put secrets in Git or share them in chat. A Resend secret belongs in Supabase SMTP settings and is not needed in this build.
5. Complete the [original data/key migration and verified legacy identity mapping](independent-hosting.md#preserve-the-existing-data). The owner has only received a recovery code so far; the test Auth identity remains unverified. Do not mark the migration complete yet.
6. Confirm provider email verification, both code templates and the intended test delivery, then explicitly set `AFFIMARO_DATA_MIGRATION_CONFIRMED=true` and `AFFIMARO_AUTH_CONFIGURATION_CONFIRMED=true` only when those prerequisites are complete. The current SMTP test is limited to the Resend owner's own email; customer traffic needs a verified sending domain and the live application walkthrough.

Build-time variables are separate from runtime bindings. The explicit deploy command writes the configured public runtime variables and authentication secret. Ordinary deployments preserve the original `PAYMENT_DATA_KEY_V1`; only the encrypted migration provisions that key. Keep the existing private Site and source data intact during setup.

Current status: no Cloudflare Worker, D1 database, API token, independent deployment or migration has been created by this setup change. The user is still connecting their GitHub account through Cloudflare.

Primary references: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), and [account subdomain API](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/).
