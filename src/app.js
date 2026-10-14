import { LEVELS } from './levels.js';
import { createState, traceRoute, turnTile, dispatch, undo, isComplete, starsFor, normalizeProgress, isEditable, ports } from './rules.js';
import { tileArt, carArt } from './art.js';
const $ = id => document.getElementById(id);
const STORAGE_KEY = 'fix-the-road-v1';
let storageAvailable = true;
let progress;
try { progress = normalizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY)), LEVELS.map(l=>l.id)); }
catch { progress = normalizeProgress(null,LEVELS.map(l=>l.id)); }
let level = LEVELS.find(l=>l.id===progress.lastLevel)||LEVELS[0];
let state = createState(level), showPreview = false, busy = false, animationToken = 0, activeAnimation = null, audioContext;
let hinted = -1, message = '', messageKind = '', hintTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const directions = ['上','右','下','左'];
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); storageAvailable = true; }
  catch { storageAvailable = false; }
}
function beep(kind='turn') {
  if (!progress.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(()=>{});
    const notes = kind === 'win' ? [523,659,784] : kind === 'error' ? [220] : kind==='send'?[440,554]:[kind==='switch'?620:460];
    notes.forEach((freq,i)=>{ const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(); oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(.035,audioContext.currentTime+i*.11);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+i*.11+.17);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(audioContext.currentTime+i*.11);oscillator.stop(audioContext.currentTime+i*.11+.18); });
  } catch { /* Sound is optional, never blocks play. */ }
}
const currentVehicle=()=>level.vehicles[state.nextVehicle];
function routeDescription(result) {
  if(result.ok) return '路线接通了！确认是正确的目的地，就让小车出发吧。';
  if(result.reason==='wrong_destination') return '这条路通往另一家！切换橙色岔口，再送去正确的目的地。';
  if(result.reason==='switch_closed') return '小车会停在岔口。点橙色路口，换一条分流方向。';
  if(result.reason==='out_of_bounds') return '小车要开出小镇啦。转一转尽头的道路，让它回到路线。';
  if(result.reason==='loop') return '小车会绕圈。调整道路，让它走向目的地。';
  return '这里还有一处没接上。找一找路的两端，再转一转。';
}
function setMessage(text,kind=''){message=text;messageKind=kind;renderTip();}
function renderTip(){ $('tip').textContent=message||level.note;$('tip').className=`tip ${messageKind}`; }
function renderBoard() {
  const route=currentVehicle()?traceRoute(level,state.board,currentVehicle()):null;
  const previewIndices=new Set(showPreview?route?.path:[]);
  $('board').style.setProperty('--size',level.width);$('car-layer').style.setProperty('--size',level.width);
  $('board').replaceChildren(...state.board.map((tile,index)=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.index=index;
    button.className=`tile ${tile.type} ${tile.destination||''} ${isEditable(tile)?'editable':'locked'} ${previewIndices.has(index)?'previewed':''} ${showPreview&&route&&!route.ok&&route.at===index?'bad':''} ${hinted===index?'hinted':''}`;
    const editable=isEditable(tile)&&!busy&&!isComplete(state,level);
    button.disabled=!editable;
    // Preserve full-opacity artwork for noninteractive building/park tiles.
    button.style.opacity='1';
    const row=Math.floor(index/level.width)+1,col=index%level.width+1;
    const label=tile.type==='switch'?`岔口，当前连接${ports(tile).map(d=>directions[d]).join('和')}，点击切换`:tile.type==='straight'||tile.type==='bend'?`${tile.type==='straight'?'直路':'弯道'}，连接${ports(tile).map(d=>directions[d]).join('和')}，点击旋转`:tile.type==='source'?'车库':tile.type==='destination'?(tile.destination==='bakery'?'面包店':'花园'):'绿地';
    button.setAttribute('aria-label',`${row}行${col}列，${label}`);
    button.innerHTML=tileArt(tile,showPreview&&previewIndices.has(index))+(tile.type==='source'?'<span class="tile-label">车库</span>':tile.type==='destination'?`<span class="tile-label">${tile.destination==='bakery'?'面包店':'花园'}</span>`:tile.type==='switch'?'<span class="switch-badge">⇄</span>':'');
    button.addEventListener('click',()=>{
      if(busy||isComplete(state,level))return;
      state=turnTile(state,index);hinted=-1;message='';messageKind='';beep(tile.type==='switch'?'switch':'turn');
      if(showPreview){const result=traceRoute(level,state.board,currentVehicle());message=routeDescription(result);messageKind=result.ok?'success':'warning';}
      render();const replacement=$('board').querySelector(`[data-index="${index}"]`);replacement?.focus({preventScroll:true});
    });
    return button;
  }));
}
function render() {
  $('district').textContent=level.district;$('level-title').textContent=level.title;$('level-number').textContent=String(level.id).padStart(2,'0');
  const complete=isComplete(state,level),vehicle=currentVehicle()||level.vehicles.at(-1);
  $('mission-icon').innerHTML=carArt(vehicle.color);
  $('mission-kicker').textContent=complete?'两端接通，心意已送达':level.vehicles.length===2?'双车接力 · 先面包，后鲜花':'这一趟，送一点温暖';
  $('mission-name').textContent=complete?'本关配送完成！':vehicle.destination==='bakery'?'把早餐送到面包店':'把鲜花送到花园';
  $('delivery-count').innerHTML=`${Math.min(state.nextVehicle+1,level.vehicles.length)} <span>/ ${level.vehicles.length}</span>`;
  $('moves').textContent=state.moves;
  $('undo').disabled=busy||!state.history.length;$('reset').disabled=busy;$('hint').disabled=busy||complete;$('preview').disabled=busy||complete;
  $('preview').setAttribute('aria-pressed',String(showPreview));$('dispatch').disabled=busy;
  $('dispatch-label').textContent=busy?'小车正在路上…':complete?'看看这一关的成绩':`${vehicle.name}，出发！`;
  $('progress-label').textContent=`${progress.completed.length} / 10`;$('progress-fill').style.width=`${progress.completed.length*10}%`;
  $('sound').classList.toggle('sound-on',progress.sound);$('sound').setAttribute('aria-label',progress.sound?'关闭音效':'开启音效');$('sound').title=progress.sound?'关闭音效':'开启音效';
  renderBoard();renderTip();
}
function cancelAnimation(){animationToken++;activeAnimation?.cancel();activeAnimation=null;busy=false;$('car').style.display='none';}
function loadLevel(id) {
  cancelAnimation();clearTimeout(hintTimer);level=LEVELS.find(l=>l.id===id)||LEVELS[0];state=createState(level);showPreview=false;hinted=-1;message='';messageKind='';progress.lastLevel=level.id;save();
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());render();
}
function point(index) {return {left:`${((index%level.width)+.5)/level.width*100}%`,top:`${(Math.floor(index/level.width)+.5)/level.height*100}%`};}
async function animateRoute(result,vehicle,token) {
  const car=$('car');car.innerHTML=carArt(vehicle.color);car.style.display='block';Object.assign(car.style,point(result.path[0]));car.style.transform='translate(-50%,-50%)';
  for(let i=1;i<result.path.length;i++) {
    if(token!==animationToken)return;
    const from=point(result.path[i-1]),to=point(result.path[i]);
    const delta=result.path[i]-result.path[i-1],angle=delta===1?0:delta===-1?180:delta>0?90:-90;
    car.style.transform=`translate(-50%,-50%) rotate(${angle}deg)`;
    if(!reducedMotion.matches){
      activeAnimation=car.animate([from,to],{duration:180,easing:'linear',fill:'forwards'});
      try{await activeAnimation.finished;}catch{return;}
      activeAnimation.cancel();activeAnimation=null;
    }
    Object.assign(car.style,to);
  }
  if(!reducedMotion.matches)await new Promise(resolve=>setTimeout(resolve,result.ok?220:300));
  if(token===animationToken)car.style.display='none';
}
async function sendVehicle() {
  if(busy)return;
  if(isComplete(state,level)){showWin();return;}
  const vehicle=currentVehicle(),outcome=dispatch(state,level),token=++animationToken;
  busy=true;hinted=-1;showPreview=true;setMessage('小车出发了，沿着你修好的路前进。');render();beep('send');
  await animateRoute(outcome.result,vehicle,token);
  if(token!==animationToken)return;
  busy=false;
  if(outcome.result.ok){
    state=outcome.state;showPreview=false;beep('win');
    if(isComplete(state,level)){
      if(!progress.completed.includes(level.id))progress.completed.push(level.id);
      progress.bestMoves[level.id]=Math.min(progress.bestMoves[level.id]??Infinity,state.moves);save();
      setMessage('所有心意都送到了，今天也是热闹的小镇。','success');render();showWin();
    } else {setMessage('面包送到了！现在点橙色岔口换方向，再把鲜花送去花园。','success');render();}
  } else {setMessage(routeDescription(outcome.result),'warning');beep('error');render();}
}
function showWin(){
  const stars=starsFor(state.moves,level.par);
  $('win-title').textContent=level.id===10?'整座小镇，都动起来了！':level.vehicles.length===2?'两份心意，都送到啦！':'这一份，顺利送达！';
  $('win-stars').innerHTML='★'.repeat(stars)+`<span class="empty">${'★'.repeat(3-stars)}</span>`;
  $('win-summary').textContent=`${state.moves} 次转动 · ${level.vehicles.length} 辆小车顺利到达`;
  $('win-note').textContent=`三星目标：${level.par} 次以内。${storageAvailable?'最好成绩已保存在当前浏览器。':'浏览器无法保存进度，本次成绩只保留在当前页面。'}`;
  $('next-level').textContent=level.id===10?'回到小镇地图 →':'去下一条街 →';
  if(!$('win-dialog').open)$('win-dialog').showModal();
}
function showLevels(){
  $('level-grid').replaceChildren(...LEVELS.map(l=>{
    const button=document.createElement('button');button.className=`level-option ${level.id===l.id?'current':''}`;button.dataset.level=l.id;
    const best=progress.bestMoves[l.id];button.innerHTML=`${String(l.id).padStart(2,'0')}${l.vehicles.length===2?'<span class="dual">双车</span>':''}<small>${best!==undefined?'★'.repeat(starsFor(best,l.par)):'· · ·'}</small>`;
    button.setAttribute('aria-label',`第${l.id}关，${l.title}${progress.completed.includes(l.id)?'，已完成':''}`);button.addEventListener('click',()=>loadLevel(l.id));return button;
  }));
  $('storage-note').textContent=storageAvailable?'进度只保存在当前浏览器，清除站点数据会重置进度。':'当前浏览器不允许保存进度。游戏仍可正常进行。';
  $('level-dialog').showModal();
}
$('dispatch').addEventListener('click',sendVehicle);
$('undo').addEventListener('click',()=>{if(busy)return;state=undo(state);hinted=-1;message='已撤销上一步，继续慢慢修路。';messageKind='';render();});
$('reset').addEventListener('click',()=>{if(busy)return;loadLevel(level.id);});
$('preview').addEventListener('click',()=>{if(busy||isComplete(state,level))return;showPreview=!showPreview;const result=traceRoute(level,state.board,currentVehicle());message=showPreview?routeDescription(result):'';messageKind=showPreview?(result.ok?'success':'warning'):'';render();});
$('hint').addEventListener('click',()=>{
  if(busy||isComplete(state,level))return;
  const route=level.routes[state.nextVehicle];let found=-1;
  for(let i=1;i<route.length-1;i++){
    const current=route[i],previous=route[i-1],next=route[i+1],index=current[0]*level.width+current[1];
    const direction=other=>other[0]<current[0]?0:other[1]>current[1]?1:other[0]>current[0]?2:3;
    const required=[direction(previous),direction(next)];
    if(!required.every(d=>ports(state.board[index]).includes(d))){found=index;break;}
  }
  clearTimeout(hintTimer);hinted=found;
  setMessage(found===-1?'这辆车的路线已经接通，放心出发吧！':state.board[found].type==='switch'?'看发光的橙色岔口：点一下，把它切换到另一条路。':'看紫色发光的道路：继续转动，直到两端接上前后的路线。',found===-1?'success':'');renderBoard();
  hintTimer=setTimeout(()=>{hinted=-1;renderBoard();},5000);
});
$('sound').addEventListener('click',()=>{progress.sound=!progress.sound;save();if(progress.sound)beep();render();});
$('help').addEventListener('click',()=>$('help-dialog').showModal());
$('choose-level').addEventListener('click',showLevels);
$('next-level').addEventListener('click',()=>{if(level.id===10){$('win-dialog').close();showLevels();}else loadLevel(level.id+1);});
$('replay').addEventListener('click',()=>loadLevel(level.id));
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
render();
