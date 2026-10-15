CREATE TABLE `bank_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_details` text NOT NULL,
	`account_hint` text NOT NULL,
	`currency` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commission_approvals` (
	`order_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`revision` integer NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approval_amount_valid" CHECK("commission_approvals"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`application_id` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`currency` text NOT NULL,
	`decimals` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`encrypted_destination` text NOT NULL,
	`account_hint` text NOT NULL,
	`reason` text,
	`encrypted_receipt` text,
	`reference_hash` text,
	`paid_date` text,
	`paid_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliate_user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_status_valid" CHECK("payout_requests"."status" IN ('requested','approved','paid','rejected','cancelled')),
	CONSTRAINT "payout_amount_valid" CHECK("payout_requests"."amount" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "payout_decimals_valid" CHECK("payout_requests"."decimals" BETWEEN 0 AND 6),
	CONSTRAINT "payout_paid_fields" CHECK("payout_requests"."status" <> 'paid' OR ("payout_requests"."encrypted_receipt" IS NOT NULL AND "payout_requests"."reference_hash" IS NOT NULL AND "payout_requests"."paid_date" IS NOT NULL AND "payout_requests"."paid_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `payout_user_index` ON `payout_requests` (`affiliate_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payout_workspace_index` ON `payout_requests` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payout_reference_unique` ON `payout_requests` (`workspace_id`,`reference_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `payout_active_unique` ON `payout_requests` (`application_id`,`currency`,`decimals`) WHERE "payout_requests"."status" IN ('requested','approved');