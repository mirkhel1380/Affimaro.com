-- Deployment-only bootstrap after schema migrations. Never invoked by a request.
-- The existing owner's verified provider mapping is the sole initial admin.
INSERT INTO platform_admins (user_id,granted_at)
SELECT a.id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM accounts a JOIN auth_identities i ON i.user_id=a.id
WHERE a.id='sRqRHPT8wXYPGznd4Is1WagNk0865sViN9Ol8JZ3HBU0cBVOsDYjzR'
AND i.provider_id='0bc66b4f-f700-443b-ad8c-1967b4189c43'
ON CONFLICT(user_id) DO NOTHING;

-- Existing business/profile identifiers remain untouched. Existing non-admins
-- still need a complete application and owner review before portal access.
INSERT INTO platform_applications (user_id,portal,status,profile_json,revision,created_at,updated_at)
SELECT a.id,CASE WHEN w.id IS NOT NULL THEN 'brand' ELSE 'affiliate' END,
CASE WHEN pa.user_id IS NOT NULL THEN 'approved' ELSE 'draft' END,
CASE WHEN w.id IS NOT NULL THEN json_object('name',a.display_name,'contactName',a.display_name,'businessName',w.name,'primaryUrl',coalesce(w.website,''))
ELSE json_object('name',a.display_name,'contactName',a.display_name,'channel',p.channel,'primaryUrl',coalesce(p.website,''),'description',p.bio) END,
1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM accounts a LEFT JOIN workspaces w ON w.owner_id=a.id LEFT JOIN affiliate_profiles p ON p.user_id=a.id LEFT JOIN platform_admins pa ON pa.user_id=a.id
WHERE (w.id IS NOT NULL OR p.user_id IS NOT NULL)
AND NOT EXISTS(SELECT 1 FROM platform_applications existing WHERE existing.user_id=a.id);
