# Account security and sign-in providers

The independent Cloudflare host uses Supabase Auth only for verified identity. D1 remains the application database. No database migration, owner-grant change, payment-key change or provider credential is included in this release.

## Enforcement

- Four customer portals and the separate owner host check the current provider user and stored UUID mapping before forwarding identity to the application. Provider metadata never grants a role or owner access.
- Accounts with a verified TOTP or phone factor must have a provider-authenticated `aal2` access token. Pending MFA sessions cannot read protected pages or APIs, enroll a replacement factor, remove methods or revoke sessions. Their only security operations are challenging and verifying an already verified factor.
- Authenticator and phone enrollment stays inactive until code confirmation. A pending enrollment cannot bypass an existing verified factor. The app stores encrypted provider tokens, never an authenticator setup secret.
- Security changes need a sign-in within five minutes when no factor is enrolled, or a recent MFA proof when one is enrolled. Adding/removing factors and session revocation use a compare-and-lease update on the existing D1 session row. Concurrent revocation cannot recreate that row.
- Session cookies are opaque, Secure, HttpOnly, SameSite=Lax and host-only. New encrypted sessions bind to the configured origin. Legacy sessions without the optional origin field remain compatible. Owner sessions expire after twelve hours; recovery sessions remain ten minutes. Email password recovery never removes MFA.
- Six-digit verification attempts and other security operations have independent subject/IP limits. Social entry uses IP-only limits until a subject is known, so unrelated visitors do not share one global email bucket.
- Normal response, redirect and error paths receive frame, MIME, HSTS, referrer, permissions and opener headers. Auth HTML retains its strict self-only scripts and form policy. Embedded billing integrations retain their necessary script/frame behavior.

## Supported sign-in and application flow

Google, Apple and SAML SSO use a server-held S256 PKCE verifier in an encrypted, host-bound, fifteen-minute flow cookie. A callback nonce can only be consumed once. Provider URLs are constructed from the fixed Supabase project; SSO URLs are accepted only from that project's fixed SSO API and are not fetched by Affimaro. Social form submission renders a self-hosted continuation page with a trusted provider link, preserving `form-action 'self'`.

The selected portal, package and safe return destination remain bound to the flow. A first social sign-in completes the appropriate basic role profile, then follows the existing full application and manual review workflow. Registration creates no subscription charge. Affiliates and creators remain free. Existing identities are never linked to a legacy owner account by matching an email address alone.

## Owner configuration

Use Supabase Authentication → Sign In / Providers for project `bhxzkrypfxdheyjtxwqp`:

1. Google: configure a web OAuth client and secret.
2. Apple: configure a Services ID, team/signing details and signing secret; rotate the provider secret when needed.
3. SAML SSO: configure the organization's identity provider on a supported plan.
4. Enable TOTP enrollment/verification; configure phone MFA and an SMS provider separately from primary phone sign-in.
5. Preserve verified email sign-in. Enable leaked-password protection where the plan supports it. The read-only advisor still reported this setting disabled on 2026-10-25; this release cannot change Auth service configuration.

Register this callback with Google and Apple:

`https://bhxzkrypfxdheyjtxwqp.supabase.co/auth/v1/callback`

Allow these exact Affimaro return URLs in Supabase URL configuration:

```text
https://affimaro.com/auth/brand/callback
https://affimaro.com/auth/affiliate/callback
https://affimaro.com/auth/creator/callback
https://affimaro.com/auth/agency/callback
https://affimaro.com/auth/callback
https://admin.affimaro.com/auth/owner/callback
```

Provider availability is read from the configured project's public settings. Unconfigured providers are visibly disabled while email remains usable. A provider-settings outage does not stop the email form rendering. Primary phone sign-in availability is not presented as proof that SMS MFA has been configured. Email verification and email password recovery are shown as email protection, not falsely presented as a second MFA factor.

The private owner page `/owner/security` has setup readiness and exact callbacks. Security tabs in all four customer settings pages support authenticator/phone methods and own-session management. Preview settings remain sample-only and send no verification messages.

## Contact confirmation emails

The existing durable outbox and short numeric reference are preserved. The owner must enter a Resend **Sending access** key for the verified `affimaro.com` domain at `/owner/contact#receipt-email` and enable confirmation emails. New submissions then use that setting; an older message needs its own **Send confirmation email** action. Saving settings sends no email. Provider acceptance does not prove inbox delivery.

No available connector can obtain the sending key or change Supabase provider credentials automatically. Do not send these secrets through chat. There were no production email, SMS, OAuth login, MFA enrollment or payment mutations during release validation.

## Dependency updates

Security fixes pin Next 16.4.3, React/React DOM/RSC 19.2.9, Vite 8.3.5, Zod 4.6.7 and patched transitive packages in the committed lockfile. Zod record/literal declarations use the compatible current API; financial behavior and Drizzle schema are unchanged. Full dependency audit returned zero known findings during validation. This is a point-in-time dependency check, not a guarantee against all attacks.

## References

- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/guides/auth/auth-mfa/phone
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-apple
- https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml
- https://supabase.com/docs/guides/auth/server-side/pkce-flow
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
