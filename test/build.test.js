import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTTPlatform } from '../adapters/tt.js';
const root=fileURLToPath(new URL('../',import.meta.url));
function makeHost(){
  const events={},data=new Map(),frames=new Map(),calls=[];let next=0,time=0;
  const ctx=new Proxy({measureText:s=>({width:String(s).length*6})},{get:(target,key)=>key in target?target[key]:(...args)=>calls.push([key,...args]),set:(target,key,value)=>{target[key]=value;return true;}});
  const canvas={width:0,height:0,getContext:()=>ctx};
  const api={createCanvas:()=>{calls.push(['createCanvas']);return canvas;},getSystemInfoSync:()=>({windowWidth:400,windowHeight:800,pixelRatio:2}),getStorageSync:key=>data.get(key),setStorageSync:(key,value)=>data.set(key,value)};
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show']){events[name]=new Set();api['on'+name]=fn=>events[name].add(fn);api['off'+name]=fn=>events[name].delete(fn);}
  const scheduler={requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
  const emit=(name,event)=>events[name].forEach(fn=>fn(event));
  const tick=()=>{time+=50;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  return {api,scheduler,events,data,frames,calls,canvas,emit,tick};
}
test('tt adapter uses one canvas and logical touch coordinates at DPR 2',()=>{
  const host=makeHost(),platform=createTTPlatform(host.api,host.scheduler),received=[];platform.onPointer(e=>received.push(e));
  host.emit('TouchStart',{changedTouches:[{identifier:5,clientX:17,clientY:23}]});host.emit('TouchEnd',{changedTouches:[{identifier:5,clientX:19,clientY:25}]});
  assert.equal(host.canvas.width,800);assert.equal(host.canvas.height,1600);assert.deepEqual(received,[{type:'down',x:17,y:23,id:5},{type:'up',x:19,y:25,id:5}]);assert.equal(host.calls.filter(c=>c[0]==='createCanvas').length,1);platform.destroy();for(const group of Object.values(host.events))assert.equal(group.size,0);
});
test('generated Douyin entry boots, draws, accepts input and stores state without DOM globals',()=>{
  const host=makeHost(),context={tt:host.api,...host.scheduler};
  vm.runInNewContext(fs.readFileSync(root+'dist/douyin/game.js','utf8'),context,{timeout:1000});host.tick();
  assert.equal('window' in context,false);assert.equal('document' in context,false);assert.equal('localStorage' in context,false);
  assert.equal(host.calls.filter(c=>c[0]==='createCanvas').length,1);assert.ok(host.calls.some(c=>c[0]==='fillText'&&c[1]==='修好这条路'));
  host.emit('TouchStart',{changedTouches:[{identifier:1,clientX:321,clientY:36}]});host.emit('TouchEnd',{changedTouches:[{identifier:1,clientX:321,clientY:36}]});host.tick();
  assert.equal(JSON.parse(host.data.get('fix-the-road-v1')).sound,true);
  host.emit('Hide');assert.equal(host.frames.size,0);host.emit('Show');assert.equal(host.frames.size,1);host.tick();
});
test('single-file preview has no external dependencies and boots through browser adapter',()=>{
  const html=fs.readFileSync(root+'deliverables/fix-the-road-demo.html','utf8');assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)=/i);
  const source=html.match(/<script>([\s\S]*)<\/script>/)[1],host=makeHost(),events={};
  const on=(name,fn)=>{(events[name]||=[]).push(fn);};
  const canvas=Object.assign(host.canvas,{getBoundingClientRect:()=>({width:400,height:800,left:0,top:0}),addEventListener:on,removeEventListener:()=>{},setPointerCapture:()=>{}});
  const document={getElementById:()=>canvas,addEventListener:on,removeEventListener:()=>{},hidden:false};
  const window={document,...host.scheduler,localStorage:{getItem:()=>null,setItem:(key,value)=>host.data.set(key,value)},devicePixelRatio:2,addEventListener:on,removeEventListener:()=>{},Audio:class{play(){return Promise.resolve();}pause(){}}};
  vm.runInNewContext(source,{window,document},{timeout:1000});host.tick();assert.equal(window.roadDemo.getSnapshot().levelId,1);assert.ok(window.roadDemo.getSnapshot().hitTargets.some(h=>h.id==='dispatch'));
});
test('build output is deterministic across repeated builds',()=>{
  const paths=['dist/douyin/game.js','dist/douyin/game.json','dist/douyin/project.config.json','deliverables/fix-the-road-demo.html'];const previous=paths.map(p=>fs.readFileSync(root+p));
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});paths.forEach((p,i)=>assert.deepEqual(fs.readFileSync(root+p),previous[i]));
});
