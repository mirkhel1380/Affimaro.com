CREATE TABLE `program_rule_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`window_days` integer NOT NULL,
	`active` integer NOT NULL,
	`effective_at` text NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rule_rate_valid" CHECK("program_rule_revisions"."rate_bps" BETWEEN 100 AND 5000),
	CONSTRAINT "rule_window_valid" CHECK("program_rule_revisions"."window_days" BETWEEN 1 AND 90)
);
--> statement-breakpoint
CREATE INDEX `program_rule_time_index` ON `program_rule_revisions` (`program_id`,`effective_at`);