import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceDate,resourceLocalDate} from '../lib/resource-dates.ts';
test('coupon editing preserves unchanged UTC instants and milliseconds across member timezones',()=>{
 const original=process.env.TZ,saved='2026-10-24T08:15:20.123Z';
 try{for(const [zone,local] of [['UTC','2026-10-24T08:15:20'],['Asia/Kabul','2026-10-24T12:45:20'],['America/New_York','2026-10-24T04:15:20']]){process.env.TZ=zone;assert.equal(resourceLocalDate(saved),local);assert.equal(resourceDate(local,saved),saved);assert.equal(resourceDate(local),'2026-10-24T08:15:20.000Z');}}
 finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
test('coupon date edits support clearing and changed local dates and reject invalid values before submission',()=>{
 const original=process.env.TZ;try{process.env.TZ='Asia/Kabul';assert.equal(resourceDate('2026-10-24T13:30:00','2026-10-24T08:15:20.123Z'),'2026-10-24T09:00:00.000Z');assert.equal(resourceDate('', '2026-10-24T08:15:20.123Z'),'');assert.equal(resourceLocalDate(null),'');assert.equal(resourceLocalDate('invalid'),'');assert.throws(()=>resourceDate('invalid'),/valid date/);}finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
