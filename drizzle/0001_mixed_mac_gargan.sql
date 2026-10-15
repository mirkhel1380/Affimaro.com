CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`referral_id` text NOT NULL,
	`application_id` text NOT NULL,
	`external_id` text NOT NULL,
	`revision` integer NOT NULL,
	`currency` text NOT NULL,
	`decimals` integer NOT NULL,
	`basis` integer NOT NULL,
	`refunded_basis` integer NOT NULL,
	`rate_bps` integer NOT NULL,
	`commission` integer NOT NULL,
	`status` text NOT NULL,
	`commission_state` text NOT NULL,
	`needs_review` integer NOT NULL,
	`created_at` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `store_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`referral_id`) REFERENCES `referrals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_amounts_valid" CHECK("orders"."basis" >= 0 AND "orders"."refunded_basis" >= 0 AND "orders"."refunded_basis" <= "orders"."basis" AND "orders"."commission" >= 0),
	CONSTRAINT "orders_precision_valid" CHECK("orders"."decimals" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_external_unique` ON `orders` (`store_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `orders_application_index` ON `orders` (`application_id`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`application_id` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `store_connections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `referrals_application_index` ON `referrals` (`application_id`);--> statement-breakpoint
CREATE INDEX `referrals_store_index` ON `referrals` (`store_id`);--> statement-breakpoint
CREATE TABLE `store_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`store_url` text NOT NULL,
	`signing_key` text NOT NULL,
	`active` integer NOT NULL,
	`last_seen` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "store_active_boolean" CHECK("store_connections"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_workspace_unique` ON `store_connections` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `store_events` (
	`store_id` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `store_connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_event_unique` ON `store_events` (`store_id`,`event_id`);