import {service} from '../../lib/service.ts';
import {commerce} from '../../lib/woocommerce.ts';
export function seedOrder(f,application=f.application,store=f.connected.connection,change={}){
 const row={id:crypto.randomUUID(),external:'1234',currency:'USD',decimals:2,basis:10000,refunded:0,commission:1000,state:'accrued',status:'completed',created:'2026-10-24T10:00:00.000Z',received:'2026-10-24T11:00:00.000Z',...change},referral=crypto.randomUUID();
 f.db.sqlite.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,1000,?,?)').run(referral,store.id,application.id,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z');
 f.db.sqlite.prepare('INSERT INTO orders (id,store_id,referral_id,application_id,external_id,revision,currency,decimals,basis,refunded_basis,rate_bps,commission,status,commission_state,needs_review,created_at,received_at) VALUES (?,?,?,?,?,1,?,?,?,?,1000,?,?,?,?,?,?)').run(row.id,store.id,referral,application.id,row.external,row.currency,row.decimals,row.basis,row.refunded,row.commission,row.status,row.state,row.state==='review'?1:0,row.created,row.received);return row;
}
export async function agencyPair(f){const program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:application.id,status:'approved'});const store=(await commerce(f.db,f.agency).configure({action:'connect',platform:'custom',storeUrl:'https://agency.example'})).connection;return {application,store};}

