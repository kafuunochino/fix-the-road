import test from 'node:test';
import assert from 'node:assert/strict';
import {createTTPlatform} from '../adapters/tt.js';
function host() {
 const events={}, calls=[];
 const api={createCanvas:()=>({}),getSystemInfoSync:()=>({screenWidth:390,screenHeight:844,pixelRatio:1}),getStorageSync:()=>null,setStorageSync(){},
 createInnerAudioContext:()=>({src:'',seek(){calls.push('seek');throw Error('not loaded yet');},play(){calls.push('play');},pause(){calls.push('pause');throw Error('optional host failure');},destroy(){calls.push('destroy');throw Error('optional host failure');},onError(){}})};
 for(const n of ['Hide','Show','TouchStart','TouchMove','TouchEnd','TouchCancel','WindowResize']){api['on'+n]=f=>(events[n]??=new Set()).add(f);api['off'+n]=f=>events[n]?.delete(f);}
 return {api,calls,emit:n=>events[n]?.forEach(f=>f({})),scheduler:{requestAnimationFrame(){return 1;},cancelAnimationFrame(){}}};
}
test('optional native audio failures cannot stop playback, pause or cleanup',()=>{
 const h=host(),p=createTTPlatform(h.api,h.scheduler,{tap:'assets/tap.wav'});let paused=0,resumed=0;p.onPause(()=>paused++);p.onResume(()=>resumed++);
 p.audio.play('tap');assert.deepEqual(h.calls,['seek','play'],'a first-load seek failure must not suppress play');
 assert.doesNotThrow(()=>h.emit('Hide'));assert.equal(paused,1);const count=h.calls.length;p.audio.play('tap');assert.equal(h.calls.length,count,'do not play in background');
 h.emit('Show');assert.equal(resumed,1);p.audio.play('tap');assert.equal(h.calls.at(-1),'play');
 assert.doesNotThrow(()=>p.audio.setMuted(true));const mutedCount=h.calls.length;p.audio.play('tap');assert.equal(h.calls.length,mutedCount);
 assert.doesNotThrow(()=>p.destroy());const destroyedCount=h.calls.length;p.audio.setMuted(false);p.audio.play('tap');p.destroy();assert.equal(h.calls.length,destroyedCount,'destroy is terminal and idempotent');
});
