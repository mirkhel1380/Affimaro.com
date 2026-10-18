CREATE TABLE `account_portals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`portal` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_portal_type" CHECK("account_portals"."portal" IN ('brand','affiliate','creator','agency'))
);
--> statement-breakpoint
CREATE TABLE `agency_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`website` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agency_client_status" CHECK("agency_clients"."status" IN ('prospect','active','on_hold','archived'))
);
--> statement-breakpoint
CREATE INDEX `agency_clients_owner` ON `agency_clients` (`user_id`);--> statement-breakpoint
CREATE TABLE `creator_content` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text,
	`title` text NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "creator_content_status" CHECK("creator_content"."status" IN ('idea','draft','published','archived'))
);
--> statement-breakpoint
CREATE INDEX `creator_content_owner` ON `creator_content` (`user_id`);--> statement-breakpoint
CREATE TABLE `plan_requests` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_plan` text NOT NULL,
	`active_plan` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "requested_plan_type" CHECK("plan_requests"."requested_plan" IN ('starter','growth','business')),
	CONSTRAINT "active_plan_type" CHECK("plan_requests"."active_plan" IS NULL OR "plan_requests"."active_plan" IN ('starter','growth','business')),
	CONSTRAINT "plan_request_status" CHECK("plan_requests"."status" IN ('pending','approved','rejected')),
	CONSTRAINT "plan_request_revision" CHECK("plan_requests"."revision">0)
);

--> statement-breakpoint
INSERT INTO account_portals (user_id,portal,created_at) SELECT user_id,portal,created_at FROM platform_applications WHERE 1 ON CONFLICT(user_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO plan_requests (user_id,requested_plan,active_plan,status,revision,updated_at) SELECT user_id,'starter','starter','approved',1,updated_at FROM platform_applications WHERE portal='brand' AND status='approved' ON CONFLICT(user_id) DO NOTHING;
