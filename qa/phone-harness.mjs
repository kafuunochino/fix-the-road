/** Runs the exact built HTML with its real browser adapter in a Node VM.
 * The host/input/storage are simulated. An optional real Canvas context is for
 * approximate raster previews, never a substitute for browser/phone QA.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export function createPhoneHarness({width=320,height=568,safeInsets={top:24,right:0,bottom:16,left:0},initial=null,storageThrows=false,storageWriteThrows=false,storageMap=null,canvas:realCanvas=null}={}){
 const events=()=>{const listeners=new Map();return {addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener(n,f){listeners.get(n)?.delete(f);},emit(n,e={}){for(const fn of [...(listeners.get(n)||[])])fn(e);},count:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0)};};
 const frames=new Map(),store=storageMap||new Map(initial?[['fix-the-road-v1',JSON.stringify(initial)]]:[]),texts=[];let now=0,nextFrame=0;
 const context=new Proxy({measureText:t=>({width:String(t).length*7}),fillText:(...args)=>texts.push(args)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const canvas=Object.assign(realCanvas||{getContext:()=>context},events(),{getBoundingClientRect:()=>({left:0,top:0,width,height}),setPointerCapture(){}});
 const document={...events(),hidden:false,getElementById:id=>{assert.equal(id,'game');return canvas;}};
 const window={...events(),document,devicePixelRatio:1,requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),getComputedStyle:()=>({getPropertyValue:name=>`${safeInsets[name.replace('--safe-','')]||0}px`}),localStorage:{getItem:key=>{if(storageThrows)throw Error('Blocked');return store.get(key)||null;},setItem:(key,val)=>{if(storageThrows||storageWriteThrows)throw Error('Blocked');store.set(key,String(val));}},Audio:class{constructor(src){assert.ok(src.startsWith('data:audio/wav;base64,'));}play(){return Promise.resolve();}pause(){}}};
 const html=fs.readFileSync(fileURLToPath(new URL('../deliverables/fix-the-road-demo.html',import.meta.url)),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
 vm.runInNewContext(script,{window,document,console},{timeout:2000});
 const snapshot=()=>window.roadDemo.getSnapshot();
 function tick(dt=50){now+=dt;const callbacks=[...frames.values()];frames.clear();if(callbacks.length)texts.length=0;callbacks.forEach(fn=>fn(now));}
 function point(type,x,y,id=1){canvas.emit('pointer'+type,{clientX:x,clientY:y,pointerId:id});}
 function tap(id){if(/^level-/.test(id)&&snapshot().modal==='levels'&&!snapshot().hitTargets.some(h=>h.id===id))tap('chapter-'+Math.floor((Number(id.slice(6))-1)/10));const s=snapshot(),b=s.hitTargets.find(h=>h.id===id);assert.ok(b,`Missing ${id} in ${s.modal}`);const x=s.transform.x+(b.x+b.w/2)*s.transform.scale,y=s.transform.y+(b.y+b.h/2)*s.transform.scale;point('down',x,y);point('up',x,y);tick();}
 function finish(){for(let i=0;i<300&&snapshot().busy;i++)tick();assert.equal(snapshot().busy,false);}
 function assertTargets(){const s=snapshot();for(const b of s.hitTargets){assert.ok(b.w*s.transform.scale>=44-1e-9&&b.h*s.transform.scale>=44-1e-9,`${b.id} <44 CSS px: ${b.w}x${b.h}`);const x=s.transform.x+b.x,y=s.transform.y+b.y;assert.ok(x>=safeInsets.left-1e-9&&y>=safeInsets.top-1e-9&&x+b.w<=width-safeInsets.right+1e-9&&y+b.h<=height-safeInsets.bottom+1e-9,`${b.id} violates safe viewport`);}}
 function resize(w,h,safe=safeInsets){width=w;height=h;safeInsets=safe;window.emit('resize');tick();}
 function destroy(){window.emit('pagehide',{persisted:false});assert.equal(frames.size,0);assert.equal(canvas.count(),0);assert.equal(document.count(),0);}
 function action(a){if(a.type==='turn')tap(`tile-${a.index}`);else if(a.type==='move'){tap('crane');tap(`tile-${a.from}`);tap(`tile-${a.to}`);tap('crane');}else{tap('dispatch');finish();}}
 tick();return {action,canvas,window,document,frames,store,texts,snapshot,tick,tap,point,finish,assertTargets,resize,destroy,html};
}
