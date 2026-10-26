export const securityPhoneFormatError='Enter a mobile number with its country code, such as +1 202 555 0123.';
export function normalizeSecurityPhone(input:unknown):string|null{
 if(typeof input!=='string'||input.length>40)return null;
 let value=input.trim().replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit>='۰'?0x6f0:0x660))).replace(/[\s().-]/g,'');
 if(value.startsWith('00'))value='+'+value.slice(2);
 return /^\+[1-9][0-9]{7,14}$/.test(value)?value:null;
}
