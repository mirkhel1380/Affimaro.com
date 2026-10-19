import {database} from './db.js';
import {applicationProfile,seedVerifiedProperties} from './application-profiles.js';
import {service} from '../../lib/service.ts';
import {admissions} from '../../lib/admissions.ts';
import {discovery} from '../../lib/discovery.ts';
import {commerce} from '../../lib/woocommerce.ts';
export const identity=userId=>({userId,email:userId+'@example.com'});
export async function partnerFixture(t){
 const db=database(t),operator=identity('operator');await service(db,operator).saveAccount({name:'Operator'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(operator.userId,new Date().toISOString());
 async function add(role,key=role){const user=identity(key),profile=applicationProfile(role);await service(db,user).saveAccount({name:role+' member'});const api=admissions(db,user);await api.start(role);const app=await api.submit({revision:1,profile});seedVerifiedProperties(db,key,profile);await admissions(db,operator).review({userId:key,revision:app.revision,decision:'approved',note:'All evidence checked.'});await discovery(db,user).setListing({listed:true});return user;}
 const brand=await add('brand'),affiliate=await add('affiliate'),creator=await add('creator'),agency=await add('agency'),foreignBrand=await add('brand','foreign-brand'),program=(await service(db,brand).businessDashboard()).program,application=await service(db,affiliate).apply({programId:program.id});await service(db,brand).review({applicationId:application.id,status:'approved'});const pending=await service(db,creator).apply({programId:program.id});
 const connected=await commerce(db,brand).configure({action:'connect',storeUrl:'https://store.example/shop'});db.sqlite.prepare('UPDATE store_connections SET last_seen=? WHERE id=?').run(new Date().toISOString(),connected.connection.id);
 return {db,operator,brand,affiliate,creator,agency,foreignBrand,program,application,pending,connected,add};
}
