CREATE TABLE `payment_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`external_id` text NOT NULL,
	`label` text NOT NULL,
	`country` text,
	`currency` text,
	`payouts_enabled` integer,
	`status` text NOT NULL,
	`last_error` text,
	`encrypted_credential` text NOT NULL,
	`last_verified_at` text NOT NULL,
	`last_checked_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payment_connection_provider" CHECK("payment_connections"."provider" IN ('stripe','wise')),
	CONSTRAINT "payment_connection_mode" CHECK("payment_connections"."mode" IN ('test','live')),
	CONSTRAINT "payment_connection_status" CHECK("payment_connections"."status" IN ('verified','attention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_connection_workspace_provider` ON `payment_connections` (`workspace_id`,`provider`);