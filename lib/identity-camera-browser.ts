import {identityMaxImageBytes} from './identity-catalog.ts';
export const stopIdentityCamera=(stream:MediaStream|null)=>stream?.getTracks().forEach(track=>track.stop());
export async function openIdentityCamera(facing:'user'|'environment',selfie:boolean,signal:AbortSignal){
 if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Open this HTTPS page in a browser with camera support. You can sign in on your phone.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:selfie?640:1600,max:selfie?960:1920},height:{ideal:selfie?480:1200,max:selfie?720:1440},frameRate:{ideal:12,max:15}}});
 if(signal.aborted){stopIdentityCamera(stream);throw new DOMException('Camera cancelled.','AbortError');}return stream;
}
export async function photographIdentity(video:HTMLVideoElement){
 if(video.readyState<2||Math.min(video.videoWidth,video.videoHeight)<200)throw new Error('Wait for a clear live camera image before taking the photo.');
 const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);const context=canvas.getContext('2d');if(!context)throw new Error('This browser could not prepare the photo.');context.drawImage(video,0,0,canvas.width,canvas.height);
 for(const quality of [.86,.72,.58,.44]){const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=identityMaxImageBytes)return blob;}throw new Error('The photo is too large. Move to even lighting and try again.');
}
export function identityRecorderMime(){if(typeof MediaRecorder==='undefined')throw new Error('Live selfie recording is unavailable in this browser. Open this page on a supported phone or browser.');const mime=['video/webm;codecs=vp8','video/webm','video/mp4;codecs=avc1.42E01E','video/mp4'].find(value=>MediaRecorder.isTypeSupported(value));if(!mime)throw new Error('This browser cannot record a supported selfie clip. Try a current Chrome or Safari browser.');return mime;}
export function recordIdentitySelfie(stream:MediaStream,signal:AbortSignal,progress:(seconds:number)=>void):Promise<Blob>{
 return new Promise((resolve,reject)=>{let recorder:MediaRecorder;try{recorder=new MediaRecorder(stream,{mimeType:identityRecorderMime(),videoBitsPerSecond:240000});}catch(error){reject(error);return;}
  const chunks:Blob[]=[];let size=0,error:Error|null=null,settled=false;const start=Date.now(),tracks=stream.getVideoTracks(),mime=recorder.mimeType.split(';')[0],cancel=()=>{error=new Error('Selfie recording was cancelled. Please record a complete clip.');if(recorder.state!=='inactive')recorder.stop();else finish();};
  const interval=setInterval(()=>progress(Math.min(7,Math.floor((Date.now()-start)/1000))),200),timeout=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},7000);
  function finish(){if(settled)return;settled=true;clearInterval(interval);clearTimeout(timeout);signal.removeEventListener('abort',cancel);for(const track of tracks)track.removeEventListener('ended',cancel);const blob=new Blob(chunks,{type:mime});if(error)reject(error);else if(Date.now()-start<6500||blob.size<1000||blob.size>identityMaxImageBytes)reject(new Error('The selfie clip was incomplete or too large. Record it again.'));else resolve(blob);}
  recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>identityMaxImageBytes){error=new Error('The selfie clip is too large. Try another camera or browser.');if(recorder.state!=='inactive')recorder.stop();}}};recorder.onerror=()=>{error=new Error('The camera could not complete your selfie clip.');if(recorder.state!=='inactive')recorder.stop();else finish();};recorder.onstop=finish;
  signal.addEventListener('abort',cancel,{once:true});for(const track of tracks)track.addEventListener('ended',cancel,{once:true});if(signal.aborted){cancel();return;}try{recorder.start(250);progress(0);}catch(error){clearInterval(interval);clearTimeout(timeout);signal.removeEventListener('abort',cancel);for(const track of tracks)track.removeEventListener('ended',cancel);reject(error);}
 });
}
