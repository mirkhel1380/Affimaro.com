CREATE TABLE `billing_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`mode` text NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`price_id` text,
	`amount` integer,
	`status` text DEFAULT 'none' NOT NULL,
	`invoice_paid` integer DEFAULT 0 NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`cancel_at_period_end` integer DEFAULT 0 NOT NULL,
	`last_verified_at` text,
	`last_error` text,
	`lease_id` text,
	`lease_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_account_mode" CHECK("billing_accounts"."mode" IN ('test','live')),
	CONSTRAINT "billing_status" CHECK("billing_accounts"."status" IN ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
	CONSTRAINT "billing_flags" CHECK("billing_accounts"."invoice_paid" IN (0,1) AND "billing_accounts"."cancel_at_period_end" IN (0,1)),
	CONSTRAINT "billing_amount" CHECK("billing_accounts"."amount" IS NULL OR "billing_accounts"."amount" BETWEEN 1 AND 99999999)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_workspace_platform_mode` ON `billing_accounts` (`workspace_id`,`platform_id`,`mode`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_remote_subscription` ON `billing_accounts` (`platform_id`,`mode`,`subscription_id`);--> statement-breakpoint
CREATE TABLE `billing_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`price_id` text NOT NULL,
	`amount` integer NOT NULL,
	`customer_snapshot` text,
	`state` text NOT NULL,
	`session_id` text,
	`encrypted_url` text,
	`expires_at` integer,
	`first_submitted_at` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_checkout_state" CHECK("billing_checkouts"."state" IN ('creating','open','review','expired','completed')),
	CONSTRAINT "billing_checkout_amount" CHECK("billing_checkouts"."amount" BETWEEN 1 AND 99999999)
);
--> statement-breakpoint
CREATE INDEX `billing_checkout_workspace` ON `billing_checkouts` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_active` ON `billing_checkouts` (`account_id`) WHERE "billing_checkouts"."state" IN ('creating','open','review');--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_session` ON `billing_checkouts` (`session_id`);