import { LEVELS, CHAPTERS } from './levels.js';
import { createState, traceRoute, turnTile, dispatch, undo, ports, isEditable, isComplete, starsFor, normalizeProgress, movePanel, reviveState, useWorkTool, awardVictory, reserveRunPurchase, refundPendingPurchase, pendingPurchaseAmount } from './rules.js';

// This module is platform-independent: no window, document, CSS, network or SDK globals.
export function startGame(platform) {
  const ctx = platform.canvas.getContext('2d');
  let W=400,H=800,layout={};
  const KEY='fix-the-road-v1';
  const colors={paper:'#202932',ink:'#edf4ed',muted:'#9db7c4',purple:'#d3a1ff',green:'#67e5cb',yellow:'#ffca51'};
  const fontStack='"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
  let saved,lastStoredRaw,storageOK=true,storageConflict=false,storageUncertain=false;
  try { lastStoredRaw=platform.storage.getItem(KEY);saved=JSON.parse(lastStoredRaw); } catch { saved=null;storageOK=false; }
  let progress=normalizeProgress(saved,LEVELS.map(l=>l.id));
  const startupRefund=pendingPurchaseAmount(progress);
  if(startupRefund){progress=refundPendingPurchase(progress);persist(progress);} // One atomic reconciliation, not a new reward.
  let level=LEVELS.find(l=>l.id===progress.lastLevel)||LEVELS[0], state=createState(level);
  let preview=false, modal=null, message=startupRefund?(storageOK?`上一局未完成，已退回${startupRefund}金币。`:`上局${startupRefund}金币已恢复，退款待保存。`):'', hint=-1, hits=[], animation=null, frameId=null, previousTime=null, paused=false, destroyed=false;
  let transform={scale:1,x:0,y:0}, gesture=null;
  let crane=false,selectedPanel=-1,mapPage=Math.floor((level.id-1)/10),runId=1,adPending=false,lastRewardId=null,winAward=0;
  let purchaseToken=`run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
  const rewardService=platform.rewards;
  function failIfNeeded(){if(state.failed){modal='failed';crane=false;selectedPanel=-1;}schedule();}
  function cancelReward(){runId++;adPending=false;rewardService?.cancel?.();}
  async function requestRevive(){
    if(!state.failed||state.revived||adPending)return;
    if(!rewardService?.getState?.().available){message='广告功能仅预留，当前不可用。可以免费重开。';schedule();return;}
    const expectedRun=runId;adPending=true;gesture=null;modal=rewardService.getState().mode==='mock'?'mock-ad':'ad-wait';schedule();
    let result;try{result=await rewardService.request({placement:'revive',context:{runId:expectedRun,levelId:level.id}});}catch{result={status:'error'};}
    if(destroyed||expectedRun!==runId)return;adPending=false;
    if(result.status==='completed'&&result.requestId&&result.requestId!==lastRewardId&&state.failed&&!state.revived){lastRewardId=result.requestId;state=reviveState(state);modal=null;message='施工支援到位：+10工时，故障容错恢复。本局只可复活一次。';}
    else{modal='failed';message=result.status==='cancelled'?'未完成观看，没有发放奖励。':result.status==='unavailable'?'暂无可用广告，没有发放奖励。':'广告异常，没有发放奖励。';}
    previousTime=null;schedule();
  }
  function payFor(kind){
    const paid=reserveRunPurchase(progress,purchaseToken,level.id,kind);
    if(!paid){message='金币不足；仍可免费重开。';schedule();return false;}
    // Never grant the temporary benefit unless its debit + receipt are durable.
    if(!persist(paid)){message=storageConflict?'存档在其他页面更新，请刷新；本次未扣金币。':storageUncertain?'保存结果未确认，未给道具；重开页面核对退款。':'无法保存，本次未扣金币；仍可免费重开。';schedule();return false;}
    progress=paid;return true;
  }
  function coinRevive(){if(!state.failed||state.revived||adPending)return;if(!payFor('revive'))return;state=reviveState(state);modal=null;message='预留20金币复工：+10工时；未通关重开/退出退回。';schedule();}
  function buyWork(){if(state.failed||state.toolUsed||state.budget===null||isComplete(state,level)||animation||adPending)return;if(!payFor('workTool'))return;state=useWorkTool(state);message='预留12金币：+6工时；未通关重开/退出退回。';schedule();}
  let sidebarState=platform.sidebar?.getState?.()||null;
  platform.audio.setMuted(!progress.sound);
  const currentVehicle=()=>level.vehicles[state.nextVehicle];
  function persist(value){
    const raw=JSON.stringify(value);let attempted=false;
    try{
      const current=platform.storage.getItem(KEY);
      // An older tab must not overwrite a newer refund or settlement.
      if(current!==(lastStoredRaw===undefined?null:lastStoredRaw)){storageOK=false;storageConflict=true;storageUncertain=false;return false;}
      attempted=true;platform.storage.setItem(KEY,raw);
      if(platform.storage.getItem(KEY)!==raw){storageOK=false;storageUncertain=true;return false;}
      lastStoredRaw=raw;storageOK=true;storageConflict=false;storageUncertain=false;return true;
    }catch{
      // A write-then-throw host is committed only after exact receipt readback.
      try{const observed=platform.storage.getItem(KEY);if(observed===raw){lastStoredRaw=raw;storageOK=true;storageConflict=false;storageUncertain=false;return true;}storageUncertain=attempted&&observed!==lastStoredRaw;}catch{storageUncertain=attempted;}
      storageOK=false;return false;
    }
  }
  function save(){return persist(progress);}
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
    if(gesture&&gesture.targetId===id&&!disabled)round(x+2,y+2,w-4,h-4,3,'rgba(255,255,255,0.16)');
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
  function load(id){const refund=pendingPurchaseAmount(progress);progress=refundPendingPurchase(progress);cancelReward();purchaseToken=`run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}_${runId}`;crane=false;selectedPanel=-1;winAward=0;level=LEVELS.find(l=>l.id===id)||LEVELS[0];state=createState(level);animation=null;previousTime=null;preview=false;modal=null;message=refund?`未完成局已退回${refund}金币。`:'';hint=-1;mapPage=Math.floor((level.id-1)/10);progress.lastLevel=level.id;save();schedule();}
  function routeMessage(result){
    if(result.ok)return '路线接通了！这辆车可以放心出发。';
    if(result.reason==='wrong_destination')return '送错目的地啦！点橙色岔口换个方向。';
    if(result.reason==='switch_closed')return '在岔口停住了。点橙色路口切换方向。';
    if(result.reason==='out_of_bounds')return '小车要开出小镇啦。把道路转回镇里。';
    if(result.reason==='loop')return '小车在绕圈。转动道路，接向目的地。';
    return '这段路还没接上。转动道路，让两端对齐。';
  }
  function send(){
    if(animation||state.failed||adPending)return;
    if(isComplete(state,level)){modal='win';schedule();return;}
    const outcome=dispatch(state,level);
    animation={outcome,vehicle:currentVehicle(),elapsed:0,duration:Math.max(400,(outcome.result.path.length-1)*190+(outcome.result.ok?420:1150))};
    previousTime=null;preview=true;hint=-1;message='小车出发了！';sound('send');schedule();
  }
  function finishDelivery(){
    const {outcome}=animation;animation=null;previousTime=null;
    if(outcome.result.ok){state=outcome.state;preview=false;sound('win');
      if(isComplete(state,level)){winAward=progress.completed.includes(level.id)?0:20;progress=awardVictory(progress,level,state.moves);save();modal='win';message='运输已验收，道路恢复通行。';}
      else message=level.chapter===5?'首车交付。吊起旧支路的螺栓路板，补上鲜花支路空槽。':'首车交付。保留共用道路，切换橙色岔口再发鲜花车。';
    }else{state=outcome.state;message=routeMessage(outcome.result);sound('error');failIfNeeded();}
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
    ctx.fillStyle='#00000026';for(let k=0;k<18;k++){const xx=((k*17+tile.rotation*13)%97)/97,yy=((k*31+11)%89)/89;ctx.fillRect(x+xx*size,y+yy*size,1.2,1.2);}
    const p=ports(tile);connection(...p,tile.type==='switch'?'#f4a949':'#8099a9',size*.48);connection(...p,'#242b30',size*.34);connection(...p,active?'#65f1df':'#e5e8c9',size*.035,true);
    if(tile.type==='switch'){circle(...center,size*.11,'#ffbf47');path([[center[0]-size*.06,center[1]],[center[0]+size*.06,center[1]]],'#26323a',2);}
    if(tile.movable){for(const [u,v] of [[.12,.12],[.88,.12],[.12,.88],[.88,.88]]){circle(x+size*u,y+size*v,size*.035,'#c8d0cf');circle(x+size*u,y+size*v,size*.013,'#26323a');}text('吊',x+size*.81,y+size*.2,9,'#ffce6c','center','700');}
    if(active){circle(x+size*.82,y+size*.18,2.5,colors.green);}
  }
  function drawBuilding(tile,x,y,s){
    const e=[[.5,0],[1,.5],[.5,1],[0,.5]][tile.direction];path([[x+s*.5,y+s*.5],[x+s*e[0],y+s*e[1]]],'#8099a9',s*.37);path([[x+s*.5,y+s*.5],[x+s*e[0],y+s*e[1]]],'#233641',s*.25);
    const garden=tile.destination==='garden',garage=tile.type==='source',color=garage?'#6dc6cc':garden?'#d2a0ff':'#ffcf59';
    round(x+s*.17,y+s*.23,s*.72,s*.55,1,'#152129');round(x+s*.12,y+s*.19,s*.72,s*.53,1,'#59656a',color);ctx.fillStyle='#889294';ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.19);ctx.lineTo(x+s*.23,y+s*.1);ctx.lineTo(x+s*.93,y+s*.1);ctx.lineTo(x+s*.84,y+s*.19);ctx.closePath();ctx.fill();round(x+s*.2,y+s*.27,s*.56,s*.16,1,'#24343e');path([[x+s*.23,y+s*.3],[x+s*.73,y+s*.3]],color,2);
    if(garage){for(let i=0;i<3;i++)path([[x+s*.3,y+s*(.5+i*.06)],[x+s*.7,y+s*(.5+i*.06)]],color,1.4);}
    else if(garden){for(let i=0;i<3;i++){const xx=x+s*(.31+i*.19);path([[xx,y+s*.64],[xx,y+s*.49]],'#88d0a3',1.5);circle(xx,y+s*.5,s*.06,i===1?'#ffd171':color);}}
    else{round(x+s*.28,y+s*.5,s*.44,s*.13,s*.05,'#e5a54b');for(let i=0;i<3;i++)path([[x+s*(.36+i*.13),y+s*.52],[x+s*(.32+i*.13),y+s*.59]],'#ffe5a1',1.3);}
    text(garage?'调度站':garden?'花园':'面包店',x+s*.5,y+s*.86,Math.max(9,s*.12),color,'center','700');
  }
  function drawPark(decor,x,y,s){
    ctx.fillStyle='#293331';ctx.fillRect(x,y,s,s);
    if(decor%3===0){
      round(x+s*.1,y+s*.24,s*.8,s*.62,1,'#141e22');round(x+s*.12,y+s*.15,s*.72,s*.62,1,'#626a67');
      ctx.fillStyle='#8d9490';ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.15);ctx.lineTo(x+s*.22,y+s*.07);ctx.lineTo(x+s*.91,y+s*.07);ctx.lineTo(x+s*.84,y+s*.15);ctx.closePath();ctx.fill();
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){ctx.fillStyle=(r+c+decor)%3?'#26343c':'#e8ba67';ctx.fillRect(x+s*(.23+c*.18),y+s*(.28+r*.15),s*.09,s*.06);}
    }else if(decor%3===1){
      for(let k=0;k<3;k++){round(x+s*.14,y+s*(.2+k*.2),s*.72,s*.13,1,'#8b8980');path([[x+s*.28,y+s*(.2+k*.2)],[x+s*.28,y+s*(.33+k*.2)]],'#515653',1.4);}
      circle(x+s*.78,y+s*.78,s*.12,'#1b262b');circle(x+s*.78,y+s*.78,s*.065,'#707a7a');
    }else{
      const cx=x+s*.5,cy=y+s*.53;ctx.beginPath();ctx.moveTo(cx,cy-s*.27);ctx.lineTo(cx+s*.17,cy+s*.13);ctx.lineTo(cx-s*.17,cy+s*.13);ctx.closePath();ctx.fillStyle='#df8b3d';ctx.fill();path([[cx-s*.09,cy],[cx+s*.09,cy]],'#eee6d1',s*.06);round(cx-s*.24,cy+s*.12,s*.48,s*.08,1,'#182229');
      for(let k=0;k<4;k++)circle(x+s*(.15+(k%2)*.64),y+s*(.13+Math.floor(k/2)*.67),s*.025,'#68716b');
    }
  }
  function drawSocket(x,y,s){
    round(x+3,y+3,s-6,s-6,2,'#151d22','#9d8560');ctx.setLineDash?.([4,4]);path([[x+7,y+7],[x+s-7,y+7],[x+s-7,y+s-7],[x+7,y+s-7],[x+7,y+7]],'#b19158',1,true);ctx.setLineDash?.([]);
    text('空槽',x+s/2,y+s/2,Math.max(10,s*.17),'#c8ae7b','center','700');
  }
  function incidentFX(x,y,s,elapsed){
    const t=Math.min(1,Math.max(0,elapsed/900));
    ctx.save();ctx.globalAlpha=1-t*.55;
    for(let k=0;k<9;k++){const a=k*2.4,r=s*(.12+t*.7)*(1+(k%3)*.15);circle(x+Math.cos(a)*r,y+Math.sin(a)*r*.6,s*(.055+t*.07),k%2?'#b6b0a2':'#6f7776');}
    path([[x-s*.4,y+s*.24],[x-s*.8,y+s*.35]],'#0b1013',3);path([[x-s*.4,y-s*.24],[x-s*.8,y-s*.13]],'#0b1013',3);
    ctx.restore();circle(x+s*.25,y-s*.38,s*.13,'#ef704b');text('!',x+s*.25,y-s*.38,s*.2,'#fff0d9','center','700');
  }
  function drawCar(x,y,size,color,angle=0){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);round(-size*.46,-size*.3,size*.92,size*.6,4,'#092231');round(-size*.41,-size*.25,size*.58,size*.5,3,color);round(size*.18,-size*.22,size*.24,size*.44,3,color);round(size*.2,-size*.17,size*.14,size*.34,1,'#23485a');
    round(-size*.27,-size*.34,size*.18,size*.1,1,'#081b26');round(-size*.27,size*.24,size*.18,size*.1,1,'#081b26');round(size*.22,-size*.32,size*.12,size*.1,1,'#081b26');round(size*.22,size*.22,size*.12,size*.1,1,'#081b26');path([[-size*.3,-size*.12],[size*.07,-size*.12]],'#fff1be',1.5);for(let i=0;i<4;i++)path([[-size*.32+i*size*.11,-size*.22],[-size*.32+i*size*.11,size*.22]],'#00000025',1);round(size*.39,-size*.18,size*.05,size*.1,1,'#fff0b0');round(size*.39,size*.08,size*.05,size*.1,1,'#fff0b0');round(-size*.44,-size*.18,size*.035,size*.1,1,'#e76c43');ctx.restore();
  }
  function stripe(x,y,w,h){
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle='#ffca51';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#26343c';ctx.lineWidth=8;for(let xx=x-h;xx<x+w+h;xx+=17){ctx.beginPath();ctx.moveTo(xx,y+h);ctx.lineTo(xx+h,y);ctx.stroke();}ctx.restore();
  }
  function blueprint(width=W,height=H){
    ctx.fillStyle=colors.paper;ctx.fillRect(0,0,width,height);ctx.strokeStyle='#2a3640';ctx.lineWidth=1;
    for(let x=0;x<width;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
    for(let y=0;y<height;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  }
  function drawSkyline(y,h){
    // A layered working city, not a decorative web card. This fits only in spare
    // vertical space so the minimum phone still prioritizes the actual map.
    if(h<42)return;
    const base=y+h;ctx.save();ctx.beginPath();ctx.rect(0,y,W,h);ctx.clip();
    for(let i=0;i<Math.ceil(W/41)+1;i++){
      const x=i*41-12,hh=Math.min(h-6,24+((i*17+level.id*3)%39)+(h>100?(i%3)*h*.16:0));ctx.fillStyle=i%2?'#303f45':'#34464c';ctx.fillRect(x,base-hh,34,hh);
      ctx.fillStyle='#56656a';ctx.fillRect(x+2,base-hh,30,2);
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){ctx.fillStyle=(r+c+i)%4?'#1d2e38':'#b9985f';ctx.fillRect(x+6+c*8,base-hh+8+r*11,3,4);}
    }
    const cx=W*.73;path([[cx,base],[cx,base-h+7],[cx-49,base-h+7],[cx+53,base-h+7]],'#c49b5b',2);
    path([[cx-40,base-h+7],[cx,base-h+22],[cx+46,base-h+7]],'#a1804e',1);path([[cx+34,base-h+7],[cx+34,base-8]],'#a8b8bc',1);round(cx+28,base-8,12,6,1,'#d7b66c');
    path([[0,base-1],[W,base-1]],'#849190',1);ctx.restore();
  }
  function drawBoard(){
    const {boardX:bx,boardY:by,boardSize:bw,boardGap:gap}=layout,tileSize=(bw-gap*(level.width-1))/level.width;
    round(bx-6,by+1,bw+12,bw+12,3,'#0a141b');round(bx-4,by-4,bw+8,bw+8,2,'#19272e','#839294');for(const [u,v] of [[0,0],[1,0],[0,1],[1,1]]){circle(bx-2+u*(bw+4),by-2+v*(bw+4),2,'#a0aaa4');}
    const route=currentVehicle()?traceRoute(level,state.board,currentVehicle()):null,routeCells=new Set(preview?route?.path:[]);
    state.board.forEach((tile,i)=>{
      const x=bx+(i%level.width)*(tileSize+gap),y=by+Math.floor(i/level.width)*(tileSize+gap);
      const fill=tile.type==='park'?'#283332':tile.type==='switch'?'#63503a':tile.type==='destination'?'#334348':tile.type==='source'?'#33454b':'#424c50';
      round(x,y,tileSize,tileSize,2,fill);ctx.save();round(x,y,tileSize,tileSize,2);ctx.clip();
      if(tile.type==='socket')drawSocket(x,y,tileSize);else if(tile.type==='park')drawPark(tile.decor,x,y,tileSize);else if(tile.type==='source'||tile.type==='destination')drawBuilding(tile,x,y,tileSize);else drawRoad(tile,x,y,tileSize,routeCells.has(i));ctx.restore();
      if(hint===i||preview&&route&&!route.ok&&route.at===i){ctx.lineWidth=3;round(x+2,y+2,tileSize-4,tileSize-4,1,null,hint===i?colors.purple:'#ff8b52');ctx.lineWidth=1;}
      if(selectedPanel===i){ctx.lineWidth=3;round(x+2,y+2,tileSize-4,tileSize-4,1,null,colors.yellow);ctx.lineWidth=1;}
      if((isEditable(tile)||(crane&&tile.type==='socket'))&&!animation&&!state.failed&&!isComplete(state,level))hits.push({id:`tile-${i}`,x,y,w:tileSize,h:tileSize,fn:()=>{
        if(animation||state.failed||adPending||isComplete(state,level))return;
        if(crane){
          if(tile.movable){selectedPanel=selectedPanel===i?-1:i;message=selectedPanel<0?'已放下路板。':'路板已选中，点击空槽完成吊装（1工时）。';}
          else if(tile.type==='socket'&&selectedPanel>=0){state=movePanel(state,selectedPanel,i);selectedPanel=-1;message='路板已吊入空槽，可继续旋转接通道路。';sound('switch');failIfNeeded();}
          else message='只可吊装带螺栓的路板；先点路板，再点空槽。';
        }else{state=turnTile(state,i);hint=-1;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';sound(tile.type==='switch'?'switch':'turn');failIfNeeded();}schedule();
      }});
    });
    if(animation){const route=animation.outcome.result.path,t=Math.min(animation.elapsed/190,route.length-1),a=Math.floor(t),b=Math.min(a+1,route.length-1),f=t-a,from=route[a],to=route[b],col=(from%level.width)*(1-f)+(to%level.width)*f,row=Math.floor(from/level.width)*(1-f)+Math.floor(to/level.width)*f;const delta=to-from||(a>0?from-route[a-1]:1),angle=delta===1?0:delta===-1?Math.PI:delta>0?Math.PI/2:-Math.PI/2;drawCar(bx+col*(tileSize+gap)+tileSize/2,by+row*(tileSize+gap)+tileSize/2,tileSize*.76,animation.vehicle.destination==='bakery'?colors.yellow:colors.purple,angle);if(!animation.outcome.result.ok&&animation.elapsed>Math.max(0,(route.length-1)*190)){incidentFX(bx+col*(tileSize+gap)+tileSize/2,by+row*(tileSize+gap)+tileSize/2,tileSize,animation.elapsed-(route.length-1)*190);round(bx+8,by+8,bw-16,28,2,'#a5472c');text('紧急制动 · 前方道路未接通',bx+bw/2,by+22,12,'#fff0d7','center','700');}}
    else if(!isComplete(state,level)){const index=state.board.findIndex(t=>t.type==='source');drawCar(bx+(index%level.width)*(tileSize+gap)+tileSize/2,by+Math.floor(index/level.width)*(tileSize+gap)+tileSize*.46,tileSize*.5,currentVehicle().destination==='bakery'?colors.yellow:colors.purple);}
  }
  function drawMain(){
    const {margin:m,missionY,myStatus,footerY,footerH,compact}=layout,complete=isComplete(state,level),vehicle=currentVehicle()||level.vehicles.at(-1);
    stripe(12,m,5,42);text('修好这条路',25,m+16,19,colors.ink,'left','700');text(`CITY RECONNECT  /  ${String(level.id).padStart(2,'0')}  /  金币 ${progress.coins}`,25,m+36,9,colors.muted);
    button('levels','路网',W-112,m,48,44,()=>{modal='levels';schedule();},{size:13});button('tools','工具',W-56,m,44,44,()=>{modal='tools';schedule();},{size:13});
    if(compact){
      text(complete?'运输完成':`${vehicle.destination==='bakery'?'面包 → 面包店':'鲜花 → 花园'}  ${Math.min(state.nextVehicle+1,level.vehicles.length)}/${level.vehicles.length}`,12,missionY+10,12,colors.ink,'left','700');text(state.budget===null?`${state.moves} 次 / 目标 ${level.par}`:`工时 ${Math.max(0,state.budget-state.workSpent)} / 容错 ${state.incidentLimit-state.incidents}`,W-14,missionY+10,11,colors.yellow,'right');
    }else{
      drawCar(35,missionY+18,35,vehicle.destination==='bakery'?colors.yellow:colors.purple);
      text(complete?'本段运输完成':vehicle.destination==='bakery'?'面包运输 → 面包店':'鲜花运输 → 花园',61,missionY+11,13,colors.ink,'left','700');
      text(`${level.vehicles.length===2?'双车接力':'单车任务'} · ${Math.min(state.nextVehicle+1,level.vehicles.length)}/${level.vehicles.length}`,61,missionY+29,11,colors.muted);
      text(state.budget===null?`${state.moves} 次`:`余 ${Math.max(0,state.budget-state.workSpent)} 工时`,W-14,missionY+11,14,colors.yellow,'right','700');text(state.incidentLimit===null?`目标 ${level.par}`:`容错 ${state.incidentLimit-state.incidents}`,W-14,missionY+29,10,colors.muted,'right');
    }
    drawSkyline(missionY+47,layout.boardY-missionY-73);
    if(layout.boardY-missionY>70){text(`施工图 ${String(level.id).padStart(2,'0')} / ${level.title}`,12,layout.boardY-17,12,colors.muted);}
    drawBoard();
    if(layout.boardY+layout.boardSize+25<myStatus){text('黄色：面包   /   紫色：鲜花   /   橙色：岔口',W/2,layout.boardY+layout.boardSize+22,10,colors.muted,'center');}
    // A continuous city/depot fills tall-phone space below the square puzzle;
    // it is scenery, never an extra hit region or a stretched road tile.
    const depotTop=layout.boardY+layout.boardSize+42,depotHeight=myStatus-depotTop-12;
    if(depotHeight>=48){
      drawSkyline(depotTop,Math.max(42,depotHeight-28));
      const roadY=depotTop+depotHeight-20;
      path([[0,roadY],[W,roadY]],'#17242b',28);
      path([[0,roadY],[W,roadY]],'#77928e',1,true);
      drawCar(W*.22,roadY,26,colors.yellow);
      drawCar(W*.67,roadY,26,colors.purple,Math.PI);
    }
    const tip=message||(level.id>10?level.note:sidebarState?.enteredFromSidebar?'欢迎从侧边栏回来，继续修路。':level.id>=5?'先送面包，再切换橙色岔口送鲜花。':'点道路旋转，让车库与目的地接通。');
    path([[13,myStatus+3],[13,myStatus+(compact?19:29)]],colors.yellow,3);wrap(tip,24,myStatus+9,W-38,compact?11:12,17,colors.ink,compact?1:2);
    const locked=!!animation||!!state.failed||adPending;
    button('undo','撤销',12,footerY,48,footerH,()=>{state=undo(state);selectedPanel=-1;hint=-1;message=state.budget===null?'已撤销上一步。':'已撤销，但施工工时不退还。';schedule();},{disabled:locked||!state.history.length,size:12});
    button('preview',preview?'收线':'预览',66,footerY,48,footerH,()=>{preview=!preview;message=preview?routeMessage(traceRoute(level,state.board,currentVehicle())):'';schedule();},{disabled:locked||complete,fill:preview?'#245c60':'#1c4054',size:12});
    if(level.id>=31){button('crane',crane?'旋转':'吊装',120,footerY,48,footerH,()=>{crane=!crane;selectedPanel=-1;message=crane?'吊装：先点螺栓路板，再点空槽。':'旋转模式：点击道路顺时针旋转。';schedule();},{disabled:locked||complete,fill:crane?colors.yellow:'#1c4054',color:crane?'#102b3c':colors.ink,size:12});}
    const dx=level.id>=31?174:120;
    button('dispatch',animation?'制动/运输':complete?'验收':'发车',dx,footerY,W-dx-12,footerH,send,{fill:colors.yellow,color:'#102b3c',size:17,disabled:locked});
  }
  function modalHeader(title,subtitle,closeId='close'){
    hits=[];blueprint();stripe(12,12,W-24,7);text(title,16,48,24,colors.ink,'left','700');wrap(subtitle,16,76,W-32,11,16,colors.muted,1);
    button(closeId,'×',W-60,30,44,44,()=>{modal=null;schedule();},{size:25});
  }
  function drawModal(){
    if(modal==='tools'){
      modalHeader('施工工具箱',message&&/未扣|未确认|侧边栏|不足/.test(message)?message:'费用预留，未通关退出自动退回。','close-tools');
      const gap=10,bw=(W-34)/2,bh=54,y=100,complete=isComplete(state,level);
      button('hint','定位断点',12,y,bw,bh,()=>{modal=null;showHint();},{disabled:!!animation||complete,color:colors.purple,size:16});
      button('reset','重开本段',22+bw,y,bw,bh,()=>load(level.id),{disabled:!!animation,size:16});
      button('sound',progress.sound?'声音：开':'声音：关',12,y+64,bw,bh,()=>{progress.sound=!progress.sound;platform.audio.setMuted(!progress.sound);save();sound('turn');schedule();},{size:16});
      button('help','施工手册',22+bw,y+64,bw,bh,()=>{modal='help';schedule();},{size:16});
      if(sidebarState?.available)button('sidebar',sidebarState.pending?'侧边栏打开中…':'侧边栏 ↗',12,y+192,W-24,52,openSidebar,{disabled:sidebarState.pending,size:14});
      button('work-tool',state.toolUsed?'加班券已用':'+6工时 · 预留12币',12,y+128,W-24,52,buyWork,{disabled:!!animation||state.budget===null||state.toolUsed||!!state.failed||complete,size:14});
      const noteY=y+(sidebarState?.available?252:192);
      if(!sidebarState?.available||H>510)wrap(sidebarState?.enteredFromSidebar?'欢迎从侧边栏回来，进度没有变化。':message?message:storageOK?`金币 ${progress.coins} · 未通关退出退回预留费。`:'本机存储暂时不可用，仍可继续玩。',16,noteY,W-32,12,20,colors.muted,sidebarState?.available?2:3);
      button('continue','继续修路  →',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='levels'){
      modalHeader('城市复线',`50 个工段 · ${CHAPTERS[mapPage]} · 已完成 ${progress.completed.length}/50`);
      const tabW=(W-40)/5;
      for(let c=0;c<5;c++)button(`chapter-${c}`,`${c*10+1}–${c*10+10}`,12+c*(tabW+4),96,tabW,44,()=>{mapPage=c;schedule();},{fill:mapPage===c?colors.yellow:'#1c4054',color:mapPage===c?'#172a35':colors.ink,size:11});
      const gap=7,bw=(W-24-gap*4)/5,y=158,stride=78,bh=54;
      LEVELS.slice(mapPage*10,mapPage*10+10).forEach((l,i)=>{const x=12+(i%5)*(bw+gap),yy=y+Math.floor(i/5)*stride;button(`level-${l.id}`,String(l.id).padStart(2,'0'),x,yy,bw,bh,()=>load(l.id),{fill:level.id===l.id?colors.yellow:'#1c4054',color:level.id===l.id?'#102b3c':colors.ink,size:21});const best=progress.bestMoves[l.id];text(best===undefined?(l.id<=10?'练习':l.transfers?.length?'吊装':'工时'):'★'.repeat(starsFor(best,l.par)),x+bw/2,yy+bh+13,10,best===undefined?colors.muted:colors.yellow,'center');});
      if(H>480)wrap(['1–5 入门，6–10 正常体验。','11关起工时耗尽或故障容错用完会停工。','双车共用道路；预览免费，先规划再发车。','螺栓路板可以吊到空槽，搬运消耗1工时。','先完成第一车，再回收旧路补第二条支路。'][mapPage],16,336,W-32,12,20,colors.muted,2);
      button('back-map','回到施工现场',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='help'){
      modalHeader('施工手册','接通道路，再安排车辆出发。','close-manual');
      const items=[['01  转动道路','点击道路转90°。建筑和锥桶不能动。'],['02  工时有限，预览免费','11关起误操作会耗工时，错误发车损失容错；撤销不退工时。'],['03  路板要循环使用','31关起吊装螺栓路板到空槽；41关起先送首车再回收旧路。']];
      items.forEach(([title,body],i)=>{const y=116+i*86;path([[16,y-10],[16,y+51]],i===2?colors.yellow:colors.green,3);text(title,28,y,16,colors.ink,'left','700');wrap(body,28,y+25,W-45,12,19,colors.muted,2);});
      button('close-help','明白了，开工！',12,H-68,W-24,52,()=>{modal=null;schedule();},{fill:colors.yellow,color:'#102b3c',size:16});
    }else if(modal==='failed'){
      modalHeader('施工暂停',state.failed==='incidents'?'运输事故次数已达到本段容错上限。':'施工工时已耗尽，当前布置不能继续施工。','close-failed');
      const close=hits.find(h=>h.id==='close-failed');if(close)close.fn=()=>{modal='levels';schedule();};
      // Failure is a reversible local run state. Restart never costs currency.
      const y=H<500?98:118;stripe(16,y,W-32,10);text(state.failed==='incidents'?'紧急制动 · 道路封控':'工时耗尽 · 重新规划',W/2,y+38,21,'#f59e71','center','700');
      wrap(message||'本段初始状态可解。免费重开可重新规划，不需要看广告。',18,y+72,W-36,12,20,colors.muted,2);
      const yy=Math.min(y+126,H-234);
      button('coin-revive',state.revived?'本局复活已使用':'预留20币复活 · +10工时',12,yy,W-24,48,coinRevive,{disabled:state.revived||adPending,size:14});
      const rs=rewardService?.getState?.();button('ad-revive',rs?.mode==='mock'?'模拟广告复活（测试）':'广告复活（预留未启用）',12,yy+58,W-24,48,requestRevive,{disabled:state.revived||adPending,size:14});
      text('未通关重开/退出，预留金币自动退回。',W/2,H-92,11,colors.muted,'center');
      button('free-restart','免费重开本段',12,H-68,W-24,52,()=>load(level.id),{fill:colors.yellow,color:'#172a35',size:17});
    }else if(modal==='mock-ad'||modal==='ad-wait'){
      modalHeader(modal==='mock-ad'?'模拟广告测试':'等待广告结果','本页不是真实广告，不产生收入。','close-ad');
      // Replace the header close callback: invalidate this run's pending reward.
      const close=hits.find(h=>h.id==='close-ad');if(close)close.fn=()=>{rewardService?.cancel?.();modal='failed';schedule();};
      wrap('只有“完整观看”才测试一次复活。提前关闭、无填充、错误都不得获得奖励。',18,104,W-36,12,18,colors.muted,3);
      if(modal==='mock-ad'){
        const choices=[['completed','模拟完整观看'],['cancelled','模拟提前关闭'],['unavailable','模拟无填充'],['error','模拟广告异常']];
        choices.forEach(([status,label],i)=>button(`mock-${status}`,label,12,158+i*50,W-24,46,()=>{rewardService.resolveMock(status);hits=[];},{fill:i===0?colors.yellow:'#1c4054',color:i===0?'#172a35':colors.ink,size:14}));
      }
      button('ad-restart','不等广告，免费重开',12,H-58,W-24,46,()=>load(level.id),{size:14});
    }else if(modal==='win'){
      modalHeader('工段验收通过',!storageOK?'保存未成功，重开将退回预留费。':progress.completed.length===LEVELS.length?'整座路网已经恢复畅通。':`施工段 ${String(level.id).padStart(2,'0')} · ${level.title}`,'close-win');
      const cy=Math.max(120,Math.min(H*.4,H-292,240));
      stripe(30,cy-40,W-60,10);text('★'.repeat(starsFor(state.moves,level.par)),W/2,cy+12,45,colors.yellow,'center','700');text('运输任务完成',W/2,cy+64,24,colors.ink,'center','700');text(`${state.moves} 次转动  /  ${level.vehicles.length} 辆车送达`,W/2,cy+102,14,colors.green,'center');text(`三星目标：${level.par} 次以内 / ${winAward?'+20金币':'本段金币已领'}`,W/2,cy+128,12,colors.muted,'center');
      button('next',level.id===LEVELS.length?'查看完整路网  →':'进入下一工段  →',12,H-132,W-24,52,()=>{if(level.id===LEVELS.length){modal='levels';schedule();}else load(level.id+1);},{fill:colors.yellow,color:'#102b3c',size:16});
      button('replay','重新挑战本段',12,H-68,W-24,52,()=>load(level.id),{size:15});
    }
  }
  function drawFrame(time){
    frameId=null;if(destroyed||paused)return;
    if(animation&&!adPending){if(previousTime!==null)animation.elapsed+=Math.min(100,Math.max(0,time-previousTime));previousTime=time;if(animation.elapsed>=animation.duration)finishDelivery();}
    const size=platform.getSize(),{width,height,dpr}=size,raw=size.safeInsets||{};
    const inset=(value,max)=>Math.max(0,Math.min(Number(value)||0,max));
    const safe={top:inset(raw.top,height/3),right:inset(raw.right,width/4),bottom:inset(raw.bottom,height/3),left:inset(raw.left,width/4)};
    // Fill the entire host viewport. Insets protect controls, not the scene.
    W=width-safe.left-safe.right;H=height-safe.top-safe.bottom;
    transform={scale:1,x:safe.left,y:safe.top};
    const compact=H<490,margin=H<540?4:8,missionY=margin+48,missionH=compact?20:H<650?36:44,boardTop=missionY+missionH+(compact?4:8),footerH=compact?44:52,footerY=H-margin-footerH,myStatus=footerY-(compact?2:4)-(compact?24:H<650?32:40),boardAvailable=myStatus-boardTop-(compact?4:6),boardGap=W<274?0:2,minMapWidth=level.width*44+boardGap*(level.width-1),mapPad=Math.max(0,Math.min(12,(W-minMapWidth)/2)),boardSize=Math.min(W-2*mapPad,boardAvailable);
    layout={viewportWidth:width,viewportHeight:height,dpr,boardGap,compact,margin,missionY,myStatus,footerY,footerH,boardX:(W-boardSize)/2,boardY:boardTop+Math.min(96,(boardAvailable-boardSize)*.40),boardSize,width:W,height:H,safeInsets:safe};
    ctx.setTransform(dpr,0,0,dpr,0,0);blueprint(width,height);ctx.translate(transform.x,transform.y);hits=[];drawMain();if(modal)drawModal();if(animation)schedule();
  }
  const unsubscribers=[platform.onPointer(event=>{
    if(destroyed||paused)return;const x=(event.x-transform.x)/transform.scale,y=(event.y-transform.y)/transform.scale;
    const targetAt=(px,py)=>[...hits].reverse().find(h=>px>=h.x&&px<=h.x+h.w&&py>=h.y&&py<=h.y+h.h);
    if(event.type==='down'){
      if(gesture)return; // One active finger owns a tap; ignore secondary touches.
      gesture={x,y,id:event.id,targetId:targetAt(x,y)?.id??null};schedule();return;
    }
    if(!gesture||gesture.id!==event.id)return;
    if(event.type==='cancel'){gesture=null;schedule();return;}
    if(event.type==='move'){
      if(Math.hypot(x-gesture.x,y-gesture.y)>15){gesture.targetId=null;schedule();}
      return;
    }
    if(event.type!=='up')return;
    const down=gesture;gesture=null;schedule();
    if(!down.targetId||Math.hypot(x-down.x,y-down.y)>15)return;
    const hit=targetAt(x,y);
    if(hit?.id!==down.targetId)return;
    // Never reuse a rendered closure after a synchronous state transition.
    hits=[];hit.fn();schedule();
  }),platform.onResize(()=>{gesture=null;hits=[];schedule();}),platform.onPause(()=>{paused=true;gesture=null;previousTime=null;if(frameId!==null){platform.cancelFrame(frameId);frameId=null;}}),platform.onResume(()=>{paused=false;previousTime=null;schedule();})];
  if(typeof platform.sidebar?.subscribe==='function')unsubscribers.push(platform.sidebar.subscribe(value=>{sidebarState=value;schedule();}));
  schedule();
  return {destroy(){if(destroyed)return;if(pendingPurchaseAmount(progress)){progress=refundPendingPurchase(progress);save();}destroyed=true;cancelReward();rewardService?.destroy?.();animation=null;if(frameId!==null)platform.cancelFrame(frameId);unsubscribers.forEach(fn=>{if(typeof fn==='function')fn();});},getSnapshot(){return {levelId:level.id,moves:state.moves,nextVehicle:state.nextVehicle,complete:isComplete(state,level),busy:!!animation,modal,preview,message,storageOK,storageConflict,storageUncertain,pendingPurchase:progress.pendingPurchase?{...progress.pendingPurchase}:null,pendingPurchaseCoins:pendingPurchaseAmount(progress),sidebar:sidebarState?{...sidebarState}:null,board:state.board.map(t=>({...t,...(t.exits?{exits:[...t.exits]}:{})})),hitTargets:hits.map(({id,x,y,w,h})=>({id,x,y,w,h})),transform:{...transform},layout:{...layout,safeInsets:{...layout.safeInsets}},design:'road-city-reconnect-v4',campaignSize:LEVELS.length,crane,selectedPanel,coins:progress.coins,workSpent:state.workSpent,budget:state.budget,incidents:state.incidents,incidentLimit:state.incidentLimit,failed:state.failed,revived:state.revived,toolUsed:state.toolUsed,rewards:rewardService?.getState?.()||{mode:'disabled'},adPending,runId};}};
}
