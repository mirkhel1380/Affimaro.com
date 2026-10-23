import type {ApplicationProfile} from './application-profile.ts';

// A program application shares relevant promotional information with that
// program's owner, even when the applicant has not opted into discovery.
// Contact, legal, payment and internal review fields are never projected.
const sharedFields=['name','organizationType','country','industry','channel','description','monthlyAudience','audienceCountries','audienceLanguages','promotionMethods','trafficSources','experience','promotionPlan','previousPartnerships','publisherModel','primaryPlatform','contentFormats','publishingFrequency','collaborationTypes'] as const;
export function partnershipProfile(profile:Record<string,unknown>):Partial<ApplicationProfile>{
 const shared:Record<string,string|string[]>={};
 for(const key of sharedFields){
  const value=profile[key];
  if(typeof value==='string'||Array.isArray(value)&&value.every(v=>typeof v==='string'))shared[key]=value;
 }
 return shared as Partial<ApplicationProfile>;
}
