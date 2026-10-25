CREATE TABLE `identity_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`slot` text NOT NULL,
	`encrypted_content` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_document_valid" CHECK("identity_documents"."slot" IN ('front','back','selfie') AND "identity_documents"."bytes" BETWEEN 1 AND 512000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_document_slot` ON `identity_documents` (`user_id`,`submission_id`,`slot`);--> statement-breakpoint
CREATE INDEX `identity_document_expiry` ON `identity_documents` (`expires_at`);--> statement-breakpoint
CREATE TABLE `identity_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`document_slot` text,
	`revision` integer NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_event_valid" CHECK("identity_review_events"."action" IN ('submitted','document_viewed','approved','changes_requested','rejected','revoked') AND "identity_review_events"."revision">0 AND ("identity_review_events"."document_slot" IS NULL OR "identity_review_events"."document_slot" IN ('front','back','selfie')))
);
--> statement-breakpoint
CREATE INDEX `identity_review_history` ON `identity_review_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `identity_verifications` (
	`user_id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`required_documents` integer NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`encrypted_profile` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	`reviewer_id` text,
	`review_token` text,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "identity_status_valid" CHECK("identity_verifications"."status" IN ('pending','approved','changes_requested','rejected','revoked') AND "identity_verifications"."revision">0 AND "identity_verifications"."required_documents" IN (2,3))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_submission_unique` ON `identity_verifications` (`submission_id`);--> statement-breakpoint
CREATE INDEX `identity_review_queue` ON `identity_verifications` (`status`,`updated_at`);