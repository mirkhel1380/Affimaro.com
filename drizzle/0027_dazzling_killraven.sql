CREATE TABLE `billing_checkout_acceptances` (
	`checkout_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`actor_id` text NOT NULL,
	`portal` text NOT NULL,
	`plan` text NOT NULL,
	`amount` integer NOT NULL,
	`email` text NOT NULL,
	`accepted_at` text NOT NULL,
	FOREIGN KEY (`checkout_id`) REFERENCES `billing_checkouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_acceptance_valid" CHECK("billing_checkout_acceptances"."portal" IN ('brand','agency') AND "billing_checkout_acceptances"."plan" IN ('starter','growth','business') AND "billing_checkout_acceptances"."amount">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_acceptance_version` ON `billing_checkout_acceptances` (`checkout_id`,`policy_version`);--> statement-breakpoint
CREATE TABLE `billing_email_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`revision` integer NOT NULL,
	`configured_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`configured_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_email_settings_valid" CHECK("billing_email_settings"."id"='resend' AND "billing_email_settings"."enabled" IN (0,1) AND "billing_email_settings"."revision">0)
);
--> statement-breakpoint
CREATE TABLE `billing_invoice_emails` (
	`sending_revision` integer,
	`invoice_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` text,
	`last_attempt_at` text,
	`lease_id` text,
	`lease_until` text,
	`provider_id` text,
	`accepted_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `billing_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "billing_invoice_email_valid" CHECK("billing_invoice_emails"."status" IN ('pending','failed','accepted','review') AND "billing_invoice_emails"."attempts">=0)
);
--> statement-breakpoint
CREATE INDEX `billing_invoice_email_user` ON `billing_invoice_emails` (`user_id`,`created_at`);
--> statement-breakpoint
INSERT INTO billing_email_settings(id,enabled,revision,configured_by,updated_at)
SELECT 'resend',1,1,s.configured_by,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM contact_email_settings s
JOIN platform_admins p ON p.user_id=s.configured_by
WHERE s.id='resend' AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=s.configured_by)
ON CONFLICT(id) DO NOTHING;
