import {AppError} from './service.ts';
import {identityMaxImageBytes} from './identity-catalog.ts';
// JPEG only. Strip optional application/comment metadata, validate frame bounds,
// and retain encoded scan data. Files are private and never served as HTML.
export function identityJpeg(input:Uint8Array){
 const bad=()=>new AppError(400,'Upload a readable JPG photo through the identity form.'),limit=input.length;
 if(limit<20||limit>identityMaxImageBytes||input[0]!==255||input[1]!==216||input[limit-2]!==255||input[limit-1]!==217)throw bad();
 const parts=[input.subarray(0,2)];let pos=2,width=0,height=0,components=0,scan=false,segments=0;
 while(pos<limit){if(++segments>2048)throw bad();const start=pos;if(input[pos++]!==255)throw bad();while(input[pos]===255)pos++;const marker=input[pos++];
  if(marker===217){if(pos!==limit)throw bad();parts.push(input.subarray(start,pos));break;}
  if(marker===0||marker===216||marker>=208&&marker<=215||pos+2>limit)throw bad();const size=(input[pos]<<8)|input[pos+1],end=pos+size;if(size<2||end>limit-2)throw bad();
  if([192,193,194].includes(marker)){if(width||size<8||input[pos+2]!==8)throw bad();height=(input[pos+3]<<8)|input[pos+4];width=(input[pos+5]<<8)|input[pos+6];components=input[pos+7];if(![1,3].includes(components)||size!==8+components*3||Math.min(width,height)<200||Math.max(width,height)>2400)throw bad();}
  if(marker===218){const count=input[pos+2];if(!width||count<1||count>components||size!==6+2*count)throw bad();scan=true;pos=end;
   // Find the next segment after entropy data; stuffed FF and restart markers
   // remain in the scan. Continue parsing progressive scans and strip metadata
   // even if it occurs between scans or just before the end marker.
   while(pos<limit){if(input[pos]!==255){pos++;continue;}const boundary=pos;while(input[pos]===255)pos++;const next=input[pos];if(next===0||next>=208&&next<=215){pos++;continue;}pos=boundary;break;}
   if(pos>=limit)throw bad();parts.push(input.subarray(start,pos));continue;
  }
  if(!(marker>=224&&marker<=239||marker===254))parts.push(input.subarray(start,end));pos=end;
 }
 if(!scan||!width||!height)throw bad();const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
