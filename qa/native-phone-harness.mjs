// Exact ES2018 native bundle, simulated tt host, optional actual raster Canvas.
// This is not an official simulator or a real-phone verification.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
export function nativePhone({width=390,height=844,dpr=3,windowWidth=width,windowHeight=height,safe={top:47,bottom:34,left:0,right:0},canvas=null}={}){
 const events={},frames=new Map(),fills=[];let seq=0,time=0;
 const ctx=new Proxy({measureText:t=>({width:String(t).length*7}),fillRect:(...a)=>fills.push(a)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 canvas=canvas||{getContext:()=>ctx};
 let info={screenWidth:width,screenHeight:height,windowWidth,windowHeight,pixelRatio:dpr,safeArea:{top:safe.top,left:safe.left,right:width-safe.right,bottom:height-safe.bottom}};
 const tt={createCanvas:()=>canvas,getSystemInfoSync:()=>info,getMenuButtonLayout:()=>({bottom:safe.top+32}),getStorageSync:()=>null,setStorageSync(){}};
 for(const n of ['Show','Hide','TouchStart','TouchMove','TouchEnd','TouchCancel','WindowResize']){tt['on'+n]=f=>{(events[n]||=new Set()).add(f)};tt['off'+n]=f=>events[n]?.delete(f);}
 const emit=(n,e)=>events[n]?.forEach(f=>f(e));
 const bundle=fs.readFileSync(new URL('../dist/douyin/game.js',import.meta.url),'utf8');
 assert.ok(bundle.endsWith('})();\n'));assert.ok(bundle.includes('startGame(platform);'));
 const context={tt,requestAnimationFrame:f=>{frames.set(++seq,f);return seq},cancelAnimationFrame:id=>frames.delete(id),console};
 vm.runInNewContext(bundle.replace('startGame(platform);','globalThis.__game = startGame(platform); globalThis.__platform = platform;'),context,{timeout:3000});
 function tick(){time+=16;const f=[...frames.values()];frames.clear();f.forEach(fn=>fn(time));}tick();
 function tap(id){const s=context.__game.getSnapshot(),b=s.hitTargets.find(x=>x.id===id);assert.ok(b,id);const point={identifier:1,clientX:s.transform.x+b.x+b.w/2,clientY:s.transform.y+b.y+b.h/2};emit('TouchStart',{changedTouches:[point]});emit('TouchEnd',{changedTouches:[point]});tick();}
 return {canvas,ctx,fills,events,tick,tap,emit,snapshot:()=>context.__game.getSnapshot(),size:()=>context.__platform.getSize(),resize(next){info={...info,...next};emit('WindowResize',{size:{windowWidth:next.screenWidth||width,windowHeight:next.screenHeight||height}});tick()},destroy(){context.__game.destroy();context.__platform.destroy();}};
}
