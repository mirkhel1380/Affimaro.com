import {z} from 'zod';
import type {Portal} from './portal-policy.ts';

export const industries=['Business services','Software & technology','Retail & ecommerce','Fashion & accessories','Beauty & wellness','Education','Travel','Finance','Home & lifestyle','Other'] as const;
export const promotionMethods=['Website & SEO content','Social media','Video & livestreams','Email newsletter','Paid search','Paid social','Community','Coupons & deals','Comparison & reviews','Other'] as const;
export const audienceSizes=['Just starting','Under 1,000','1,000–9,999','10,000–49,999','50,000–249,999','250,000+'] as const;
export const experienceOptions=['New to affiliate marketing','Less than 1 year','1–3 years','More than 3 years'] as const;
export const organizationTypes=['Individual','Company','Agency'] as const;
export const teamSizes=['Just me','2–10','11–50','51–200','201+'] as const;
export const orderVolumes=['Not launched yet','Under 100','100–999','1,000–9,999','10,000+'] as const;
export const creatorPlatforms=['YouTube','Instagram','TikTok','Facebook','LinkedIn','Podcast','Blog','Other'] as const;
export const contentFormats=['Videos','Articles','Social posts','Livestreams','Podcasts','Newsletters'] as const;
export const agencyServices=['Partner recruitment','Program management','Content strategy','Reporting & analysis','Website integration','Paid media'] as const;
const short=z.string().trim().min(2).max(100),optional=z.string().trim().max(300).default('');
const publicUrl=z.string().trim().url().max(500).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')&&!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname);}catch{return false;}},'Use a public HTTPS website or social-profile URL.');
const base=z.object({
  contactName:short,name:z.string().trim().min(2).max(60),organizationType:z.enum(organizationTypes),
  country:short,city:short,phone:z.string().trim().min(7).max(40).regex(/^[+\d ()-]+$/),
  primaryUrl:publicUrl,additionalUrls:z.array(publicUrl).max(5),industry:z.enum(industries),
  audienceCountries:z.array(short).min(1).max(10),promotionMethods:z.array(z.enum(promotionMethods)).min(1).max(10),
  monthlyAudience:z.enum(audienceSizes),experience:z.enum(experienceOptions),
  description:z.string().trim().min(60).max(2000),promotionPlan:z.string().trim().min(60).max(1500),
  referralSource:z.string().trim().max(200).default(''),authorityConfirmed:z.literal(true),dataConfirmed:z.literal(true),
});
const brand=base.extend({businessName:z.string().trim().min(2).max(60),legalBusinessName:short,registrationNumber:optional,teamSize:z.enum(teamSizes),monthlyOrders:z.enum(orderVolumes),currency:z.string().trim().regex(/^[A-Z]{3}$/),partnerGoals:z.string().trim().min(30).max(1000),plan:z.enum(['starter','growth','business']).default('starter')}).strict();
const affiliate=base.extend({channel:z.enum(['Content creator','Newsletter','Community','Blog','Other']),previousPartnerships:z.string().trim().max(500).default('')}).strict();
const creator=affiliate.extend({primaryPlatform:z.enum(creatorPlatforms),contentFormats:z.array(z.enum(contentFormats)).min(1).max(6),publishingFrequency:z.enum(['Daily','Several times a week','Weekly','Monthly','Varies']),portfolioUrl:publicUrl}).strict();
const agency=brand.extend({organizationType:z.literal('Agency'),agencyName:z.string().trim().min(2).max(100),agencyWebsite:publicUrl,clientCount:z.enum(['1','2–5','6–20','21+']),agencyServices:z.array(z.enum(agencyServices)).min(1).max(6)}).strict();
export type BrandApplicationProfile=z.infer<typeof brand>;
export type AffiliateApplicationProfile=z.infer<typeof affiliate>;
export type ApplicationProfile=BrandApplicationProfile|AffiliateApplicationProfile|z.infer<typeof creator>|z.infer<typeof agency>;
export function applicationProfile(portal:Portal,input:unknown){return ({brand,affiliate,creator,agency}[portal]).safeParse(input);}
