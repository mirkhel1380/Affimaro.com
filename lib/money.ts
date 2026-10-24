// Keep integer minor units exact, including large totals and six-place currencies.
export function money(value:number,currency:string,decimals:number,currencyDisplay:'symbol'|'code'='symbol'){
  if(!Number.isSafeInteger(value)||!Number.isInteger(decimals)||decimals<0||decimals>6)throw new RangeError('Use an exact monetary amount and supported precision.');
  const zero=BigInt(0),minor=BigInt(value),scale=BigInt(10)**BigInt(decimals),whole=minor/scale,remainder=minor%scale;
  const fraction=(remainder<zero?-remainder:remainder).toString().padStart(decimals,'0');
  const display=whole===zero&&minor<zero?-0:whole;
  return new Intl.NumberFormat('en-US',{style:'currency',currency,currencyDisplay,minimumFractionDigits:decimals,maximumFractionDigits:decimals}).formatToParts(display).map(part=>part.type==='fraction'?fraction:part.value).join('');
}
