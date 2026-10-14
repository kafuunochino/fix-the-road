import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/canvas-game.js';
import { LEVELS } from '../src/levels.js';

function makePlatform({levelId=1, storageThrows=false, sidebar}={}) {
  const handlers={pointer:new Set(),resize:new Set(),pause:new Set(),resume:new Set()},frames=new Map();let id=0,time=0,size={width:400,height:800,dpr:2};
  const data=new Map([['fix-the-road-v1',JSON.stringify({version:1,lastLevel:levelId,completed:[],bestMoves:{},sound:false})]]);
  const calls=[];
  const context=new Proxy({measureText:text=>({width:String(text).length*6})},{get:(obj,key)=>key in obj?obj[key]:(...args)=>calls.push([key,...args]),set:(obj,key,value)=>{obj[key]=value;return true;}});
  const on=name=>fn=>{handlers[name].add(fn);return()=>handlers[name].delete(fn);};
  const platform={canvas:{getContext:()=>context},getSize:()=>size,onPointer:on('pointer'),onResize:on('resize'),onPause:on('pause'),onResume:on('resume'),requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:id=>frames.delete(id),storage:{getItem:key=>{if(storageThrows)throw Error('denied');return data.get(key)||null;},setItem:(key,value)=>{if(storageThrows)throw Error('denied');data.set(key,value);}},audio:{play:()=>{},setMuted:()=>{}}};
  if(sidebar)platform.sidebar=sidebar;
  const game=startGame(platform);
  const tick=(dt=16)=>{time+=dt;const current=[...frames.entries()];frames.clear();current.forEach(([,fn])=>fn(time));};tick();
  const emit=(name,value)=>handlers[name].forEach(fn=>fn(value));
  const tap=id=>{const s=game.getSnapshot(),hit=s.hitTargets.find(h=>h.id===id);assert.ok(hit,`Missing hit target ${id} at level ${s.levelId} modal ${s.modal}`);const x=(hit.x+hit.w/2)*s.transform.scale+s.transform.x,y=(hit.y+hit.h/2)*s.transform.scale+s.transform.y;emit('pointer',{type:'down',x,y,id:1});emit('pointer',{type:'up',x,y,id:1});tick();};
  const finish=()=>{for(let n=0;game.getSnapshot().busy&&n<300;n++)tick(50);assert.equal(game.getSnapshot().busy,false);};
  return {game,platform,tap,tick,finish,emit,frames,data,calls,handlers,setSize:value=>{size=value;emit('resize');tick();}};
}

for(const level of LEVELS)test(`Canvas flow completes level ${level.id} using only pointer actions`,()=>{
  const app=makePlatform({levelId:level.id});
  for(const action of level.solution){if(action.type==='turn')app.tap(`tile-${action.index}`);else{app.tap('dispatch');app.finish();}}
  const state=app.game.getSnapshot();assert.equal(state.complete,true);assert.equal(state.modal,'win');assert.equal(state.moves,level.par);assert.ok(JSON.parse(app.data.get('fix-the-road-v1')).completed.includes(level.id));
  app.tap('replay');assert.equal(app.game.getSnapshot().complete,false);assert.equal(app.game.getSnapshot().moves,0);app.game.destroy();
});

test('Canvas failure, preview, hint, undo and reset remain usable',()=>{
  const app=makePlatform();app.tap('dispatch');app.finish();assert.equal(app.game.getSnapshot().nextVehicle,0);assert.equal(app.game.getSnapshot().preview,true);
  app.tap('preview');assert.equal(app.game.getSnapshot().preview,false);app.tap('hint');assert.ok(app.game.getSnapshot().message.includes('道路')||app.game.getSnapshot().message.includes('该调整')||app.game.getSnapshot().message.includes('紫色框'));
  const index=LEVELS[0].solution.find(a=>a.type==='turn').index;app.tap(`tile-${index}`);app.tap('undo');assert.equal(app.game.getSnapshot().moves,0);app.tap(`tile-${index}`);app.tap('reset');assert.equal(app.game.getSnapshot().moves,0);app.game.destroy();
});

test('shared-junction Canvas flow rejects the second delivery until switched',()=>{
  const app=makePlatform({levelId:5}),level=LEVELS[4];let cursor=0;
  while(level.solution[cursor].type!=='dispatch'){app.tap(`tile-${level.solution[cursor].index}`);cursor++;}
  app.tap('dispatch');app.finish();assert.equal(app.game.getSnapshot().nextVehicle,1);
  app.tap('dispatch');app.finish();assert.equal(app.game.getSnapshot().nextVehicle,1);assert.equal(app.game.getSnapshot().complete,false);assert.match(app.game.getSnapshot().message,/错目的地/);
  app.tap(`tile-${level.junctionIndex}`);app.tap('dispatch');app.finish();assert.equal(app.game.getSnapshot().complete,true);app.game.destroy();
});

test('modal hit regions cannot leak to board, navigation cancels an in-flight car',()=>{
  const app=makePlatform();app.tap('help');assert.equal(app.game.getSnapshot().modal,'help');assert.equal(app.game.getSnapshot().hitTargets.some(h=>h.id.startsWith('tile-')),false);app.tap('close-help');
  app.tap('dispatch');assert.equal(app.game.getSnapshot().busy,true);assert.equal(app.game.getSnapshot().hitTargets.some(h=>h.id==='dispatch'),false);
  app.tap('levels');app.tap('level-10');app.finish();assert.equal(app.game.getSnapshot().levelId,10);assert.equal(app.game.getSnapshot().moves,0);assert.equal(app.game.getSnapshot().nextVehicle,0);app.game.destroy();
});

test('pause freezes an animated departure and resume continues; destroy removes all listeners',()=>{
  const app=makePlatform();app.tap('dispatch');app.emit('pause');assert.equal(app.frames.size,0);app.tick(10000);assert.equal(app.game.getSnapshot().busy,true);app.emit('resume');app.finish();
  app.game.destroy();assert.equal(app.frames.size,0);for(const listeners of Object.values(app.handlers))assert.equal(listeners.size,0);
});

test('touch coordinates stay correct after DPR and mobile-size changes',()=>{
  const app=makePlatform();app.setSize({width:360,height:740,dpr:3});app.tap('levels');app.tap('level-6');assert.equal(app.game.getSnapshot().levelId,6);app.tap(`tile-${LEVELS[5].solution[0].index}`);assert.equal(app.game.getSnapshot().moves,1);assert.ok(app.calls.some(c=>c[0]==='setTransform'&&c[1]===3));app.game.destroy();
});

test('storage denied and cancelled gestures cannot break gameplay',()=>{
  const app=makePlatform({storageThrows:true});assert.equal(app.game.getSnapshot().storageOK,false);app.tap('sound');app.tap('levels');app.tap('level-2');assert.equal(app.game.getSnapshot().levelId,2);
  app.emit('pointer',{type:'down',x:50,y:100,id:7});app.emit('pointer',{type:'cancel',x:50,y:100,id:7});app.emit('pointer',{type:'up',x:50,y:100,id:7});assert.equal(app.game.getSnapshot().moves,0);app.game.destroy();
});

test('a tap starting in a gap cannot activate a tile on release',()=>{
  const app=makePlatform();const hit=app.game.getSnapshot().hitTargets.find(h=>h.id.startsWith('tile-'));
  app.emit('pointer',{type:'down',x:hit.x-2,y:hit.y+hit.h/2,id:1});app.emit('pointer',{type:'up',x:hit.x+2,y:hit.y+hit.h/2,id:1});app.tick();
  assert.equal(app.game.getSnapshot().moves,0);app.game.destroy();
});

test('dispatch invalidates stale board and control hit targets before the next frame',()=>{
  const app=makePlatform();const before=app.game.getSnapshot();const tile=before.hitTargets.find(h=>h.id.startsWith('tile-')),send=before.hitTargets.find(h=>h.id==='dispatch'),reset=before.hitTargets.find(h=>h.id==='reset');
  const rawTap=(hit,id)=>{app.emit('pointer',{type:'down',x:hit.x+hit.w/2,y:hit.y+hit.h/2,id});app.emit('pointer',{type:'up',x:hit.x+hit.w/2,y:hit.y+hit.h/2,id});};
  rawTap(send,1);assert.equal(app.game.getSnapshot().busy,true);assert.equal(app.game.getSnapshot().hitTargets.length,0);
  rawTap(tile,2);rawTap(reset,3);assert.equal(app.game.getSnapshot().moves,before.moves);assert.equal(app.game.getSnapshot().busy,true);
  app.finish();assert.equal(app.game.getSnapshot().moves,before.moves);app.game.destroy();
});

test('secondary touches cannot overwrite or cancel the primary tap',()=>{
  const app=makePlatform();const tile=app.game.getSnapshot().hitTargets.find(h=>h.id.startsWith('tile-')),x=tile.x+tile.w/2,y=tile.y+tile.h/2;
  app.emit('pointer',{type:'down',x,y,id:1});app.emit('pointer',{type:'down',x,y,id:2});app.emit('pointer',{type:'up',x,y,id:2});app.emit('pointer',{type:'cancel',x,y,id:2});app.emit('pointer',{type:'up',x,y,id:1});app.tick();
  assert.equal(app.game.getSnapshot().moves,1);app.game.destroy();
});

test('dragging away and back does not turn a road',()=>{
  const app=makePlatform();const tile=app.game.getSnapshot().hitTargets.find(h=>h.id.startsWith('tile-')),x=tile.x+tile.w/2,y=tile.y+tile.h/2;
  app.emit('pointer',{type:'down',x,y,id:1});app.emit('pointer',{type:'move',x:x+25,y,id:1});app.emit('pointer',{type:'move',x,y,id:1});app.emit('pointer',{type:'up',x,y,id:1});app.tick();
  assert.equal(app.game.getSnapshot().moves,0);app.game.destroy();
});

test('Canvas sidebar is hidden when unsupported and requires an explicit supported tap',async()=>{
  const unsupported=makePlatform({sidebar:{getState:()=>({available:false,pending:false}),subscribe:()=>()=>{},navigate:()=>{throw Error('must not navigate');}}});
  assert.equal(unsupported.game.getSnapshot().hitTargets.some(h=>h.id==='sidebar'),false);unsupported.game.destroy();
  let calls=0,listener,resolve;
  const sidebar={getState:()=>({available:true,pending:false,enteredFromSidebar:false}),subscribe:fn=>{listener=fn;return()=>{listener=null;};},navigate:()=>{calls++;listener({available:true,pending:true,enteredFromSidebar:false});return new Promise(r=>resolve=r);}};
  const app=makePlatform({sidebar});assert.equal(calls,0);app.tap('sidebar');assert.equal(calls,1);assert.equal(app.game.getSnapshot().hitTargets.some(h=>h.id==='sidebar'),false);
  listener({available:true,pending:false,enteredFromSidebar:false});resolve(false);await Promise.resolve();app.tick();assert.match(app.game.getSnapshot().message,/暂时无法/);assert.equal(app.game.getSnapshot().nextVehicle,0);assert.equal(app.game.getSnapshot().moves,0);
  listener({available:true,pending:false,enteredFromSidebar:true});app.tick();assert.equal(app.game.getSnapshot().sidebar.enteredFromSidebar,true);
  listener({available:true,pending:false,enteredFromSidebar:false});app.tick();assert.equal(app.game.getSnapshot().sidebar.enteredFromSidebar,false);
  app.game.destroy();assert.equal(listener,null);
});
