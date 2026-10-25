CREATE TABLE `__new_contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`topic` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`email_hash` text NOT NULL,
	`network_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "contact_message_status" CHECK("__new_contact_messages"."status" IN ('new','in_progress','closed') AND "__new_contact_messages"."revision">0),
	CONSTRAINT "contact_message_topic" CHECK("__new_contact_messages"."topic" IN ('general','account','integration','billing','partnership','other'))
);
--> statement-breakpoint
INSERT INTO `__new_contact_messages`("id", "name", "email", "topic", "message", "status", "revision", "email_hash", "network_hash", "payload_hash", "created_at", "updated_at") SELECT "id", "name", "email", "topic", "message", "status", "revision", "email_hash", "network_hash", "payload_hash", "created_at", "updated_at" FROM `contact_messages`;--> statement-breakpoint
DROP TABLE `contact_messages`;--> statement-breakpoint
ALTER TABLE `__new_contact_messages` RENAME TO `contact_messages`;--> statement-breakpoint
CREATE INDEX `contact_message_queue` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_message_email_window` ON `contact_messages` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_message_network_window` ON `contact_messages` (`network_hash`,`created_at`);