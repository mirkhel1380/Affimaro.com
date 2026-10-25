import test from 'node:test';
import assert from 'node:assert/strict';
import {openIdentityCamera,stopIdentityCamera,photographIdentity,identityRecorderMime,recordIdentitySelfie} from '../lib/identity-camera-browser.ts';
import {syntheticSelfieVideo} from './support/identity-photos.js';
function property(t,key,value){const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});}
function track(){const value=new EventTarget();value.stopped=0;value.stop=()=>value.stopped++;return value;}
test('camera access is requested with no audio, supported bounds and the requested front/back preference',async t=>{
 const video=track(),stream={getTracks:()=>[video]},calls=[];property(t,'isSecureContext',true);property(t,'navigator',{mediaDevices:{getUserMedia:async value=>{calls.push(value);return stream;}}});const result=await openIdentityCamera('environment',false,new AbortController().signal);assert.equal(result,stream);assert.equal(calls[0].audio,false);assert.equal(calls[0].video.facingMode.ideal,'environment');assert.equal(calls[0].video.width.ideal,1600);stopIdentityCamera(result);assert.equal(video.stopped,1);
});
test('a camera grant arriving after cancellation immediately stops its tracks',async t=>{
 const video=track(),stream={getTracks:()=>[video]};let grant;property(t,'isSecureContext',true);property(t,'navigator',{mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})}});const control=new AbortController(),opened=openIdentityCamera('user',true,control.signal);control.abort();grant(stream);await assert.rejects(opened,e=>e.name==='AbortError');assert.equal(video.stopped,1);
});
test('document capture requires live video readiness, downsizes and bounds JPEG output',async t=>{
 const draws=[],qualities=[],canvas={width:0,height:0,getContext(){return {drawImage(...args){draws.push(args);}};},toBlob(fn,mime,quality){qualities.push(quality);assert.equal(mime,'image/jpeg');fn(new Blob([new Uint8Array(quality>.8?512001:1200)],{type:mime}));}};property(t,'document',{createElement(name){assert.equal(name,'canvas');return canvas;}});await assert.rejects(photographIdentity({readyState:1,videoWidth:0,videoHeight:0}));const blob=await photographIdentity({readyState:2,videoWidth:2400,videoHeight:1800});assert.equal(canvas.width,1600);assert.equal(canvas.height,1200);assert.equal(blob.size,1200);assert.deepEqual(qualities,[.86,.72]);assert.equal(draws.length,1);
});
class Recorder{
 static supported='video/webm;codecs=vp8';static bytes=()=>syntheticSelfieVideo();static last=null;static isTypeSupported(mime){return mime===this.supported;}
 constructor(stream,options){this.options=options;this.mimeType=options.mimeType;this.state='inactive';Recorder.last=this;}
 start(){this.state='recording';}
 stop(){if(this.state==='inactive')return;this.state='inactive';this.ondataavailable?.({data:new Blob([Recorder.bytes()],{type:this.mimeType})});this.onstop?.();}
}
function recordFixture(t){Recorder.supported='video/webm;codecs=vp8';Recorder.bytes=()=>syntheticSelfieVideo();property(t,'MediaRecorder',Recorder);t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});const video=track(),stream={getVideoTracks:()=>[video]},control=new AbortController();return {video,stream,control};}
test('a complete silent selfie recording is capped at seven seconds and returns a supported video',async t=>{const f=recordFixture(t),progress=[],recorded=recordIdentitySelfie(f.stream,f.control.signal,v=>progress.push(v));t.mock.timers.tick(7000);const blob=await recorded;assert.equal(blob.type,'video/webm');assert.equal(blob.size,1200);assert.equal(Recorder.last.options.videoBitsPerSecond,240000);assert.equal(Recorder.last.state,'inactive');assert.equal(progress[0],0);});
test('cancellation, lost camera and oversized selfie data cannot produce a usable clip',async t=>{for(const reason of ['abort','lost','oversized']){await t.test(reason,async t=>{const f=recordFixture(t),promise=recordIdentitySelfie(f.stream,f.control.signal,()=>{});if(reason==='abort')f.control.abort();else if(reason==='lost')f.video.dispatchEvent(new Event('ended'));else{Recorder.bytes=()=>new Uint8Array(512001);t.mock.timers.tick(7000);}await assert.rejects(promise);assert.equal(Recorder.last.state,'inactive');});}});
test('recording chooses MP4 when needed and fails clearly without a supported recorder',t=>{property(t,'MediaRecorder',Recorder);Recorder.supported='video/mp4';assert.equal(identityRecorderMime(),'video/mp4');Recorder.supported='unsupported';assert.throws(identityRecorderMime,/cannot record/);globalThis.MediaRecorder=undefined;assert.throws(identityRecorderMime,/unavailable/);});
