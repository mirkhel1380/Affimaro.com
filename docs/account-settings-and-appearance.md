# Customer account settings

Each primary customer role has a private settings path: `/workspace/settings`, `/partner/settings`, `/creator/settings`, `/agency/settings`. `/settings` resolves the signed-in customer. The existing separate owner settings remain under the owner host. Preview settings use `/preview/{role}/settings` and save fictional preferences only in that browser; no customer API is called in preview mode.

Settings cover display name; light/dark/device appearance; density and reduced motion; click-report timestamps, page size and campaign defaults; real pending partnership reminders in the portal; opt-in discovery privacy; existing verified password recovery; active Affimaro sessions; role-appropriate tools, billing/earnings; a scoped account JSON export; and the existing separately confirmed closure flow.

`account_preferences` stores a strict JSON preference schema, an increasing revision and updated time. All reads and writes derive identity from the authenticated request. The write endpoint applies the existing same-origin and approved-account checks, rejects unknown fields, and uses compare-and-swap revisions. Owner, closed and unapproved accounts cannot use customer settings. Preferences never grant roles or change financial state.

The appearance bootstrap stores only theme, density and reduced-motion choices in a device-local key. A signed-in portal loads the account's saved preference, allowing it to follow the user across devices. It also follows OS theme changes and changes from another tab. Account data and session credentials are never stored by this appearance mechanism. Browser-blocked storage falls back to usable defaults.

Click-report activity timestamps and page size use the saved preferences. Graph/day aggregation continues to use UTC calendar days. New partner campaign links prefill the saved source and medium. Existing signed store destinations and accounting rules are retained.

Signing out other devices removes only the caller's other application session rows. The current cookie hash must match the authenticated account's active non-recovery session before any deletion. The current session and every foreign account remain intact. App-local revocation does not call Supabase global sign-out or revoke external provider tokens. The existing bridge checks the local session row on each new request. Password changes continue through the existing verified-code flow.

Account exports contain the caller's display profile, preferences, submitted application and public channel evidence projection. They exclude session tokens, encryption material, payment credentials and owner review notes. Financial exports remain in the existing role-scoped reports. No real account, session, email, payment or closure is changed during automated tests.
