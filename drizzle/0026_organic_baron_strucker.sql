CREATE TABLE `application_submission_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_revision` integer NOT NULL,
	`transition_id` text NOT NULL,
	`context_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "application_context_valid" CHECK("application_submission_contexts"."application_revision">0 AND json_valid("application_submission_contexts"."context_json") AND length("application_submission_contexts"."context_json")<=5000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_context_transition` ON `application_submission_contexts` (`transition_id`);--> statement-breakpoint
CREATE INDEX `application_context_user_time` ON `application_submission_contexts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `application_context_expiry` ON `application_submission_contexts` (`expires_at`);