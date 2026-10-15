import {z} from 'zod';
export const STRIPE_PILOT_LIMIT=99_999_999;
export const stripeDestinationSchema=z.object({kind:z.literal('stripe'),accountId:z.string().regex(/^acct_[A-Za-z0-9]{6,80}$/),platformId:z.string().regex(/^acct_[A-Za-z0-9]{6,80}$/),recipientId:z.string().uuid(),workspaceId:z.string().uuid(),applicationId:z.string().uuid(),country:z.string().regex(/^[A-Z]{2}$/),mode:z.literal('live')}).strict();
export type StripeDestination=z.output<typeof stripeDestinationSchema>;
export type StripeTransferReceipt={method:'stripe';reference:string;paidDate:string;receiptUrl:string;amount:number;amountReversed:number;created:number};
