CREATE TABLE `contact_email_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_credential` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`configured_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`configured_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_email_singleton" CHECK("contact_email_settings"."id"='resend' AND "contact_email_settings"."enabled" IN (0,1) AND "contact_email_settings"."revision">0)
);
--> statement-breakpoint
CREATE TABLE `contact_receipts` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` text,
	`last_attempt_at` text,
	`lease_id` text,
	`lease_until` text,
	`provider_id` text,
	`accepted_at` text,
	FOREIGN KEY (`message_id`) REFERENCES `contact_messages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_receipt_state" CHECK("contact_receipts"."status" IN ('pending','failed','accepted','review') AND "contact_receipts"."number">0 AND "contact_receipts"."number"<90000000 AND "contact_receipts"."attempts">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_receipt_message` ON `contact_receipts` (`message_id`);