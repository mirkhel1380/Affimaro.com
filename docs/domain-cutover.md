# Affimaro domain cutover

The purchased domain is delegated from Namecheap to `jill.ns.cloudflare.com` and `nero.ns.cloudflare.com`. Public DNS checks confirmed the existing five forwarding MX records, apex SPF, DMARC, Resend DKIM and DNS-only `send` CNAME to `send.forge.rmta.net`. Domain binding does not replace these email records.

| Purpose | Origin |
| --- | --- |
| Customer website and portals | `https://affimaro.com` |
| Private owner portal | `https://admin.affimaro.com` |
| Legacy callbacks and browser redirects | `https://affimaro-com.m-mirkhel20.workers.dev` |

`self-hosted/cloudflare-project.json` selects the existing Cloudflare account, Worker and D1 database together with these three public identifiers. A build setting containing this exact selected project's former workers.dev `APP_ORIGIN` is promoted to the new canonical origin; an explicitly different deployment account/origin continues to require complete overrides. Credentials and original encryption keys have no defaults and are never rotated by cutover.

## Keep signed payments and store delivery working

The existing encrypted billing setup, registered Stripe webhook, portal configuration and their saved origin remain unchanged. `billingOrigin()` uses `LEGACY_ORIGIN`, while new customer-facing links and browser sessions use `APP_ORIGIN`. No billing row, price ID, provider endpoint, signing secret, frozen Checkout payload, financial record or identity mapping is replaced. The original data migration must not be repeated.

The legacy host stays enabled alongside the two exact Custom Domain bindings. Browser GET/HEAD pages redirect to the canonical public host; owner bookmarks redirect to the owner host. Legacy browser writes and API reads fail without forwarding credentials. Only exact POST subscription and store-event endpoints are accepted there, and they retain their original request bytes and signature verification. Older Checkout and portal returns safely redirect back to the new customer host. New hosts require their own sign-in; old-host credentials are not copied across domains.

## Verify domains before replacing the Worker

`prepareCustomDomains` runs before any migrations, secrets or Worker upload. It checks all production bindings and refuses to overwrite another Worker's hostname or remove an extra existing production hostname. Missing bindings can be attached only to the exact active zone in the selected account, using the existing deployment token. The two hosts must then pass HTTPS probes before the new canonical-origin Worker is uploaded.

If the token cannot read the zone, add both hostnames in **Workers & Pages → affimaro-com → Settings → Domains & Routes → Custom Domain**, then retry the build. If DNS/TLS is still preparing, retry after it becomes active. These failures leave the currently deployed Worker available. Do not announce either new address as live based on a source/configuration change alone.

## Owner and customer host separation

The owner hostname serves only owner authentication, owner pages, protected administration endpoints and required assets. It does not serve customer marketing, signup, subscription checkout, store events or customer portals. Public-host owner mutations fail; owner page bookmarks redirect. Owner sessions use the separate host, verified identity mapping and stored administrator grant. Public footers contain no owner sign-in entry.

## Verify after publication

Check DNS/TLS, public home and pricing, free creator/affiliate signup, paid brand/agency continuation, direct owner sign-in, absent public owner links, cross-role/cross-host denial, legacy browser redirects, rejected legacy browser writes and signed callback delivery. Checkout tests use fixtures and do not create a real charge. Supabase authentication remains verified-email OTP; configure Site URL/allowlist consistently for any future link-based email flows. The owner-private native source Site and its paused database remain intact.

Primary references: [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Workers domain API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/), and [Namecheap nameserver changes](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/).
