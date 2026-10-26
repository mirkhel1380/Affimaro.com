CREATE TABLE `member_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`job_title` text DEFAULT '' NOT NULL,
	`work_phone` text DEFAULT '' NOT NULL,
	`mobile_phone` text DEFAULT '' NOT NULL,
	`avatar_jpeg` text,
	`revision` integer NOT NULL,
	`transition_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_profile_valid" CHECK("member_profiles"."revision">0 AND ("member_profiles"."avatar_jpeg" IS NULL OR length("member_profiles"."avatar_jpeg")<=60000))
);
