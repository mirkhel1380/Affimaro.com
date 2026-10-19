# Affimaro domain cutover

The owner purchased `affimaro.com` from Namecheap and requested a separate owner portal at `admin.affimaro.com` on 2026-10-19. Public DNS currently delegates to `dns1.registrar-servers.com` and `dns2.registrar-servers.com`. The apex has no A record and `admin.affimaro.com` has no record. The current application is still `https://affimaro-com.m-mirkhel20.workers.dev`.

No authenticated Cloudflare CLI session or Cloudflare/Namecheap connector was available during preparation. No DNS, nameserver, certificate, application-origin or Stripe provider change has been made. The optional owner-host feature is implemented and tested, but is not enabled until the cutover below can complete.

## Domain and email DNS

1. Add `affimaro.com` as a zone in the existing Cloudflare account `72d03e04f40638313952d19c5739c34d`. Use the existing account and Worker; do not create a new website, owner, database or payment account.
2. Review the imported DNS before changing nameservers. Preserve the existing Resend DKIM TXT record at `resend._domainkey`, the DNS-only `send` CNAME to `send.forge.rmta.net`, the `_dmarc` TXT record, and every other current mail/verification record. Copy the exact current values from Namecheap or the mail provider. Do not substitute older Amazon SES records or orange-cloud an email record.
3. Copy the two nameservers assigned by this exact Cloudflare zone. In Namecheap, open **Domain List → affimaro.com → Manage → Nameservers → Custom DNS**, enter those two values and save. Do not guess nameservers or use an example pair.
4. Wait for Cloudflare to confirm an active zone. Recheck authoritative NS and email records before connecting web traffic. Cloudflare Workers Custom Domains need an active zone in the account. Let the Worker binding create the web DNS and certificate; do not point the apex to an invented IP or add an unrelated CNAME at `admin`.

## Application and owner portal

The custom-domain build settings are:

| Setting | Value |
| --- | --- |
| `APP_ORIGIN` | `https://affimaro.com` |
| `OWNER_ORIGIN` | `https://admin.affimaro.com` |
| Existing Worker | `affimaro-com` |
| Existing D1 | `9b4539f6-dd2a-4ce7-85c5-4733f799ed11` |

Do not set these build variables yet if subscription-origin reconciliation is incomplete. With both variables set, the independent build generates exactly two Custom Domain bindings, disables `workers.dev` and rejects all other hosts. The deployed config must match both origins. The build API token needs the required zone/custom-domain permissions in addition to the existing Worker/D1 permissions.

The owner hostname uses only `/auth/owner/*`, `/owner/*`, the existing owner administration endpoints and required static assets. It does not serve customer marketing, signup, subscription checkout, store events or customer portals. Owner mutations sent to the public hostname are rejected. Read-only owner bookmarks redirect to the owner hostname. Anonymous owner requests open owner sign-in; non-owner accounts are denied even if they have an approved application.

## Preserve subscriptions before changing the application origin

The saved live Stripe setup is bound to the existing Workers origin. `platform_billing_settings.origin`, its saved webhook payload and its saved portal payload intentionally prevent silently reusing a different origin. Merely changing `APP_ORIGIN` would disable new billing and webhook verification. Existing Checkout attempts also retain their original return origin and idempotency payload.

An authenticated operator must first inspect the saved setup and Stripe endpoint, then complete a tested origin-reconciliation or explicitly supported legacy-origin transition. Preserve the existing setup ID, account, price IDs, endpoint identity/signing secret, encrypted credential and original payment key. Do not delete the billing row, rerun initial setup, register duplicate webhooks, change frozen Checkout attempts, rotate keys or repeat the original data migration to bypass this check.

Keep the working application available until that transition is ready. Update Supabase Site URL and required redirect allowlist entries for the new public and owner addresses while retaining email confirmation. Rebuild and publish the exact configuration after provider settings are ready.

## Verify before announcing the new addresses

Check DNS and TLS for both hosts; public home, free affiliate/creator entry and paid brand/agency entry; the absence of owner/admin links from the public footer, direct owner login/recovery and real manual review; cross-role and cross-host denial; and signed Stripe updates and original Checkout returns. Verify actual checkout navigation without creating a real charge. Keep the owner-private source Site and its paused source database intact.

Primary references: [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [add a Cloudflare zone](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/), and [Namecheap nameserver changes](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/).


The custom-domain deployment keeps `LEGACY_ORIGIN` at the existing workers.dev address and enables workers.dev alongside the exact public and owner custom domains. Billing configuration and signed webhook delivery continue to use that saved origin; credentials, provider endpoints, frozen checkout payloads, encryption keys and financial rows are not replaced. Legacy browser GET/HEAD pages redirect to the canonical host (owner pages to the owner host); legacy browser writes and API reads fail without forwarding credentials. Only the exact signed subscription and store-event POST endpoints are accepted on the old host, with original bytes intact.

Before any migrations, secrets or Worker upload, deployment checks every production custom-domain binding. It refuses other Workers’ hostnames or removal of an extra production hostname. Missing bindings can be attached only to the exact active zone in this account, using the existing deployment token. Both hostnames must then pass HTTPS checks. Missing permissions or DNS/TLS readiness stops the deployment while the old Worker remains available. Add the two Custom Domains in Cloudflare manually if the build token cannot see the zone, then retry. Existing email DNS records are untouched by this process.
