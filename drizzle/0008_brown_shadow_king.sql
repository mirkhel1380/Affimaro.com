PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_payout_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`application_id` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`currency` text NOT NULL,
	`decimals` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`method` text DEFAULT 'bank' NOT NULL,
	`reversed_amount` integer DEFAULT 0 NOT NULL,
	`stripe_transfer_id` text,
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
	CONSTRAINT "payout_status_valid" CHECK("__new_payout_requests"."status" IN ('requested','approved','processing','paid','transferred','rejected','cancelled')),
	CONSTRAINT "payout_method_valid" CHECK("__new_payout_requests"."method" IN ('bank','stripe')),
	CONSTRAINT "payout_reversal_valid" CHECK("__new_payout_requests"."reversed_amount" BETWEEN 0 AND "__new_payout_requests"."amount" AND ("__new_payout_requests"."method"='stripe' OR "__new_payout_requests"."reversed_amount"=0)),
	CONSTRAINT "payout_stripe_currency" CHECK("__new_payout_requests"."method"<>'stripe' OR ("__new_payout_requests"."currency"='USD' AND "__new_payout_requests"."decimals"=2)),
	CONSTRAINT "payout_processing_method" CHECK("__new_payout_requests"."status"<>'processing' OR "__new_payout_requests"."method"='stripe'),
	CONSTRAINT "payout_transferred_fields" CHECK("__new_payout_requests"."status"<>'transferred' OR ("__new_payout_requests"."method"='stripe' AND "__new_payout_requests"."stripe_transfer_id" IS NOT NULL AND "__new_payout_requests"."encrypted_receipt" IS NOT NULL AND "__new_payout_requests"."paid_date" IS NOT NULL)),
	CONSTRAINT "payout_amount_valid" CHECK("__new_payout_requests"."amount" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "payout_decimals_valid" CHECK("__new_payout_requests"."decimals" BETWEEN 0 AND 6),
	CONSTRAINT "payout_paid_fields" CHECK("__new_payout_requests"."status" <> 'paid' OR ("__new_payout_requests"."encrypted_receipt" IS NOT NULL AND "__new_payout_requests"."reference_hash" IS NOT NULL AND "__new_payout_requests"."paid_date" IS NOT NULL AND "__new_payout_requests"."paid_by" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_payout_requests`("id", "workspace_id", "application_id", "affiliate_user_id", "currency", "decimals", "amount", "status", "method", "reversed_amount", "stripe_transfer_id", "encrypted_destination", "account_hint", "reason", "encrypted_receipt", "reference_hash", "paid_date", "paid_by", "created_at", "updated_at") SELECT "id", "workspace_id", "application_id", "affiliate_user_id", "currency", "decimals", "amount", "status", 'bank', 0, NULL, "encrypted_destination", "account_hint", "reason", "encrypted_receipt", "reference_hash", "paid_date", "paid_by", "created_at", "updated_at" FROM `payout_requests`;--> statement-breakpoint
DROP TABLE `payout_requests`;--> statement-breakpoint
ALTER TABLE `__new_payout_requests` RENAME TO `payout_requests`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `payout_user_index` ON `payout_requests` (`affiliate_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payout_workspace_index` ON `payout_requests` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payout_reference_unique` ON `payout_requests` (`workspace_id`,`reference_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `payout_active_unique` ON `payout_requests` (`application_id`,`currency`,`decimals`) WHERE "payout_requests"."status" IN ('requested','approved','processing');--> statement-breakpoint
CREATE UNIQUE INDEX `payout_stripe_transfer_unique` ON `payout_requests` (`workspace_id`,`stripe_transfer_id`);
--> statement-breakpoint
CREATE TABLE `stripe_transfer_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`state` text NOT NULL,
	`stripe_transfer_id` text,
	`first_submitted_at` text NOT NULL,
	`last_checked_at` text,
	`last_error` text,
	`lease_id` text,
	`lease_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `payout_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `stripe_recipients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stripe_attempt_state" CHECK("stripe_transfer_attempts"."state" IN ('processing','review','failed','succeeded')),
	CONSTRAINT "stripe_attempt_amount" CHECK("stripe_transfer_attempts"."amount" BETWEEN 1 AND 99999999)
);
--> statement-breakpoint
CREATE INDEX `stripe_attempt_request_index` ON `stripe_transfer_attempts` (`request_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_attempt_active_unique` ON `stripe_transfer_attempts` (`request_id`) WHERE "stripe_transfer_attempts"."state" IN ('processing','review');--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_attempt_remote_unique` ON `stripe_transfer_attempts` (`platform_id`,`stripe_transfer_id`);--> statement-breakpoint
