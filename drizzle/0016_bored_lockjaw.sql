CREATE TABLE `discovery_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`program_id` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "discovery_invite_status" CHECK("discovery_invitations"."status" IN ('pending','accepted','declined','withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `discovery_invite_inbox` ON `discovery_invitations` (`recipient_id`,`status`);--> statement-breakpoint
CREATE INDEX `discovery_invite_sender` ON `discovery_invitations` (`sender_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_invite_pending` ON `discovery_invitations` (`program_id`,`recipient_id`) WHERE "discovery_invitations"."status"='pending';--> statement-breakpoint
CREATE TABLE `discovery_listings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`listed` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "discovery_listed" CHECK("discovery_listings"."listed" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `discovery_saved` (
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_saved_pair` ON `discovery_saved` (`user_id`,`target_id`);--> statement-breakpoint
CREATE TRIGGER closed_account_session BEFORE INSERT ON auth_sessions WHEN EXISTS(SELECT 1 FROM account_closures WHERE user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
--> statement-breakpoint
CREATE TRIGGER closed_account_profile BEFORE UPDATE ON accounts WHEN EXISTS(SELECT 1 FROM account_closures WHERE user_id=NEW.id) BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
--> statement-breakpoint
CREATE TRIGGER closed_account_program BEFORE UPDATE ON programs WHEN NEW.active=1 AND EXISTS(SELECT 1 FROM workspaces w JOIN account_closures c ON c.user_id=w.owner_id WHERE w.id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
--> statement-breakpoint
CREATE TRIGGER closed_account_application BEFORE INSERT ON applications WHEN EXISTS(SELECT 1 FROM account_closures WHERE user_id=NEW.affiliate_user_id) OR EXISTS(SELECT 1 FROM programs p JOIN workspaces w ON w.id=p.workspace_id JOIN account_closures c ON c.user_id=w.owner_id WHERE p.id=NEW.program_id) BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
