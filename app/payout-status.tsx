import type {Payout} from '../lib/payments';
import {payoutStatus} from '../lib/payment-status';
import {Badge} from './portal-elements';
export function PayoutStatus({request,sample=false}:{request:Pick<Payout,'status'|'method'|'amount'|'reversed_amount'>;sample?:boolean}){
 const state=payoutStatus(request);
 return <div className="a-payout-state"><Badge status={state.label}/><p className="a-fine-print">{sample?'Sample status · ':''}{state.description}</p></div>;
}
