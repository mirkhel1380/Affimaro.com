CREATE TABLE `account_numbers` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_number_valid" CHECK("account_numbers"."number">0 AND "account_numbers"."number"<=9007199254640991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_number_user_unique` ON `account_numbers` (`user_id`);
--> statement-breakpoint
-- Allocate stable numbers for existing accounts without rewriting their keys.
INSERT INTO account_numbers(user_id,created_at)
SELECT id,created_at FROM accounts ORDER BY created_at,id;
--> statement-breakpoint
-- Allocation is part of the same transaction as each new account insert.
CREATE TRIGGER assign_account_number AFTER INSERT ON accounts
BEGIN
 INSERT INTO account_numbers(user_id,created_at) VALUES (NEW.id,NEW.created_at);
END;
