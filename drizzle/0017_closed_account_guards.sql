-- A previously authenticated, in-flight request cannot start a checkout or
-- payment request after the account closure transaction has committed.
CREATE TRIGGER closed_account_checkout BEFORE INSERT ON billing_checkouts
WHEN EXISTS(SELECT 1 FROM workspaces w JOIN account_closures c ON c.user_id=w.owner_id WHERE w.id=NEW.workspace_id)
BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
--> statement-breakpoint
CREATE TRIGGER closed_account_payout BEFORE INSERT ON payout_requests
WHEN EXISTS(SELECT 1 FROM account_closures WHERE user_id=NEW.affiliate_user_id)
OR EXISTS(SELECT 1 FROM workspaces w JOIN account_closures c ON c.user_id=w.owner_id WHERE w.id=NEW.workspace_id)
BEGIN SELECT RAISE(ABORT,'Account is closed'); END;
