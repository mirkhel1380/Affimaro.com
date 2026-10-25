export function countScale(values){
 const max=Math.max(0,...values.filter(value=>Number.isFinite(value)&&value>=0));
 if(max<=4)return {ceiling:4,ticks:[0,1,2,3,4]};
 const rough=max/4,power=10**Math.floor(Math.log10(rough)),step=([1,2,5,10].find(value=>value*power>=rough)||10)*power,ceiling=Math.ceil(max/step)*step;
 return {ceiling,ticks:Array.from({length:Math.round(ceiling/step)+1},(_,index)=>index*step)};
}
export function dayTickIndexes(length,width){if(length<1)return [];const count=Math.min(length,width<520?3:5);if(count===1)return [0];return [...new Set(Array.from({length:count},(_,i)=>Math.round(i*(length-1)/(count-1))))];}
