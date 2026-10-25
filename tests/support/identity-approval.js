// Explicit approved identity state for pre-existing finance fixtures only.
// Production code never grants this state automatically.
export function seedApprovedIdentity(db,userId,portal='affiliate'){
 const at=new Date().toISOString();db.sqlite.prepare('INSERT INTO account_portals(user_id,portal,created_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING').run(userId,portal,at);
 db.sqlite.prepare("INSERT INTO platform_applications(user_id,portal,status,profile_json,created_at,updated_at) VALUES (?,'affiliate','approved','{}',?,?) ON CONFLICT(user_id) DO NOTHING").run(userId,at,at);
 db.sqlite.prepare("INSERT INTO identity_verifications(user_id,submission_id,required_documents,status,revision,encrypted_profile,submitted_at,reviewed_at,created_at,updated_at) VALUES (?,?,2,'approved',2,'TEST_ONLY_ENCRYPTED_PROFILE',?,?,?,?) ON CONFLICT(user_id) DO NOTHING").run(userId,crypto.randomUUID(),at,at,at,at);
}
