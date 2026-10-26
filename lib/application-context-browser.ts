import type {DeviceReport} from './application-context-catalog';
export function applicationDeviceReport():DeviceReport{
 const data:DeviceReport={};try{data.timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0,80);}catch{}try{data.language=navigator.language.slice(0,40);}catch{}
 const dimension=(value:number)=>Number.isInteger(value)&&value>0&&value<=32768?value:undefined;
 try{data.screenWidth=dimension(screen.width);data.screenHeight=dimension(screen.height);data.viewportWidth=dimension(window.innerWidth);data.viewportHeight=dimension(window.innerHeight);const ratio=window.devicePixelRatio;if(Number.isFinite(ratio)&&ratio>=.25&&ratio<=8)data.pixelRatio=Math.round(ratio*100)/100;}catch{}
 return data;
}
