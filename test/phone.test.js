import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneHarness} from '../qa/phone-harness.mjs';
import {LEVELS} from '../src/levels.js';
import {createTTPlatform} from '../adapters/tt.js';
const viewports=[
 {width:320,height:480,safeInsets:{top:20,right:0,bottom:16,left:0}},
 {width:320,height:568,safeInsets:{top:44,right:0,bottom:34,left:0}},
 {width:320,height:568,safeInsets:{top:44,right:12,bottom:34,left:12}},
 {width:320,height:568,safeInsets:{top:92,right:0,bottom:34,left:0}},
 {width:360,height:740,safeInsets:{top:24,right:0,bottom:24,left:0}},
 {width:390,height:844,safeInsets:{top:47,right:0,bottom:34,left:0}},
 {width:430,height:932,safeInsets:{top:59,right:0,bottom:34,left:0}},
 {width:1440,height:900,safeInsets:{top:0,right:0,bottom:0,left:0}}
];
for(const viewport of viewports)test(`phone HUD ${viewport.width}x${viewport.height}: exact HTML, fifty levels, safe areas, 44px targets and all in-Canvas panels`,()=>{
 const h=createPhoneHarness(viewport);
 assert.equal(h.snapshot().design,'road-city-reconnect-v4');assert.equal(h.snapshot().transform.scale,1);
 const body=h.html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script>[\s\S]*?<\/script>/,'').replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas>/,'').trim();assert.equal(body,'','No visible UI outside Canvas');
 assert.doesNotMatch(h.html,/https?:\/\/|\bfetch\s*\(|\bimport\s*\(|<script[^>]+src=/);
 for(const level of LEVELS){
  h.tap('levels');h.assertTargets();h.tap(`level-${level.id}`);h.assertTargets();
  for(const action of level.solution){h.action(action);}
  assert.equal(h.snapshot().complete,true);assert.equal(h.snapshot().moves,level.par);h.assertTargets();h.tap('replay');
 }
 h.tap('tools');h.assertTargets();h.tap('sound');assert.equal(JSON.parse(h.store.get('fix-the-road-v1')).sound,true);
 h.tap('help');h.assertTargets();assert.ok(!h.snapshot().hitTargets.some(b=>b.id.startsWith('tile-')));h.tap('close-help');
 h.tap('tools');h.tap('hint');assert.equal(h.snapshot().modal,null);h.tap('tools');h.tap('reset');h.assertTargets();
 assert.equal(JSON.parse(h.store.get('fix-the-road-v1')).completed.length,50);h.destroy();
});
test('exact HTML: dual delivery undo, replay, side-panel interruption and storage-denied fallback',()=>{
 const h=createPhoneHarness();h.tap('levels');h.tap('level-5');const actions=LEVELS[4].solution;let i=0;
 while(actions[i].type!=='dispatch')h.tap(`tile-${actions[i++].index}`);
 h.tap('dispatch');h.finish();assert.equal(h.snapshot().nextVehicle,1);h.tap('undo');assert.equal(h.snapshot().nextVehicle,0);
 h.tap('dispatch');h.finish();assert.equal(h.snapshot().nextVehicle,1);h.tap('dispatch');h.finish();assert.equal(h.snapshot().complete,false);h.tap(`tile-${LEVELS[4].junctionIndex}`);h.tap('dispatch');h.finish();assert.equal(h.snapshot().complete,true);
 h.tap('replay');h.tap('dispatch');h.tap('levels');h.tap('level-1');assert.equal(h.snapshot().busy,false);h.destroy();
 const blocked=createPhoneHarness({storageThrows:true});assert.equal(blocked.snapshot().storageOK,false);blocked.tap('tools');blocked.tap('sound');blocked.tap('continue');blocked.tap('levels');blocked.tap('level-10');blocked.assertTargets();blocked.destroy();
});
test('exact HTML: safe-area-only resize invalidates gestures and persisted pagehide pauses/resumes',()=>{
 const h=createPhoneHarness(),s=h.snapshot(),tile=s.hitTargets.find(b=>b.id.startsWith('tile-')),x=s.transform.x+tile.x+tile.w/2,y=s.transform.y+tile.y+tile.h/2;
 h.point('down',x,y);h.resize(320,568,{top:44,right:0,bottom:34,left:0});h.point('up',x,y);h.tick();assert.equal(h.snapshot().moves,0);h.assertTargets();
 h.tap('dispatch');h.window.emit('pagehide',{persisted:true});assert.equal(h.frames.size,0);h.tick(10000);assert.equal(h.snapshot().busy,true);h.window.emit('pageshow',{persisted:true});h.finish();h.destroy();
});
test('short-screen result text stays above next-stage controls',()=>{
 const h=createPhoneHarness({width:320,height:480,safeInsets:{top:24,right:0,bottom:20,left:0}});h.tap('levels');h.tap('level-10');
 for(const action of LEVELS[9].solution){h.action(action);}
 const next=h.snapshot().hitTargets.find(b=>b.id==='next'),goal=h.texts.find(t=>String(t[0]).startsWith('三星目标'));
 assert.equal(JSON.parse(h.store.get('fix-the-road-v1')).completed.length,1);assert.ok(!h.texts.some(t=>String(t[0]).includes('整座路网已经恢复畅通')),'Completing stage ten alone must not claim all stages cleared');
 assert.ok(goal);assert.ok(goal[2]+8<=next.y-16,'Goal text has at least sixteen logical pixels above action');h.assertTargets();h.destroy();
});
test('tt adapter carries safe insets and emits safe-area-only changes without remapping touch',()=>{
 let safeArea={left:0,top:44,right:320,bottom:534},touch,show;const canvas={},api={createCanvas:()=>canvas,getSystemInfoSync:()=>({windowWidth:320,windowHeight:568,pixelRatio:2,safeArea}),onShow:fn=>show=fn,onTouchStart:fn=>touch=fn,getStorageSync:()=>null};
 const p=createTTPlatform(api,{requestAnimationFrame(){},cancelAnimationFrame(){}});assert.deepEqual(p.getSize().safeInsets,{top:44,left:0,right:0,bottom:34});let resize=0,point;p.onResize(()=>resize++);p.onPointer(e=>point=e);
 safeArea={left:0,top:24,right:320,bottom:550};show({});assert.equal(resize,1);assert.equal(p.getSize().safeInsets.top,24);
 touch({changedTouches:[{identifier:1,clientX:50,clientY:80}]});assert.equal(point.x,50);assert.equal(point.y,80);p.destroy();
});

test('tt optional host capsule clearance is included in safe top, with failure fallback',()=>{
 const base={createCanvas:()=>({}),getSystemInfoSync:()=>({windowWidth:320,windowHeight:568,pixelRatio:1,safeArea:{left:0,top:44,right:320,bottom:534}}),getStorageSync:()=>null};
 const scheduler={requestAnimationFrame(){},cancelAnimationFrame(){}};
 const p=createTTPlatform({...base,getMenuButtonBoundingClientRect:()=>({bottom:84})},scheduler);assert.equal(p.getSize().safeInsets.top,92);p.destroy();
 const failed=createTTPlatform({...base,getMenuButtonBoundingClientRect:()=>{throw Error('unsupported');}},scheduler);assert.equal(failed.getSize().safeInsets.top,44);failed.destroy();
});
