// Keep decisions and invitations ordered, including consecutive actions within
// one millisecond or small differences between request clocks.
export function timeAfter(...timestamps:(string|null|undefined)[]){
 const previous=timestamps.map(value=>value?Date.parse(value)+1:NaN).filter(Number.isFinite);
 return new Date(Math.max(Date.now(),...previous)).toISOString();
}
