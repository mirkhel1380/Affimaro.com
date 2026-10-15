CREATE TABLE `stripe_connect_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stripe_setup_enabled_boolean" CHECK("stripe_connect_settings"."enabled" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `stripe_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`application_id` text NOT NULL,
	`affiliate_user_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`mode` text NOT NULL,
	`country` text NOT NULL,
	`account_id` text,
	`state` text NOT NULL,
	`details_submitted` integer DEFAULT 0 NOT NULL,
	`payouts_enabled` integer DEFAULT 0 NOT NULL,
	`transfers_active` integer DEFAULT 0 NOT NULL,
	`requirements_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_checked_at` text,
	`create_started_at` text,
	`lease_id` text,
	`lease_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliate_user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stripe_recipient_mode" CHECK("stripe_recipients"."mode" IN ('test','live')),
	CONSTRAINT "stripe_recipient_state" CHECK("stripe_recipients"."state" IN ('creating','needs_information','pending','ready','attention'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_recipient_application_platform_mode` ON `stripe_recipients` (`application_id`,`platform_id`,`mode`);--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_recipient_external_unique` ON `stripe_recipients` (`platform_id`,`mode`,`account_id`);