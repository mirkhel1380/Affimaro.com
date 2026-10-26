import {z} from 'zod';
import {publicMediaUrl} from './media-catalog.ts';
import type {Portal} from './portal-policy.ts';

export const industries=[
 'Business services','Business registration & compliance','Legal & professional services','Accounting & tax services',
 'Software & technology','Software / SaaS','AI & automation','Web hosting & domains','Website & app development','SEO & digital marketing','VPN & cybersecurity','IT & cloud services',
 'Retail & ecommerce','Marketplaces','Fashion & accessories','Jewelry & watches','Beauty & wellness','Health & fitness','Healthcare & medical services','Food & groceries','Restaurants & food delivery',
 'Education','Online courses & training','Travel','Hotels & accommodation','Finance','Banking & payments','Insurance','Investing & trading','Real estate & property',
 'Home & lifestyle','Furniture & home improvement','Electronics & appliances','Telecom & internet','Automotive & transport','Sports & outdoors','Gaming & esports','Entertainment & events','Media & publishing','Subscriptions & digital products',
 'Pets & animal care','Parenting & family','Careers & recruitment','Agriculture & farming','Industrial & manufacturing','Logistics & shipping','Energy & utilities','Nonprofits & charities','Other',
] as const;
export const commissionModels=[
 'Percentage of sale','Fixed amount','CPA — cost per action','CPS — cost per sale','CPL — cost per lead','CPC — cost per click','CPI — cost per install','CPV — cost per view','CPM — per 1,000 impressions','CPE — cost per engagement',
 'Revenue share','Recurring revenue share','Hybrid — fixed amount + revenue share','Tiered commission','Performance bonus','Flat content / sponsorship fee','Product gifting / store credit','Other','To be defined',
] as const;
export const promotionMethods=['Website & SEO content','Social media','Video & livestreams','Email newsletter','Paid search','Paid social','Community','Coupons & deals','Comparison & reviews','Other'] as const;
export const audienceSizes=['Just starting','Under 1,000','1,000–9,999','10,000–49,999','50,000–249,999','250,000+'] as const;
export const experienceOptions=['New to affiliate marketing','Less than 1 year','1–3 years','More than 3 years'] as const;
export const organizationTypes=['Individual','Company','Agency'] as const;
export const teamSizes=['Just me','2–10','11–50','51–200','201+'] as const;
export const orderVolumes=['Not launched yet','Under 100','100–999','1,000–9,999','10,000+'] as const;
export const creatorPlatforms=['YouTube','Instagram','TikTok','Facebook','X / Twitter','LinkedIn','Pinterest','Twitch','Snapchat','Threads','Bluesky','Reddit','Telegram','WhatsApp','Discord','Substack','Podcast','Blog','Other'] as const;
export const contentFormats=['Videos','Articles','Social posts','Livestreams','Podcasts','Newsletters'] as const;
export const agencyServices=['Partner recruitment','Program management','Content strategy','Reporting & analysis','Website integration','Paid media'] as const;
const short=z.string().trim().min(2).max(100),optional=z.string().trim().max(300).default('');
const publicUrl=z.string().trim().max(500).refine(value=>{try{publicMediaUrl(value);return true;}catch{return false;}},'Use a public HTTPS website or profile address.');
const base=z.object({
  contactName:short,name:z.string().trim().min(2).max(60),organizationType:z.enum(organizationTypes),
  country:short,city:short,phone:z.string().trim().min(7).max(40).regex(/^[+\d ()-]+$/),
  primaryUrl:publicUrl,additionalUrls:z.array(publicUrl).max(10),industry:z.enum(industries),
  audienceCountries:z.array(short).min(1).max(10),promotionMethods:z.array(z.enum(promotionMethods)).min(1).max(10),
  monthlyAudience:z.enum(audienceSizes),experience:z.enum(experienceOptions),
  description:z.string().trim().min(60).max(2000),promotionPlan:z.string().trim().min(60).max(1500),
  referralSource:z.string().trim().max(200).default(''),authorityConfirmed:z.literal(true),dataConfirmed:z.literal(true),
});
const brand=base.extend({businessModel:z.enum(['Online store','Software / SaaS','Professional services','Digital products','Marketplace','Other']).default('Other'),commissionModel:z.enum(commissionModels).default('To be defined'),launchTiming:z.enum(['As soon as approved','Within 30 days','Within 90 days','Exploring options']).default('Exploring options'),businessName:z.string().trim().min(2).max(60),legalBusinessName:short,registrationNumber:optional,teamSize:z.enum(teamSizes),monthlyOrders:z.enum(orderVolumes),currency:z.string().trim().regex(/^[A-Z]{3}$/),partnerGoals:z.string().trim().min(30).max(1000),plan:z.enum(['starter','growth','business']).default('starter')}).strict();
const affiliate=base.extend({publisherModel:z.enum(['Editorial / content publisher','Reviews & comparisons','Coupons & deals','Cashback / loyalty','Newsletter publisher','Community publisher','Paid media','Other']).default('Editorial / content publisher'),audienceLanguages:z.array(short).min(1).max(10).default(['English']),trafficSources:z.array(z.enum(['Organic search','Social platforms','Email subscribers','Direct visitors','Paid advertising','Community referrals','Other'])).max(7).default([]),channel:z.enum(['Content creator','Newsletter','Community','Blog','Other']),previousPartnerships:z.string().trim().max(500).default('')}).strict();
const creator=affiliate.extend({collaborationTypes:z.array(z.enum(['Affiliate links','Product reviews','Sponsored content','Product gifting','UGC production','Long-term ambassador'])).max(6).default([]),primaryPlatform:z.enum(creatorPlatforms),contentFormats:z.array(z.enum(contentFormats)).min(1).max(6),publishingFrequency:z.enum(['Daily','Several times a week','Weekly','Monthly','Varies']),portfolioUrl:publicUrl}).strict();
const agency=brand.extend({organizationType:z.literal('Agency'),agencySpecialty:z.string().trim().max(500).default(''),clientAuthority:z.literal(true).optional(),agencyName:z.string().trim().min(2).max(100),agencyWebsite:publicUrl,clientCount:z.enum(['1','2–5','6–20','21+']),agencyServices:z.array(z.enum(agencyServices)).min(1).max(6)}).strict();
export type BrandApplicationProfile=z.infer<typeof brand>;
export type AffiliateApplicationProfile=z.infer<typeof affiliate>;
export type ApplicationProfile=BrandApplicationProfile|AffiliateApplicationProfile|z.infer<typeof creator>|z.infer<typeof agency>;
export function applicationProfile(portal:Portal,input:unknown){return ({brand,affiliate,creator,agency}[portal]).safeParse(input);}

export function applicationDraft(portal:Portal,input:unknown){
 const base=({brand,affiliate,creator,agency}[portal]),overrides:Record<string,z.ZodTypeAny>={authorityConfirmed:z.boolean().optional(),dataConfirmed:z.boolean().optional()};
 // Drafts can contain unfinished text. Full role validation still runs on submission.
 const limits:Record<string,number>={contactName:100,name:60,country:100,city:100,phone:40,primaryUrl:500,description:2000,promotionPlan:1500,referralSource:200,businessName:60,legalBusinessName:100,registrationNumber:300,currency:3,partnerGoals:1000,previousPartnerships:500,portfolioUrl:500,agencyName:100,agencyWebsite:500,agencySpecialty:500};
 for(const [field,limit] of Object.entries(limits))if(field in base.shape)overrides[field]=z.string().trim().max(limit).optional();
 overrides.additionalUrls=z.array(z.string().trim().max(500)).max(10).optional();overrides.audienceCountries=z.array(z.string().trim().max(100)).max(10).optional();
 if('audienceLanguages' in base.shape)overrides.audienceLanguages=z.array(z.string().trim().max(100)).max(10).optional();
 const schema=base.partial().extend(overrides);if(!input||typeof input!=='object'||Array.isArray(input))return schema.safeParse(input);
 return schema.safeParse(Object.fromEntries(Object.entries(input).filter(([,v])=>v!==''&&!(Array.isArray(v)&&v.length===0))));
}
