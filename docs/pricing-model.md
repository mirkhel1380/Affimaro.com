# Brand and agency launch pricing

Reviewed on 2026-10-23. Affimaro's current paid scope is one connected website, one program and one account owner for either a brand or an agency. Agency client-directory records are private contacts and notes; they are not connected client stores or delegated access to other brands.

## Decision

Retain the existing monthly USD rates: Starter $19, Growth $49 and Business $99. Both roles buy the same program capacity. Agency accounts additionally have the existing directory limits of 5, 25 or 100 records. The public pricing page now has separate **Brand plans** and **Agency plans** views with the relevant features, signup and sign-in continuation for each role. The agency marketing page links to its own pricing view. Affiliate and creator accounts remain free.

This release does not create or alter Stripe prices, migrate subscriptions, change provider keys or callbacks, or increase any existing customer's bill. Billing screens show client-directory allowances only to agency accounts.

## Current market context

- Awin explicitly describes Access, Accelerate and Advanced as suitable for both advertisers and digital agencies acting for them. Its separate agency page invites agencies to discuss their needs; it does not publish a universal agency surcharge. Sources: https://www.awin.com/gb/pricing/advertisers and https://www.awin.com/gb/pricing/agencies . The US advertiser page lists Access at $49/month plus a 3.5% tracking fee, Accelerate from $99/month plus 2.5%, and Advanced on custom pricing: https://www.awin.com/us/pricing/advertisers . Regional prices and terms are not interchangeable.
- impact.com's agency offering includes multiple client programs, consolidated reporting, role-based access and commercial terms that depend on the agency's client volume and program scale: https://impact.com/solutions/agencies/ . Those capabilities and commercial arrangements do not match Affimaro's current one-program agency account.
- Tapfiliate's public pricing page presents product tiers; it does not establish a separate universal agency price: https://tapfiliate.com/pricing/ .

A separate multi-program agency price can be considered when that capability is actually supported and its limits, permissions and billing are implemented. Do not advertise directory contacts as independently connected or managed programs.
