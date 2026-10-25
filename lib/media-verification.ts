type Verification={status:string;verified_at:string|null;archived:number};

// A code's 14-day publication window is separate from the existing 180-day
// lifetime of successfully checked ownership evidence.
export function hasCurrentMediaVerification(property:Verification,at=Date.now()){
 return !property.archived&&property.status==='verified'&&!!property.verified_at&&Date.parse(property.verified_at)>=at-180*86400000;
}
