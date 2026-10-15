CREATE TABLE `auth_identities` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identity_user_unique` ON `auth_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "auth_rate_count" CHECK("auth_rate_limits"."count">0)
);
--> statement-breakpoint
CREATE INDEX `auth_rate_expiry` ON `auth_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`encrypted_tokens` text NOT NULL,
	`recovery_only` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`lease_id` text,
	`lease_until` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `auth_identities`(`provider_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "auth_recovery_flag" CHECK("auth_sessions"."recovery_only" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_session_user` ON `auth_sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `billing_checkouts` ADD `return_origin` text DEFAULT 'https://affimaro-preview.kindsky66.chatgpt.site' NOT NULL;