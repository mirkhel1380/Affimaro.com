import {effectiveCommission} from './commission-query.ts';
// These SQL aliases are fixed source constants, never caller-provided values.
export const netDisbursed=(alias:string)=>`CASE WHEN ${alias}.status='transferred' THEN ${alias}.amount-${alias}.reversed_amount ELSE ${alias}.amount END`;
export const approvedFor=(application:string,cur:string,precision:string)=>`(SELECT COALESCE(SUM(MIN(${effectiveCommission()},ca.amount)),0) FROM orders o JOIN commission_approvals ca ON ca.order_id=o.id WHERE o.application_id=${application} AND o.currency=${cur} AND o.decimals=${precision})`;
export const committedFor=(application:string,cur:string,precision:string)=>`(SELECT COALESCE(SUM(${netDisbursed('booked')}),0) FROM payout_requests booked WHERE booked.application_id=${application} AND booked.currency=${cur} AND booked.decimals=${precision} AND booked.status IN ('requested','approved','processing','paid','transferred'))`;
export const coverageFor=(alias='payout_requests')=>`${approvedFor(`${alias}.application_id`,`${alias}.currency`,`${alias}.decimals`)} >= ${committedFor(`${alias}.application_id`,`${alias}.currency`,`${alias}.decimals`)}`;
