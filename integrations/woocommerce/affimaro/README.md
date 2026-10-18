# Affimaro for WooCommerce 0.3.1 — pilot

Upload `affimaro-woocommerce.zip` in WordPress → Plugins → Add New → Upload, then activate it with WooCommerce enabled. Requires HTTPS, WordPress 6.5+, 64-bit PHP 7.4+ and WooCommerce with Action Scheduler. Classic and block checkout use their respective hooks; order access uses WooCommerce CRUD for HPOS.

1. In Affimaro → Business workspace → Store, enter the exact WooCommerce home URL (including a subdirectory when applicable).
2. Copy the connection ID and one-time signing key. Store the key securely: it cannot be retrieved later. Rotating it invalidates the old key and requires updating WordPress.
3. Copy **Affimaro URL** from the Store page. In WordPress → WooCommerce → Affimaro, paste that address, connection ID and key. The plugin starts with no default host so it cannot send a new connection to an old preview. Save, then Test connection.
4. In an approved partner’s portal, copy their store referral URL. A referral cookie is set only after the visitor allows tracking. Your consent manager can override `affimaro_tracking_allowed`; returning false also prevents checkout attribution.
5. In a staging store, test classic and block checkout, pending-to-paid transitions, a line-item partial refund, a full refund and a refund deletion. Check WooCommerce → Status → Scheduled Actions (`affimaro` group) for delivery jobs. Use Retry an attributed order after repairing a failed connection.

## Independent Affimaro installations

Use the Affimaro URL displayed in your signed-in workspace. The independent installation accepts store events using the per-store connection ID and HMAC signing key. It does not require a ChatGPT Sites service token. A successful connection test verifies signed delivery; test a staging referral, order and refund before live traffic.

## Optional: owner-private ChatGPT Sites access

Only a private ChatGPT-hosted installation has an additional dispatch gate before HMAC signature validation. A signing key alone does **not** grant that private service access or invite affiliates.

For a private ChatGPT-hosted installation only, supported Sites service access must also be configured server-side in `wp-config.php` or an equivalent protected host configuration. The required constant names are `AFFIMARO_SITES_SERVICE_TOKEN` and `AFFIMARO_SITES_SERVICE_ORIGIN` (the exact HTTPS Affimaro origin). Obtain/configure this through the supported Sites connection workflow. No service credential is supplied in this package. Never put one in a URL, browser JavaScript, public download, support message, source repository or scheduled-action arguments. The plugin refuses to forward it if the configured origin changes, and never follows redirects.

Do not change the Site audience simply to bypass this gate. An intended public launch needs an explicit access decision. The per-store HMAC and workspace authorization remain required even if the Site is public later.

## Attribution and accounting

- Last accepted referral wins. Referred visits count accepted referral registrations, not unique people. No fingerprint, IP address or customer contact information is collected by this integration.
- The rate and attribution expiry are locked when the server accepts the referral. Program changes apply to new referrals. Orders created within that window can qualify if the partner/program is still active when the first order is received. Retries and later refunds retain the original attribution/rate; key rotation does not invalidate recorded referrals.
- Net merchandise after discounts forms the basis. Shipping, taxes and fees are excluded. Integer minor units and the store’s decimal precision are sent with each order; currencies are never added together.
- Processing/completed orders accrue estimated commission; pending/on-hold orders wait. Cancelled/failed/refunded orders accrue zero. Line-item refunds reduce the net basis. An unallocated partial refund puts commission at zero in `review` until the WooCommerce refund allocation is corrected and retried. In Affimaro → Payments, the business can approve commission, review affiliate bank-payment requests and record completed bank transfers. Refunds after recorded payment carry an adjustment into future commission; Affimaro does not debit or send bank funds.
- Every order has an immutable store/order ID, referral, creation timestamp and currency. Monotonic revisions prevent delayed older deliveries from overwriting a newer snapshot. Signed events expire after five minutes; replayed event IDs cannot change payloads. Server batches atomically commit event receipts and accounting changes.
- Standard WooCommerce statuses and the store-wide currency precision are supported. Map custom statuses before use; multi-currency plugins with a different per-order precision need an adapter. No old orders without captured referral metadata are backfilled. Deletions through the WooCommerce refund UI trigger a sync; refund deletion through an external API needs a manual order retry in this pilot.
- WP-Cron / Action Scheduler must run. Eight delayed retries follow a failed first attempt. The store’s last delivery status and a manual order retry are available in settings. A successful connection test is not proof that scheduled jobs are running.

## Verification limits

The backend protocol, migrations, isolation, deduplication, accounting and refund paths are exercised with an isolated database. Executable adapter checks run on PHP 7.4 and 8.3 using the official WordPress PHP-WASM runtime, with stubbed WordPress/WooCommerce boundaries. A full WooCommerce installation, real payment checkout, authenticated browser journey and store-host cron execution have not been verified. Test this pilot in staging before live traffic.
