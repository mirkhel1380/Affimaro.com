# Brand and agency launch pricing

Reviewed on 2026-10-23. Affimaro's current paid scope is one connected website, one program and one account owner for either a brand or an agency. Agency client-directory records are private contacts and notes; they are not connected client stores or delegated access to other brands.

## Decision

The owner selected different monthly USD rates for new brand and agency purchases:

| Package | Brand | Agency |
| --- | ---: | ---: |
| Starter | $19 | $39 |
| Growth | $49 | $79 |
| Business | $99 | $149 |

Agency directory limits remain 5, 25 or 100 records. Each account still has one program, one website and one owner. Separate pricing does not imply extra connected client stores. Affiliate and creator accounts remain free.

The shared catalog supplies public pricing, signup, application forms, billing selectors and previews. The server selects a schedule from the account's durable role. New agency prices resolve by exact Stripe lookup keys and must match the approved amount, USD monthly licensed billing, mode and agency/plan metadata. Missing or ambiguous entries keep new payment unavailable, without falling back to a brand price.

Existing paid subscriptions and unresolved saved checkouts retain their original verified price, payload, callback and idempotency key. Legacy agency prices can be used only for an existing subscription or its unresolved saved checkout, never a later new purchase. No existing subscription is migrated or repriced.

The three separate agency products and monthly prices were created and verified in the existing live Highlink LLC account on 2026-10-23 after renewed Stripe authorization. Their exact identifiers are recorded in `agency-price-catalog.json`. Fresh provider lookups returned exactly one active USD monthly price for each agency catalog key, and the production price resolver accepted all three live responses. The original three brand price and product records were unchanged. The deployed application resolves the agency keys automatically; no runtime key, webhook, callback or existing subscription was replaced.

Catalog verification does not exercise a real customer payment or independently verify the saved runtime key. Owner Launch readiness can check all six current prices using that runtime connection.

## Current market context

- Awin explicitly describes Access, Accelerate and Advanced as suitable for both advertisers and digital agencies acting for them. Its separate agency page invites agencies to discuss their needs; it does not publish a universal agency surcharge. Sources: https://www.awin.com/gb/pricing/advertisers and https://www.awin.com/gb/pricing/agencies . The US advertiser page lists Access at $49/month plus a 3.5% tracking fee, Accelerate from $99/month plus 2.5%, and Advanced on custom pricing: https://www.awin.com/us/pricing/advertisers . Regional prices and terms are not interchangeable.
- impact.com's agency offering includes multiple client programs, consolidated reporting, role-based access and commercial terms that depend on the agency's client volume and program scale: https://impact.com/solutions/agencies/ . Those capabilities and commercial arrangements do not match Affimaro's current one-program agency account.
- Tapfiliate's public pricing page presents product tiers; it does not establish a separate universal agency price: https://tapfiliate.com/pricing/ .

The owner chose a separate agency schedule. Multi-program agency access would require its own implemented limits, permissions and billing. Do not advertise directory contacts as independently connected or managed programs.
