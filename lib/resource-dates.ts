// datetime-local fields display the member's timezone. Keep an unchanged saved
// instant intact, including seconds and milliseconds, when editing other fields.
export function resourceLocalDate(value:string|null|undefined){
 if(!value)return '';
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19);
}
export function resourceDate(value:string,original?:string|null){
 if(!value)return '';
 if(original&&value===resourceLocalDate(original))return original;
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('Choose a valid date and time.');
 return date.toISOString();
}
