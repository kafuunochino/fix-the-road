import test from 'node:test';import assert from 'node:assert/strict';import {nativePhone} from '../qa/native-phone-harness.mjs';
const profiles=[
 {width:320,height:568,dpr:2,safe:{top:20,bottom:0,left:0,right:0}},
 {width:375,height:812,dpr:3,safe:{top:44,bottom:34,left:0,right:0}},
 {width:390,height:844,dpr:3,safe:{top:47,bottom:34,left:0,right:0}},
 {width:430,height:932,dpr:3,safe:{top:59,bottom:34,left:0,right:0}},
 {width:412,height:1000,dpr:2.625,safe:{top:24,bottom:24,left:0,right:0}},
 {width:540,height:1200,dpr:2,safe:{top:40,bottom:32,left:0,right:0}},
 {width:768,height:1024,dpr:2,safe:{top:24,bottom:20,left:0,right:0}},
 {width:844,height:390,dpr:3,safe:{top:0,bottom:21,left:44,right:44}}
];
for(const p of profiles)test(`native fullscreen ${p.width}x${p.height} DPR${p.dpr}: no capped scene, safe controls, correct taps`,()=>{
 const h=nativePhone(p),s=h.snapshot(),a=s.layout.safeInsets;
 assert.equal(s.layout.width,p.width-a.left-a.right);assert.equal(s.layout.height,p.height-a.top-a.bottom);
 assert.equal(s.transform.x,a.left);assert.equal(s.transform.y,a.top);assert.equal(s.transform.scale,1);
 assert.ok(h.fills.some(r=>r[0]===0&&r[1]===0&&r[2]===p.width&&r[3]===p.height),'Background painted edge-to-edge');
 assert.equal(h.canvas.width,Math.round(p.width*p.dpr));assert.equal(h.canvas.height,Math.round(p.height*p.dpr));
 for(const b of s.hitTargets){assert.ok(b.x+s.transform.x>=a.left);assert.ok(b.y+s.transform.y>=a.top);assert.ok(b.x+b.w+s.transform.x<=p.width-a.right+.01);assert.ok(b.y+b.h+s.transform.y<=p.height-a.bottom+.01);}
 h.tap('tools');assert.equal(h.snapshot().modal,'tools');h.tap('close-tools');assert.equal(h.snapshot().modal,null);h.destroy();
});
test('native screen-size Canvas does not inherit smaller browser-style window dimensions',()=>{
 const h=nativePhone({width:390,height:844,windowWidth:300,windowHeight:500});assert.equal(h.size().width,390);assert.equal(h.size().height,844);assert.equal(h.canvas.width,1170);h.destroy();
});
test('host resize rebuilds backingstore, cancels old gesture, and removes listeners',()=>{
 const h=nativePhone();const b=h.snapshot().hitTargets.find(x=>x.id.startsWith('tile-')),s=h.snapshot();
 const touch={identifier:2,clientX:b.x+s.transform.x+20,clientY:b.y+s.transform.y+20};h.emit('TouchStart',{changedTouches:[touch]});
 h.resize({screenWidth:430,screenHeight:932});h.emit('TouchEnd',{changedTouches:[touch]});h.tick();
 assert.equal(h.snapshot().moves,0);assert.equal(h.size().width,430);assert.equal(h.canvas.height,2796);h.tap('tools');h.destroy();
 for(const list of Object.values(h.events))assert.equal(list.size,0);
});
