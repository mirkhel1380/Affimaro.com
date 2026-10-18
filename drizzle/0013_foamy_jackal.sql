CREATE TABLE `billing_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`lease_id` text NOT NULL,
	`lease_until` text NOT NULL,
	`created_at` text NOT NULL,
	`processed_at` text,
	CONSTRAINT "billing_webhook_status" CHECK("billing_webhook_events"."status" IN ('processing','processed'))
);
--> statement-breakpoint
CREATE TABLE `platform_billing_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`setup_id` text NOT NULL,
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`origin` text NOT NULL,
	`encrypted_credential` text NOT NULL,
	`webhook_payload` text NOT NULL,
	`portal_payload` text NOT NULL,
	`portal_configuration_id` text,
	`encrypted_webhook_secret` text,
	`webhook_id` text,
	`status` text NOT NULL,
	`configured_by` text NOT NULL,
	`lease_id` text,
	`lease_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`configured_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "platform_billing_singleton" CHECK("platform_billing_settings"."id"='stripe'),
	CONSTRAINT "platform_billing_mode" CHECK("platform_billing_settings"."mode" IN ('test','live')),
	CONSTRAINT "platform_billing_status" CHECK("platform_billing_settings"."status" IN ('pending','ready'))
);
--> statement-breakpoint
ALTER TABLE `billing_checkouts` ADD `payload_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_checkouts` ADD `integration_suffix` text;