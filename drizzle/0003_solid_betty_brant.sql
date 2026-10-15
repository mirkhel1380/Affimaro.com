CREATE TABLE `shopify_accounts` (
	`store_id` text PRIMARY KEY NOT NULL,
	`shop_domain` text NOT NULL,
	`shop_id` text NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_secret` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`scopes` text NOT NULL,
	`synced_through` text,
	`sync_since` text,
	`sync_until` text,
	`sync_cursor` text,
	`lease_id` text,
	`lease_until` text,
	`last_result` text,
	FOREIGN KEY (`store_id`) REFERENCES `store_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shopify_pending` (
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`reason` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `store_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopify_pending_order_unique` ON `shopify_pending` (`store_id`,`order_id`);--> statement-breakpoint
ALTER TABLE `store_connections` ADD `platform` text DEFAULT 'woocommerce' NOT NULL;