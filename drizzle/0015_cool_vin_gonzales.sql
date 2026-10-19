CREATE TABLE `account_closures` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`closed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media_properties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`relationship` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`audience` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`challenge` text NOT NULL,
	`challenge_expires_at` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`proof_url` text DEFAULT '' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`verified_at` text,
	`last_checked_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_property_status" CHECK("media_properties"."status" IN ('unverified','review_pending','verified','changes_requested','revoked')),
	CONSTRAINT "media_property_method" CHECK("media_properties"."method" IN ('dns_txt','public_challenge')),
	CONSTRAINT "media_property_archived" CHECK("media_properties"."archived" IN (0,1) AND "media_properties"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `media_property_user` ON `media_properties` (`user_id`,`archived`);--> statement-breakpoint
CREATE INDEX `media_property_queue` ON `media_properties` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `media_property_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `media_properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_review_property` ON `media_property_reviews` (`property_id`,`created_at`);