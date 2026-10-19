import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {discovery} from '../../../lib/discovery';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return action(request,async(_s,body,user)=>{if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['action','data'].includes(k))||!('action' in body)||!('data' in body))throw new AppError(400,'Check the discovery request.');const api=discovery(getRawDb(),user);switch(body.action){case 'listing':return api.setListing(body.data);case 'save':return api.save(body.data);case 'invite':return api.invite(body.data);case 'respond':return api.respond(body.data);default:throw new AppError(400,'Unknown discovery action.');}});}
