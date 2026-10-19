CREATE TABLE `account_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_preferences_valid" CHECK(json_valid("account_preferences"."preferences_json") AND "account_preferences"."revision">0)
);
