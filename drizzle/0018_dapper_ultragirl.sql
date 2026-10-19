CREATE TABLE `link_clicks` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`source` text NOT NULL,
	`medium` text NOT NULL,
	`referrer_host` text NOT NULL,
	`device` text NOT NULL,
	`country` text NOT NULL,
	`clicked_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `link_click_application_time` ON `link_clicks` (`application_id`,`clicked_at`);--> statement-breakpoint
CREATE INDEX `link_click_retention` ON `link_clicks` (`clicked_at`);--> statement-breakpoint
CREATE TABLE `program_coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`application_id` text,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`terms` text NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "program_coupon_status" CHECK("program_coupons"."status" IN ('active','archived') AND "program_coupons"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `program_coupon_scope` ON `program_coupons` (`program_id`,`status`,`application_id`);--> statement-breakpoint
CREATE TABLE `program_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`application_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "program_resource_kind" CHECK("program_resources"."kind" IN ('banner','image','text','document')),
	CONSTRAINT "program_resource_status" CHECK("program_resources"."status" IN ('active','archived') AND "program_resources"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `program_resource_scope` ON `program_resources` (`program_id`,`status`,`application_id`);