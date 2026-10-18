CREATE TABLE `platform_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`granted_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_applications` (
	`user_id` text PRIMARY KEY NOT NULL,
	`portal` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`profile_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`submitted_at` text,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_note` text DEFAULT '' NOT NULL,
	`transition_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "platform_application_portal" CHECK("platform_applications"."portal" IN ('brand','affiliate')),
	CONSTRAINT "platform_application_status" CHECK("platform_applications"."status" IN ('draft','pending','changes_requested','approved','rejected')),
	CONSTRAINT "platform_application_revision" CHECK("platform_applications"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `platform_application_queue` ON `platform_applications` (`status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `platform_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`applicant_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`revision` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`applicant_id`) REFERENCES `platform_applications`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_review_history` ON `platform_review_events` (`applicant_id`,`created_at`);