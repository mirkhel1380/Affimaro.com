// Customer-facing identifiers are separate from immutable account/auth keys.
// Only source-controlled aliases are passed to accountIdSql, never request data.
export const accountIdSql=(alias='account_number')=>`('AF-' || CAST((100000 + ${alias}.number) AS TEXT))`;
export function formatAccountId(number:number){if(!Number.isSafeInteger(number)||number<1||number>Number.MAX_SAFE_INTEGER-100000)throw new Error('Invalid account number.');return 'AF-'+(100000+number);}
export async function accountIdFor(db:D1Database,userId:string){const row=await db.prepare('SELECT number FROM account_numbers WHERE user_id=?').bind(userId).first<{number:number}>();return row?formatAccountId(row.number):undefined;}
export const previewAccountId=(portal:'brand'|'affiliate'|'creator'|'agency')=>({brand:'AF-200001',affiliate:'AF-200002',creator:'AF-200003',agency:'AF-200004'})[portal];
