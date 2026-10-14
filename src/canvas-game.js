import { LEVELS } from './levels.js';
import { createState, traceRoute, turnTile, dispatch, undo, ports, isEditable, isComplete, starsFor, normalizeProgress } from './rules.js';

// This module is platform-independent: no window, document, CSS, network or SDK globals.
export function startGame(platform) {
  const ctx = platform.canvas.getContext('2d');
  let W=400,H=800,layout={};
  const KEY='fix-the-road-v1';
  const colors={paper:'#102c40',ink:'#edf4ed',muted:'#9db7c4',purple:'#d3a1ff',green:'#67e5cb',yellow:'#ffca51'};
  const fontStack='"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
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
  function text(value,x,y,size=14,color=colors.ink,align='left',weight='400') {ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${fontStack}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(String(value),x,y);}
  function wrap(value,x,y,maxWidth,size=12,lineHeight=19,color=colors.muted,maxLines=3) {
    ctx.font=`400 ${size}px ${fontStack}`;let line='',lines=0;
    for(const ch of String(value)){if(ctx.measureText(line+ch).width>maxWidth&&line){text(line,x,y+lines*lineHeight,size,color);lines++;line='';if(lines>=maxLines)return;}line+=ch;}
    if(line)text(line,x,y+lines*lineHeight,size,color);
  }
  function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function path(points,color,width,dashed=false){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash?.(dashed?[5,6]:[]);ctx.stroke();ctx.setLineDash?.([]);}
  function button(id,label,x,y,w,h,fn,{fill='#1c4054',color=colors.ink,disabled=false,size=13}={}){
    ctx.globalAlpha=disabled ? 0.38 : 1;round(x,y+3,w,h,3,'#061c2a');round(x,y,w,h,3,fill,fill===colors.yellow?'#ffe29a':'#598394');
    text(label,x+w/2,y+h/2,size,color,'center','700');ctx.globalAlpha=1;
    if(!disabled)hits.push({id,x,y,w,h,fn});
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
    function connection(a,b,color,width,dash=false){
      const p=edge[a],q=edge[b];ctx.beginPath();ctx.moveTo(...p);
      if((a+2)%4===b)ctx.lineTo(...q);
      else{ctx.lineTo(center[0]+(p[0]-center[0])*.48,center[1]+(p[1]-center[1])*.48);ctx.quadraticCurveTo(...center,center[0]+(q[0]-center[0])*.48,center[1]+(q[1]-center[1])*.48);ctx.lineTo(...q);}
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='butt';ctx.setLineDash?.(dash?[size*.08,size*.07]:[]);ctx.stroke();ctx.setLineDash?.([]);
    }
    if(tile.type==='switch')connection(tile.stem,tile.exits[1-tile.switchState],'#384c54',size*.38);
    const p=ports(tile);connection(...p,tile.type==='switch'?'#f4a949':'#8099a9',size*.48);connection(...p,'#233641',size*.34);connection(...p,active?'#65f1df':'#e5e8c9',size*.035,true);
    if(tile.type==='switch'){circle(...center,size*.11,'#ffbf47');text('↔',center[0],center[1],size*.2,'#132a37','center','700');}
    if(active){circle(x+size*.82,y+size*.18,2.5,colors.green);}
  }
  function drawBuilding(tile,x,y,s){
    const e=[[.5,0],[1,.5],[.5,1],[0,.5]][tile.direction];path([[x+s*.5,y+s*.5],[x+s*e[0],y+s*e[1]]],'#8099a9',s*.37);path([[x+s*.5,y+s*.5],[x+s*e[0],y+s*e[1]]],'#233641',s*.25);
    const garden=tile.destination==='garden',garage=tile.type==='source',color=garage?'#6dc6cc':garden?'#d2a0ff':'#ffcf59';
    round(x+s*.15,y+s*.2,s*.7,s*.53,2,'#102b3e',color);round(x+s*.22,y+s*.28,s*.56,s*.17,1,color);
    if(garage){for(let i=0;i<3;i++)path([[x+s*.3,y+s*(.5+i*.06)],[x+s*.7,y+s*(.5+i*.06)]],color,1.4);}
    else if(garden){for(let i=0;i<3;i++){const xx=x+s*(.31+i*.19);path([[xx,y+s*.64],[xx,y+s*.49]],'#88d0a3',1.5);circle(xx,y+s*.5,s*.06,i===1?'#ffd171':color);}}
    else{round(x+s*.28,y+s*.5,s*.44,s*.13,s*.05,'#e5a54b');for(let i=0;i<3;i++)path([[x+s*(.36+i*.13),y+s*.52],[x+s*(.32+i*.13),y+s*.59]],'#ffe5a1',1.3);}
    text(garage?'车库':garden?'花园':'面包店',x+s*.5,y+s*.86,Math.max(9,s*.12),color,'center','700');
  }
  function drawPark(decor,x,y,s){
    // Unbuildable lots and construction cones, rather than another pastel garden UI.
    ctx.strokeStyle='#2e4b5b';ctx.lineWidth=1;for(let k=-1;k<4;k++){ctx.beginPath();ctx.moveTo(x+k*s*.35,y+s);ctx.lineTo(x+(k+1)*s*.35,y);ctx.stroke();}
    const cx=x+s*.5,cy=y+s*.53;ctx.beginPath();ctx.moveTo(cx,cy-s*.23);ctx.lineTo(cx+s*.16,cy+s*.12);ctx.lineTo(cx-s*.16,cy+s*.12);ctx.closePath();ctx.fillStyle=decor%2?'#d98343':'#d6ab55';ctx.fill();
    path([[cx-s*.08,cy],[cx+s*.08,cy]],'#ffe3ae',s*.055);round(cx-s*.23,cy+s*.1,s*.46,s*.07,1,'#133044');
  }
  function drawCar(x,y,size,color,angle=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);round(-size*.46,-size*.3,size*.92,size*.6,4,'#092231');round(-size*.41,-size*.25,size*.58,size*.5,3,color);round(size*.18,-size*.22,size*.24,size*.44,3,color);round(size*.2,-size*.17,size*.14,size*.34,1,'#23485a');
    round(-size*.27,-size*.34,size*.18,size*.1,1,'#081b26');round(-size*.27,size*.24,size*.18,size*.1,1,'#081b26');round(size*.22,-size*.32,size*.12,size*.1,1,'#081b26');round(size*.22,size*.22,size*.12,size*.1,1,'#081b26');path([[-size*.3,-size*.12],[size*.07,-size*.12]],'#fff1be',1.5);ctx.restore();
  }
  function stripe(x,y,w,h){
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle='#ffca51';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#26343c';ctx.lineWidth=8;for(let xx=x-h;xx<x+w+h;xx+=17){ctx.beginPath();ctx.moveTo(xx,y+h);ctx.lineTo(xx+h,y);ctx.stroke();}ctx.restore();
  }
  function blueprint(){
    ctx.fillStyle=colors.paper;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#1a3c50';ctx.lineWidth=1;
    for(let x=0;x<W;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  }
  function drawBoard(){
    const {boardX:bx,boardY:by,boardSize:bw,boardGap:gap}=layout,tileSize=(bw-gap*(level.width-1))/level.width;
    round(bx-4,by-4,bw+8,bw+8,2,'#071f30','#6b8996');
    const route=currentVehicle()?traceRoute(level,state.board,currentVehicle()):null,routeCells=new Set(preview?route?.path:[]);
    state.board.forEach((tile,i)=>{
      const x=bx+(i%level.width)*(tileSize+gap),y=by+Math.floor(i/level.width)*(tileSize+gap);
      const fill=tile.type==='park'?'#183545':tile.type==='switch'?'#5b4830':tile.type==='destination'?'#1d3d52':tile.type==='source'?'#234657':'#2f4e60';
      round(x,y,tileSize,tileSize,2,fill);ctx.save();round(x,y,tileSize,tileSize,2);ctx.clip();
      if(tile.type==='park')drawPark(tile.decor,x,y,tileSize);else if(tile.type==='source'||tile.type==='destination')drawBuilding(tile,x,y,tileSize);else drawRoad(tile,x,y,tileSize,routeCells.has(i));ctx.restore();
      if(hint===i||preview&&route&&!route.ok&&route.at===i){ctx.lineWidth=3;round(x+2,y+2,tileSize-4,tileSize-4,1,null,hint===i?colors.purple:'#ff8b52');ctx.lineWidth=1;}
      if(isEditable(tile)&&!animation&&!isComplete(state,level))hits.push({id:`tile-${i}`,x,y,w:tileSize,h:tileSize,fn:()=>{if(animation||isComplete(state,level))return;state=turnTile(state,i);hint=-1;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';sound(tile.type==='switch'?'switch':'turn');schedule();}});
    });
    if(animation){const route=animation.outcome.result.path,t=Math.min(animation.elapsed/190,route.length-1),a=Math.floor(t),b=Math.min(a+1,route.length-1),f=t-a,from=route[a],to=route[b],col=(from%level.width)*(1-f)+(to%level.width)*f,row=Math.floor(from/level.width)*(1-f)+Math.floor(to/level.width)*f;const delta=to-from||(a>0?from-route[a-1]:1),angle=delta===1?0:delta===-1?Math.PI:delta>0?Math.PI/2:-Math.PI/2;drawCar(bx+col*(tileSize+gap)+tileSize/2,by+row*(tileSize+gap)+tileSize/2,tileSize*.76,animation.vehicle.destination==='bakery'?colors.yellow:colors.purple,angle);}
    else if(!isComplete(state,level)){const index=state.board.findIndex(t=>t.type==='source');drawCar(bx+(index%level.width)*(tileSize+gap)+tileSize/2,by+Math.floor(index/level.width)*(tileSize+gap)+tileSize*.46,tileSize*.5,currentVehicle().destination==='bakery'?colors.yellow:colors.purple);}
  }
  function drawMain(){
    const {margin:m,missionY,myStatus,footerY,footerH,compact}=layout,complete=isComplete(state,level),vehicle=currentVehicle()||level.vehicles.at(-1);
    stripe(12,m,5,42);text('修好这条路',25,m+16,19,colors.ink,'left','700');text(`ROAD CREW  /  工段 ${String(level.id).padStart(2,'0')}`,25,m+36,9,colors.muted);
    button('levels','路网',W-112,m,48,44,()=>{modal='levels';schedule();},{size:13});button('tools','工具',W-56,m,44,44,()=>{modal='tools';schedule();},{size:13});
    if(compact){
      text(complete?'运输完成':`${vehicle.destination==='bakery'?'面包 → 面包店':'鲜花 → 花园'}  ${Math.min(state.nextVehicle+1,level.vehicles.length)}/${level.vehicles.length}`,12,missionY+10,12,colors.ink,'left','700');text(`${state.moves} 次 / 目标 ${level.par}`,W-14,missionY+10,11,colors.yellow,'right');
    }else{
      drawCar(35,missionY+18,35,vehicle.destination==='bakery'?colors.yellow:colors.purple);
      text(complete?'本段运输完成':vehicle.destination==='bakery'?'面包运输 → 面包店':'鲜花运输 → 花园',61,missionY+11,13,colors.ink,'left','700');
      text(`${level.vehicles.length===2?'双车接力':'单车任务'} · ${Math.min(state.nextVehicle+1,level.vehicles.length)}/${level.vehicles.length}`,61,missionY+29,11,colors.muted);
      text(`${state.moves} 次`,W-14,missionY+11,15,colors.yellow,'right','700');text(`目标 ${level.par}`,W-14,missionY+29,10,colors.muted,'right');
    }
    if(layout.boardY-missionY>70){text(`施工图 ${String(level.id).padStart(2,'0')} / ${level.title}`,12,layout.boardY-17,12,colors.muted);}
    drawBoard();
    if(layout.boardY+layout.boardSize+25<myStatus){text('黄色：面包   /   紫色：鲜花   /   橙色：岔口',W/2,layout.boardY+layout.boardSize+22,10,colors.muted,'center');}
    const tip=message||(sidebarState?.enteredFromSidebar?'欢迎从侧边栏回来，继续修路。':level.id>=5?'先送面包，再切换橙色岔口送鲜花。':'点道路旋转，让车库与目的地接通。');
    path([[13,myStatus+3],[13,myStatus+(compact?19:29)]],colors.yellow,3);wrap(tip,24,myStatus+9,W-38,compact?11:12,17,colors.ink,compact?1:2);
    button('undo','撤销',12,footerY,52,footerH,()=>{state=undo(state);hint=-1;message='已撤销上一步。';schedule();},{disabled:!!animation||!state.history.length,size:13});
    button('preview',preview?'收起路线':'看路线',70,footerY,70,footerH,()=>{preview=!preview;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';schedule();},{disabled:!!animation||complete,fill:preview?'#245c60':'#1c4054',color:preview?colors.green:colors.ink,size:12});
    button('dispatch',animation?'运输中…':complete?'查看验收':'发车  →',146,footerY,W-158,footerH,send,{fill:colors.yellow,color:'#102b3c',size:17,disabled:!!animation});
  }
  function modalHeader(title,subtitle,closeId='close'){
    hits=[];blueprint();stripe(12,12,W-24,7);text(title,16,48,24,colors.ink,'left','700');text(subtitle,16,76,11,colors.muted);
    button(closeId,'×',W-60,30,44,44,()=>{modal=null;schedule();},{size:25});
  }
  function drawModal(){
    if(modal==='tools'){
      modalHeader('施工工具箱','所有设置与帮助，都在游戏内。','close-tools');
      const gap=10,bw=(W-34)/2,bh=64,y=106,complete=isComplete(state,level);
      button('hint','定位断点',12,y,bw,bh,()=>{modal=null;showHint();},{disabled:!!animation||complete,color:colors.purple,size:16});
      button('reset','重开本段',22+bw,y,bw,bh,()=>load(level.id),{disabled:!!animation,size:16});
      button('sound',progress.sound?'声音：开':'声音：关',12,y+76,bw,bh,()=>{progress.sound=!progress.sound;platform.audio.setMuted(!progress.sound);save();sound('turn');schedule();},{size:16});
      button('help','施工手册',22+bw,y+76,bw,bh,()=>{modal='help';schedule();},{size:16});
      if(sidebarState?.available)button('sidebar',sidebarState.pending?'侧边栏打开中…':'侧边栏 ↗',12,y+152,W-24,52,openSidebar,{disabled:sidebarState.pending,size:14});
      const noteY=y+(sidebarState?.available?224:170);
      wrap(sidebarState?.enteredFromSidebar?'欢迎从侧边栏回来，进度没有变化。':message.includes('侧边栏')?message:storageOK?'本机自动保存通关与最好成绩。无账号、无广告、无云存档。':'本机存储暂时不可用，仍可继续玩。',16,noteY,W-32,12,20,colors.muted,sidebarState?.available?2:3);
      button('continue','继续修路  →',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='levels'){
      modalHeader('施工路网','10 个工段全部开放 · 05 起为双车接力');
      const gap=7,bw=(W-24-gap*4)/5,y=H<500?104:120,stride=H<500?82:94,bh=H<500?58:66;
      LEVELS.forEach((l,i)=>{const x=12+(i%5)*(bw+gap),yy=y+Math.floor(i/5)*stride;button(`level-${l.id}`,String(l.id).padStart(2,'0'),x,yy,bw,bh,()=>load(l.id),{fill:level.id===l.id?colors.yellow:'#1c4054',color:level.id===l.id?'#102b3c':colors.ink,size:21});const best=progress.bestMoves[l.id];text(best===undefined?(l.id>=5?'双车':'单车'):'★'.repeat(starsFor(best,l.par)),x+bw/2,yy+bh+13,10,best===undefined?colors.muted:colors.yellow,'center');});
      text(`已验收 ${progress.completed.length} / 10 个工段`,16,y+2*stride+22,16,colors.green,'left','700');wrap('换关会重开当前施工段，已通关记录和最好成绩会保留。',16,y+2*stride+50,W-32,12,20,colors.muted,2);
      button('back-map','回到施工现场',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='help'){
      modalHeader('施工手册','接通道路，再安排车辆出发。','close-manual');
      const items=[['01  转动道路','点击道路转90°。建筑和锥桶不能动。'],['02  看路线，再发车','黄色车送面包，紫色车送鲜花。走错路没有惩罚。'],['03  双车要换岔口','05关起先送面包，再点橙色路口切换方向，最后送鲜花。']];
      items.forEach(([title,body],i)=>{const y=116+i*86;path([[16,y-10],[16,y+51]],i===2?colors.yellow:colors.green,3);text(title,28,y,16,colors.ink,'left','700');wrap(body,28,y+25,W-45,12,19,colors.muted,2);});
      button('close-help','明白了，开工！',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='win'){
      modalHeader('工段验收通过',progress.completed.length===LEVELS.length?'整座路网已经恢复畅通。':`施工段 ${String(level.id).padStart(2,'0')} · ${level.title}`,'close-win');
      const cy=Math.max(120,Math.min(H*.4,H-292,240));
      stripe(30,cy-40,W-60,10);text('★'.repeat(starsFor(state.moves,level.par)),W/2,cy+12,45,colors.yellow,'center','700');text('运输任务完成',W/2,cy+64,24,colors.ink,'center','700');text(`${state.moves} 次转动  /  ${level.vehicles.length} 辆车送达`,W/2,cy+102,14,colors.green,'center');text(`三星目标：${level.par} 次以内`,W/2,cy+128,12,colors.muted,'center');
      button('next',level.id===10?'查看完整路网  →':'进入下一工段  →',12,H-132,W-24,52,()=>{if(level.id===10){modal='levels';schedule();}else load(level.id+1);},{fill:colors.yellow,color:'#102b3c',size:16});
      button('replay','重新挑战本段',12,H-68,W-24,52,()=>load(level.id),{size:15});
    }
  }
  function drawFrame(time){
    frameId=null;if(destroyed||paused)return;
    if(animation){if(previousTime!==null)animation.elapsed+=Math.min(100,Math.max(0,time-previousTime));previousTime=time;if(animation.elapsed>=animation.duration)finishDelivery();}
    const size=platform.getSize(),{width,height,dpr}=size,raw=size.safeInsets||{};
    const inset=(value,max)=>Math.max(0,Math.min(Number(value)||0,max));
    const safe={top:inset(raw.top,height/3),right:inset(raw.right,width/4),bottom:inset(raw.bottom,height/3),left:inset(raw.left,width/4)};
    W=Math.min(480,width-safe.left-safe.right);H=Math.min(920,height-safe.top-safe.bottom);
    transform={scale:1,x:safe.left+(width-safe.left-safe.right-W)/2,y:safe.top+(height-safe.top-safe.bottom-H)/2};
    const compact=H<490,margin=H<540?4:8,missionY=margin+48,missionH=compact?20:H<650?36:44,boardTop=missionY+missionH+(compact?4:8),footerH=compact?44:52,footerY=H-margin-footerH,myStatus=footerY-(compact?2:4)-(compact?24:H<650?32:40),boardAvailable=myStatus-boardTop-(compact?4:6),boardGap=W<274?0:2,minMapWidth=level.width*44+boardGap*(level.width-1),mapPad=Math.max(0,Math.min(12,(W-minMapWidth)/2)),boardSize=Math.min(W-2*mapPad,boardAvailable);
    layout={boardGap,compact,margin,missionY,myStatus,footerY,footerH,boardX:(W-boardSize)/2,boardY:boardTop+(boardAvailable-boardSize)/2,boardSize,width:W,height:H,safeInsets:safe};
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#091e2e';ctx.fillRect(0,0,width,height);ctx.translate(transform.x,transform.y);hits=[];blueprint();drawMain();if(modal)drawModal();if(animation)schedule();
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
  }),platform.onResize(()=>{gesture=null;hits=[];schedule();}),platform.onPause(()=>{paused=true;gesture=null;previousTime=null;if(frameId!==null){platform.cancelFrame(frameId);frameId=null;}}),platform.onResume(()=>{paused=false;previousTime=null;schedule();})];
  if(typeof platform.sidebar?.subscribe==='function')unsubscribers.push(platform.sidebar.subscribe(value=>{sidebarState=value;schedule();}));
  schedule();
  return {destroy(){destroyed=true;animation=null;if(frameId!==null)platform.cancelFrame(frameId);unsubscribers.forEach(fn=>{if(typeof fn==='function')fn();});},getSnapshot(){return {levelId:level.id,moves:state.moves,nextVehicle:state.nextVehicle,complete:isComplete(state,level),busy:!!animation,modal,preview,message,storageOK,sidebar:sidebarState?{...sidebarState}:null,board:state.board.map(t=>({...t,...(t.exits?{exits:[...t.exits]}:{})})),hitTargets:hits.map(({id,x,y,w,h})=>({id,x,y,w,h})),transform:{...transform},layout:{...layout,safeInsets:{...layout.safeInsets}},design:'road-crew-phone-v3'};}};
}
