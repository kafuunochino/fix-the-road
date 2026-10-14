import { LEVELS } from './levels.js';
import { createState, traceRoute, turnTile, dispatch, undo, ports, isEditable, isComplete, starsFor, normalizeProgress } from './rules.js';

// This module is platform-independent: no window, document, CSS, network or SDK globals.
export function startGame(platform) {
  const ctx = platform.canvas.getContext('2d');
  const W=400,H=800,KEY='fix-the-road-v1';
  const colors={paper:'#f5f7ed',ink:'#44513e',muted:'#8e9b81',purple:'#816c98',green:'#799361',yellow:'#eeb64d'};
  let saved, storageOK=true;
  try { saved=JSON.parse(platform.storage.getItem(KEY)); } catch { saved=null; storageOK=false; }
  let progress=normalizeProgress(saved,LEVELS.map(l=>l.id));
  let level=LEVELS.find(l=>l.id===progress.lastLevel)||LEVELS[0], state=createState(level);
  let preview=false, modal=null, message='', hint=-1, hits=[], animation=null, frameId=null, previousTime=null, paused=false, destroyed=false;
  let transform={scale:1,x:0,y:0}, gesture=null;
  let sidebarState=platform.sidebar?.getState?.()||null;
  platform.audio.setMuted(!progress.sound);
  const currentVehicle=()=>level.vehicles[state.nextVehicle];
  function save(){try{platform.storage.setItem(KEY,JSON.stringify(progress));storageOK=true;}catch{storageOK=false;}}
  function sound(name){if(progress.sound){try{platform.audio.play(name);}catch{}}}
  function round(x,y,w,h,r,fill,stroke){
    r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
  }
  function text(value,x,y,size=14,color=colors.ink,align='left',weight='normal') {ctx.fillStyle=color;ctx.font=`${weight} ${size}px sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(value),x,y);}
  function wrap(value,x,y,maxWidth,size=12,lineHeight=19,color=colors.muted,maxLines=3) {
    ctx.font=`${size}px sans-serif`;let line='',lines=0;
    for(const ch of String(value)){if(ctx.measureText(line+ch).width>maxWidth&&line){text(line,x,y+lines*lineHeight,size,color);lines++;line='';if(lines>=maxLines)return;}line+=ch;}
    if(line)text(line,x,y+lines*lineHeight,size,color);
  }
  function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function path(points,color,width,dashed=false){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash?.(dashed?[5,6]:[]);ctx.stroke();ctx.setLineDash?.([]);}
  function button(id,label,x,y,w,h,fn,{fill='#fafbf4',color=colors.muted,disabled=false,size=12}={}){
    ctx.globalAlpha=disabled ? .45 : 1;round(x,y,w,h,11,fill,fill===colors.purple?null:'#dce5d3');text(label,x+w/2,y+h/2,size,color,'center','600');ctx.globalAlpha=1;if(!disabled)hits.push({id,x,y,w,h,fn});
  }
  function schedule(){if(!destroyed&&!paused&&frameId===null)frameId=platform.requestFrame(drawFrame);}
  function notify(value){message=value;schedule();}
  async function openSidebar(){
    if(!platform.sidebar||!sidebarState?.available||sidebarState.pending)return;
    try{
      const opened=await platform.sidebar.navigate();
      if(!destroyed&&!opened)notify('暂时无法打开侧边栏，请稍后再试。');
    }catch{if(!destroyed)notify('暂时无法打开侧边栏，请稍后再试。');}
  }
  function load(id){level=LEVELS.find(l=>l.id===id)||LEVELS[0];state=createState(level);animation=null;previousTime=null;preview=false;modal=null;message='';hint=-1;progress.lastLevel=level.id;save();schedule();}
  function routeMessage(result){
    if(result.ok)return '路线接通了！这辆车可以放心出发。';
    if(result.reason==='wrong_destination')return '送错目的地啦！点橙色岔口换个方向。';
    if(result.reason==='switch_closed')return '在岔口停住了。点橙色路口切换方向。';
    if(result.reason==='out_of_bounds')return '小车要开出小镇啦。把道路转回镇里。';
    if(result.reason==='loop')return '小车在绕圈。转动道路，接向目的地。';
    return '这段路还没接上。转动道路，让两端对齐。';
  }
  function send(){
    if(animation)return;
    if(isComplete(state,level)){modal='win';schedule();return;}
    const outcome=dispatch(state,level);
    animation={outcome,vehicle:currentVehicle(),elapsed:0,duration:Math.max(400,(outcome.result.path.length-1)*190+300)};
    previousTime=null;preview=true;hint=-1;message='小车出发了！';sound('send');schedule();
  }
  function finishDelivery(){
    const {outcome}=animation;animation=null;previousTime=null;
    if(outcome.result.ok){state=outcome.state;preview=false;sound('win');
      if(isComplete(state,level)){if(!progress.completed.includes(level.id))progress.completed.push(level.id);progress.bestMoves[level.id]=Math.min(progress.bestMoves[level.id]??Infinity,state.moves);save();modal='win';message='所有心意都送到了！';}
      else message='面包送到了！切换橙色岔口，再把鲜花送去花园。';
    }else{message=routeMessage(outcome.result);sound('error');}
  }
  function showHint(){
    const route=level.routes[state.nextVehicle];hint=-1;
    for(let i=1;i<route.length-1;i++){
      const cell=route[i],index=cell[0]*level.width+cell[1];
      const direction=p=>p[0]<cell[0]?0:p[1]>cell[1]?1:p[0]>cell[0]?2:3;
      if(![direction(route[i-1]),direction(route[i+1])].every(d=>ports(state.board[index]).includes(d))){hint=index;break;}
    }
    notify(hint<0?'路线已经接通，放心出发吧！':state.board[hint].type==='switch'?'紫色框标出了岔口：点一下，换个分流方向。':'紫色框标出了该调整的路：转到前后都接上。');
  }
  function drawRoad(tile,x,y,size,active){
    const edge=[[x+size/2,y-1],[x+size+1,y+size/2],[x+size/2,y+size+1],[x-1,y+size/2]],center=[x+size/2,y+size/2];
    function connection(a,b,color,width,dash){
      const p=edge[a],q=edge[b];ctx.beginPath();ctx.moveTo(...p);
      if((a+2)%4===b)ctx.lineTo(...q);
      else{ctx.lineTo(center[0]+(p[0]-center[0])*.48,center[1]+(p[1]-center[1])*.48);ctx.quadraticCurveTo(...center,center[0]+(q[0]-center[0])*.48,center[1]+(q[1]-center[1])*.48);ctx.lineTo(...q);}
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='butt';ctx.setLineDash?.(dash?[size*.065,size*.07]:[]);ctx.stroke();ctx.setLineDash?.([]);
    }
    if(tile.type==='switch')connection(tile.stem,tile.exits[1-tile.switchState],'#e3d7b1',size*.32,false);
    const p=ports(tile);connection(...p,tile.type==='switch'?'#b8b09a':'#bbc5b4',size*.35,false);connection(...p,'#fffcef',size*.025,true);
    if(active)connection(...p,'#7ba663',size*.05,true);
    if(tile.type==='switch'){circle(...center,size*.095,'#f5cd72');text('⇄',x+size*.84,y+size*.84,size*.15,'#b18e42','center','700');}
  }
  function drawBuilding(tile,x,y,s){
    const e=[[.5,0],[1,.5],[.5,1],[0,.5]][tile.direction];path([[x+s*.5,y+s*.5],[x+s*e[0],y+s*e[1]]],'#c0c5b0',s*.3);
    const garden=tile.destination==='garden',garage=tile.type==='source';
    round(x+s*.22,y+s*.32,s*.56,s*.4,s*.045,garden?'#c6b9d8':garage?'#afc1be':'#f0ce94');
    ctx.beginPath();ctx.moveTo(x+s*.16,y+s*.34);ctx.lineTo(x+s*.5,y+s*.13);ctx.lineTo(x+s*.84,y+s*.34);ctx.closePath();ctx.fillStyle=garden?'#9e8bb6':garage?'#839e99':'#bf937d';ctx.fill();
    round(x+s*.44,y+s*.49,s*.17,s*.24,s*.05,garden?'#9785ae':garage?'#e5e8d8':'#b4956d');
    round(x+s*.28,y+s*.42,s*.11,s*.13,s*.015,'#fff0c4');
    if(!garden&&!garage){round(x+s*.19,y+s*.35,s*.63,s*.09,s*.025,'#f9e8b9');for(let i=0;i<5;i++)round(x+s*(.22+i*.12),y+s*.35,s*.05,s*.09,0,'#d5ae7b');}
    if(garden){circle(x+s*.25,y+s*.65,s*.07,'#edbaa7');circle(x+s*.75,y+s*.65,s*.07,'#dab1d4');circle(x+s*.25,y+s*.65,s*.025,'#ffebaf');circle(x+s*.75,y+s*.65,s*.025,'#ffebaf');}
    text(garage?'车库':garden?'花园':'面包店',x+s*.5,y+s*.86,Math.max(8,s*.105),garden?'#897197':'#81704f','center','700');
  }
  function drawPark(decor,x,y,s){
    if(decor%3===0){round(x+s*.46,y+s*.45,s*.07,s*.29,s*.03,'#a3af83');circle(x+s*.5,y+s*.39,s*.23,'#aec891');circle(x+s*.57,y+s*.41,s*.17,'#a3c084');}
    else if(decor%3===1){round(x+s*.26,y+s*.45,s*.48,s*.22,s*.11,'#c2d7c3');round(x+s*.3,y+s*.46,s*.36,s*.14,s*.07,'#cce3d3');path([[x+s*.42,y+s*.5],[x+s*.57,y+s*.5]],'#e7f0e2',2);}
    else{path([[x+s*.33,y+s*.66],[x+s*.33,y+s*.49]],'#b0c38e',2);circle(x+s*.33,y+s*.47,s*.07,'#e4d5b2');path([[x+s*.66,y+s*.58],[x+s*.66,y+s*.38]],'#b0c38e',2);circle(x+s*.66,y+s*.36,s*.07,'#e2cbb7');}
  }
  function drawCar(x,y,size,color,angle=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);round(-size*.42,-size*.29,size*.84,size*.58,size*.13,color);round(-size*.27,-size*.2,size*.29,size*.4,size*.045,'#f8dfb2');round(size*.13,-size*.2,size*.2,size*.4,size*.04,'#fff1ce');round(-size*.25,-size*.36,size*.2,size*.09,size*.03,'#697460');round(-size*.25,size*.27,size*.2,size*.09,size*.03,'#697460');round(size*.22,-size*.35,size*.12,size*.08,size*.03,'#697460');round(size*.22,size*.27,size*.12,size*.08,size*.03,'#697460');ctx.restore();
  }
  function drawBoard(){
    const bx=24,by=207,bw=352,gap=4,tileSize=(bw-gap*(level.width-1))/level.width;
    round(bx-10,by-10,bw+20,bw+20,20,'#d3e0c8');round(bx-10,by-14,bw+20,bw+20,20,'#e0ebd8','#d3dec8');
    const route=currentVehicle()?traceRoute(level,state.board,currentVehicle()):null,routeCells=new Set(preview?route?.path:[]);
    state.board.forEach((tile,i)=>{
      const x=bx+(i%level.width)*(tileSize+gap),y=by+Math.floor(i/level.width)*(tileSize+gap);
      const color=tile.type==='park'?'#d7e5cb':tile.type==='switch'?'#fff0c2':tile.type==='destination'?(tile.destination==='garden'?'#e8e1ee':'#f3ecd8'):tile.type==='source'?'#e6ebdd':'#fafaf0';
      round(x,y,tileSize,tileSize,9,color);
      ctx.save();round(x,y,tileSize,tileSize,9);ctx.clip();
      if(tile.type==='park')drawPark(tile.decor,x,y,tileSize);else if(tile.type==='source'||tile.type==='destination')drawBuilding(tile,x,y,tileSize);else drawRoad(tile,x,y,tileSize,routeCells.has(i));ctx.restore();
      if(hint===i||preview&&route&&!route.ok&&route.at===i){round(x+2,y+2,tileSize-4,tileSize-4,8,null,hint===i?'#9b72bb':'#d5aa83');ctx.lineWidth=2;}
      if(isEditable(tile)&&!animation&&!isComplete(state,level))hits.push({id:`tile-${i}`,x,y,w:tileSize,h:tileSize,fn:()=>{if(animation||isComplete(state,level))return;state=turnTile(state,i);hint=-1;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';sound(tile.type==='switch'?'switch':'turn');schedule();}});
    });
    if(animation){const route=animation.outcome.result.path,t=Math.min(animation.elapsed/190,route.length-1),a=Math.floor(t),b=Math.min(a+1,route.length-1),f=t-a,from=route[a],to=route[b],col=(from%level.width)*(1-f)+(to%level.width)*f,row=Math.floor(from/level.width)*(1-f)+Math.floor(to/level.width)*f;const delta=to-from|| (a>0?from-route[a-1]:1),angle=delta===1?0:delta===-1?Math.PI:delta>0?Math.PI/2:-Math.PI/2;drawCar(bx+col*(tileSize+gap)+tileSize/2,by+row*(tileSize+gap)+tileSize/2,tileSize*.66,animation.vehicle.color,angle);}
  }
  function drawMain(){
    text('↱',25,35,30,colors.purple,'left','700');text('修好这条路',62,34,20,colors.ink,'left','700');text('小镇接力 / DEMO',62,55,9,colors.muted);
    if(sidebarState?.available)button('sidebar',sidebarState.pending?'打开中…':'侧边栏 ↗',204,21,92,30,openSidebar,{disabled:sidebarState.pending,size:10});
    button('sound',progress.sound?'♪':'静',306,21,30,30,()=>{progress.sound=!progress.sound;platform.audio.setMuted(!progress.sound);save();sound('turn');schedule();},{size:13});button('help','?',346,21,30,30,()=>{modal='help';schedule();});
    text(level.district,24,89,10,colors.muted);text(level.title,24,111,20,colors.ink,'left','700');button('levels',`第 ${String(level.id).padStart(2,'0')} 关`,300,82,76,32,()=>{modal='levels';schedule();},{size:10});
    const vehicle=currentVehicle()||level.vehicles.at(-1),complete=isComplete(state,level);
    round(24,134,352,54,14,'#fff8e9','#eee5cb');drawCar(57,161,39,vehicle.color);text(complete?'心意已送达':level.vehicles.length===2?'双车接力 · 先面包，后鲜花':'这一趟，送一点温暖',87,149,9,'#b0a07d');text(complete?'本关配送完成！':vehicle.destination==='bakery'?'把早餐送到面包店':'把鲜花送到花园',87,170,13,'#7b6b4e','left','700');text(`${Math.min(state.nextVehicle+1,level.vehicles.length)} / ${level.vehicles.length}`,353,162,13,'#b1a17c','right','700');
    drawBoard();circle(28,579,3,colors.yellow);text('面包店',36,579,10,colors.muted);circle(94,579,3,'#ad8aca');text('花园',102,579,10,colors.muted);text(`已转动 ${state.moves} 次`,374,579,10,colors.muted,'right');
    round(24,596,352,49,11,'#eaf0e0');wrap(message||level.note,35,612,329,11,18,colors.green,2);
    button('undo','↶ 撤销',24,657,77,37,()=>{state=undo(state);hint=-1;message='已撤销上一步。';schedule();},{disabled:!!animation||!state.history.length});
    button('reset','↻ 重来',109,657,77,37,()=>load(level.id),{disabled:!!animation});
    button('preview','路线预览',194,657,97,37,()=>{preview=!preview;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';schedule();},{disabled:!!animation||complete,fill:preview?'#e8dfef':'#fafbf4',color:preview?colors.purple:colors.muted});
    button('hint','✦ 提示',299,657,77,37,showHint,{disabled:!!animation||complete});
    round(24,711,352,49,13,'#6d5b84');button('dispatch',animation?'小车正在路上…':complete?'看看这一关的成绩':`${vehicle.name}，出发！  →`,24,707,352,49,send,{fill:colors.purple,color:'#fffdf6',size:14,disabled:!!animation});
    text(sidebarState?.enteredFromSidebar?'欢迎从侧边栏回来 · 继续修好小镇的路':'点击道路旋转 · 橙色岔口切换方向 · 随时可撤销',200,779,9,'#a2ad97','center');
  }
  function drawModal(){
    // Discard underlying hit targets: modal input cannot leak to the board.
    hits=[];ctx.fillStyle='#33412e88';ctx.fillRect(0,0,W,H);
    if(modal==='levels'){
      round(23,204,354,374,22,'#fafbf2');text('小镇地图',46,235,11,colors.muted);text('下一站，去哪里？',46,264,23,colors.ink,'left','700');text('10 关全部开放 · 第 5 关起是双车接力',46,295,11,colors.muted);
      LEVELS.forEach((l,i)=>{const x=45+(i%5)*64,y=321+Math.floor(i/5)*86;button(`level-${l.id}`,String(l.id).padStart(2,'0'),x,y,55,69,()=>load(l.id),{fill:level.id===l.id?'#e6ddee':'#eef3e5',color:colors.purple,size:20});const best=progress.bestMoves[l.id];text(best===undefined?(l.id>=5?'双车':'单车'):'★'.repeat(starsFor(best,l.par)),x+27.5,y+55,9,best===undefined?colors.muted:'#c5a253','center');});
      text(`已完成 ${progress.completed.length} / 10 关`,46,520,11,colors.green);text(storageOK?'进度仅保存在当前设备，清除数据会丢失。':'当前无法保存进度，但仍可继续游玩。',46,546,9,colors.muted);button('close','×',329,221,29,29,()=>{modal=null;schedule();});
    }else if(modal==='help'){
      round(25,177,350,441,22,'#fafbf2');text('小镇调度员手册',47,207,11,colors.muted);text('转对路，再出发',47,240,23,colors.ink,'left','700');
      const items=[['1  点击道路，顺时针转 90°','道路两端要对齐，建筑和绿地不能移动。'],['2  预览路线，再让小车出发','黄色车送面包，紫色车送鲜花。走错路没有惩罚。'],['3  双车接力，记得切换岔口','第 5 关起，先送面包，再点击橙色岔口切换方向，最后把花送到花园。']];
      items.forEach((item,i)=>{text(item[0],47,286+i*82,13,colors.ink,'left','700');wrap(item[1],47,311+i*82,300,11,18,colors.muted,3);});
      text('无倒计时 · 可以撤销送达 · 本地自动存档',200,550,10,colors.muted,'center');button('close-help','明白了，来修路！',47,572,306,33,()=>{modal=null;schedule();},{fill:colors.purple,color:'#fffdf5'});
    }else if(modal==='win'){
      round(35,221,330,356,23,'#fafbf2');text('每一份心意，都有路可走',200,253,10,colors.muted,'center');text(level.id===10?'整座小镇，都动起来了！':'心意顺利送达！',200,291,23,colors.ink,'center','700');text('★'.repeat(starsFor(state.moves,level.par)),200,342,37,'#e1b259','center');text(`${state.moves} 次转动 · ${level.vehicles.length} 辆小车到达`,200,388,13,colors.green,'center');text(`三星目标：${level.par} 次以内`,200,416,11,colors.muted,'center');text(storageOK?'最好成绩已保存在当前设备。':'当前无法保存进度，本次成绩暂存于页面。',200,440,10,colors.muted,'center');
      button('next',level.id===10?'回到小镇地图 →':'去下一条街 →',61,474,278,42,()=>{if(level.id===10){modal='levels';schedule();}else load(level.id+1);},{fill:colors.purple,color:'#fffdf6',size:13});button('replay','再来一次',132,531,136,29,()=>load(level.id),{size:11});button('close-win','×',324,234,25,25,()=>{modal=null;schedule();});
    }
  }
  function drawFrame(time){
    frameId=null;if(destroyed||paused)return;
    if(animation){if(previousTime!==null)animation.elapsed+=Math.min(100,Math.max(0,time-previousTime));previousTime=time;if(animation.elapsed>=animation.duration)finishDelivery();}
    const {width,height,dpr}=platform.getSize();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=colors.paper;ctx.fillRect(0,0,width,height);
    const scale=Math.min(width/W,height/H);transform={scale,x:(width-W*scale)/2,y:(height-H*scale)/2};ctx.translate(transform.x,transform.y);ctx.scale(scale,scale);hits=[];drawMain();if(modal)drawModal();if(animation)schedule();
  }
  const unsubscribers=[platform.onPointer(event=>{
    if(destroyed||paused)return;const x=(event.x-transform.x)/transform.scale,y=(event.y-transform.y)/transform.scale;
    const targetAt=(px,py)=>[...hits].reverse().find(h=>px>=h.x&&px<=h.x+h.w&&py>=h.y&&py<=h.y+h.h);
    if(event.type==='down'){
      if(gesture)return; // One active finger owns a tap; ignore secondary touches.
      gesture={x,y,id:event.id,targetId:targetAt(x,y)?.id??null};return;
    }
    if(!gesture||gesture.id!==event.id)return;
    if(event.type==='cancel'){gesture=null;return;}
    if(event.type==='move'){
      if(Math.hypot(x-gesture.x,y-gesture.y)>15)gesture.targetId=null;
      return;
    }
    if(event.type!=='up')return;
    const down=gesture;gesture=null;
    if(!down.targetId||Math.hypot(x-down.x,y-down.y)>15)return;
    const hit=targetAt(x,y);
    if(hit?.id!==down.targetId)return;
    // Never reuse a rendered closure after a synchronous state transition.
    hits=[];hit.fn();schedule();
  }),platform.onResize(()=>{gesture=null;schedule();}),platform.onPause(()=>{paused=true;gesture=null;previousTime=null;if(frameId!==null){platform.cancelFrame(frameId);frameId=null;}}),platform.onResume(()=>{paused=false;previousTime=null;schedule();})];
  if(typeof platform.sidebar?.subscribe==='function')unsubscribers.push(platform.sidebar.subscribe(value=>{sidebarState=value;schedule();}));
  schedule();
  return {destroy(){destroyed=true;animation=null;if(frameId!==null)platform.cancelFrame(frameId);unsubscribers.forEach(fn=>{if(typeof fn==='function')fn();});},getSnapshot(){return {levelId:level.id,moves:state.moves,nextVehicle:state.nextVehicle,complete:isComplete(state,level),busy:!!animation,modal,preview,message,storageOK,sidebar:sidebarState?{...sidebarState}:null,board:state.board.map(t=>({...t,...(t.exits?{exits:[...t.exits]}:{})})),hitTargets:hits.map(({id,x,y,w,h})=>({id,x,y,w,h})),transform:{...transform}};}};
}
