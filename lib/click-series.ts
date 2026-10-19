export type ClickDay={date:string;clicks:number};
export function clickPeriod(days:7|30|90,now=new Date()){
 const end=now.toISOString(),start=new Date(end.slice(0,10)+'T00:00:00.000Z');start.setUTCDate(start.getUTCDate()-days+1);
 return {start:start.toISOString(),end};
}
export function completeClickDays(rows:ClickDay[],days:7|30|90,now=new Date()):ClickDay[]{
 const start=new Date(clickPeriod(days,now).start),counts=new Map(rows.map(row=>[row.date,row.clicks]));
 return Array.from({length:days},(_,index)=>{const at=new Date(start);at.setUTCDate(at.getUTCDate()+index);const date=at.toISOString().slice(0,10);return {date,clicks:counts.get(date)||0};});
}
