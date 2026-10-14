import { indexOf, opposite, ports } from './rules.js';

const routeDirection = (from, to) => {
  const dr = to[0] - from[0], dc = to[1] - from[1];
  if (Math.abs(dr) + Math.abs(dc) !== 1) throw new Error('Route cells must be adjacent');
  return dr === -1 ? 0 : dc === 1 ? 1 : dr === 1 ? 2 : 3;
};
const names = { bakery: '面包店', garden: '花园' };
const templates = [
  { title: '第一份早餐', district: '晨光街', size: 4, note: '点一下道路，让它顺时针转 90°。把黄色小车送到面包店。',
    routes: [[[3,0],[3,1],[2,1],[1,1],[1,2],[1,3]]] },
  { title: '拐个弯就到了', district: '微风巷', size: 4, note: '先看道路两端，再旋转。直路转两次会回到原来的连接方向。',
    routes: [[[3,0],[3,1],[3,2],[2,2],[1,2],[1,1],[0,1],[0,2],[0,3]]] },
  { title: '绕过小公园', district: '三叶公园', size: 5, note: '不是越近越好。顺着弯道，为早餐绕一条舒服的路。',
    routes: [[[4,0],[4,1],[3,1],[2,1],[2,2],[3,2],[3,3],[2,3],[1,3],[1,4]]] },
  { title: '小镇慢慢醒来', district: '彩虹社区', size: 5, note: '长路线也不着急。点“路线预览”，看看小车会在哪里停住。',
    routes: [[[4,0],[3,0],[2,0],[2,1],[1,1],[0,1],[0,2],[0,3],[1,3],[2,3],[2,4]]] },
  { title: '一个路口，两份心意', district: '双车接力 · 初见', size: 5, note: '新玩法：两辆车依次出发！先送面包，再点橙色岔口换方向，把花送到花园。', junction: [3,2],
    routes: [[[4,0],[3,0],[3,1],[3,2],[2,2],[1,2]], [[4,0],[3,0],[3,1],[3,2],[3,3],[3,4]]] },
  { title: '早餐向北，花向南', district: '双车接力 · 分流', size: 5, note: '共用一段路，不等于共用目的地。每辆车出发前，都可以重新调整道路。', junction: [2,2],
    routes: [[[4,0],[4,1],[3,1],[2,1],[2,2],[1,2],[0,2],[0,3],[0,4]], [[4,0],[4,1],[3,1],[2,1],[2,2],[2,3],[3,3],[4,3],[4,4]]] },
  { title: '穿过社区的礼物', district: '双车接力 · 回环', size: 5, note: '修好的共用路段会保留。第一辆车到达后，只调整第二条支路就好。', junction: [2,2],
    routes: [[[4,0],[3,0],[2,0],[1,0],[1,1],[2,1],[2,2],[1,2],[0,2],[0,3],[0,4]], [[4,0],[3,0],[2,0],[1,0],[1,1],[2,1],[2,2],[2,3],[3,3],[3,4],[4,4]]] },
  { title: '今天去远一点', district: '双车接力 · 新城区', size: 6, note: '小镇变大了，但诀窍没变：先修共用道路，再为每辆车切换目的地。', junction: [3,3],
    routes: [[[5,0],[5,1],[4,1],[3,1],[3,2],[3,3],[2,3],[1,3],[1,2],[0,2],[0,3],[0,4]], [[5,0],[5,1],[4,1],[3,1],[3,2],[3,3],[3,4],[4,4],[4,5],[5,5]]] },
  { title: '不走错的约定', district: '双车接力 · 山坡', size: 6, note: '留心车身颜色：黄色送面包，紫色送花。送到另一家也不算完成哦。', junction: [2,3],
    routes: [[[5,0],[4,0],[3,0],[3,1],[2,1],[2,2],[2,3],[1,3],[1,2],[0,2],[0,3],[0,4],[0,5]], [[5,0],[4,0],[3,0],[3,1],[2,1],[2,2],[2,3],[2,4],[3,4],[4,4],[4,3],[5,3],[5,4],[5,5]]] },
  { title: '让整座小镇动起来', district: '双车接力 · 毕业日', size: 6, note: '最后一班接力！没有倒计时。用最少的转动，让两份心意都准时到家。', junction: [3,2],
    routes: [[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[1,2],[1,1],[0,1],[0,2],[0,3],[1,3],[1,4],[1,5]], [[5,0],[5,1],[4,1],[3,1],[3,2],[3,3],[3,4],[2,4],[2,5],[3,5],[4,5],[5,5]]] }
];

function makeLevel(spec, index) {
  const id = index + 1, width = spec.size;
  const board = Array.from({ length: width * width }, (_, i) => ({ type: 'park', decor: (i * 7 + id * 3) % 5 }));
  const solved = new Map();
  const junctionIndex = spec.junction ? indexOf(...spec.junction, width) : -1;
  spec.routes.forEach((route, routeIndex) => {
    const destination = routeIndex === 0 ? 'bakery' : 'garden';
    route.forEach((cell, step) => {
      const pos = indexOf(...cell, width);
      if (step === 0) { board[pos] = { type: 'source', direction: routeDirection(cell, route[1]) }; return; }
      if (step === route.length - 1) { board[pos] = { type: 'destination', destination, direction: routeDirection(cell, route[step - 1]) }; return; }
      const incoming = routeDirection(cell, route[step - 1]), outgoing = routeDirection(cell, route[step + 1]);
      if (pos === junctionIndex) {
        if (routeIndex === 0) board[pos] = { type: 'switch', stem: incoming, exits: [outgoing], switchState: 1 };
        else board[pos].exits.push(outgoing);
        return;
      }
      const type = opposite(incoming) === outgoing ? 'straight' : 'bend';
      const rotation = [0, 1, 2, 3].find(r => ports({ type, rotation: r }).every(p => [incoming, outgoing].includes(p)));
      const existing = solved.get(pos);
      if (existing && (existing.type !== type || existing.rotation !== rotation)) throw new Error(`Conflicting route ${id}:${pos}`);
      solved.set(pos, { type, rotation });
    });
  });
  const solution = [];
  for (const [pos, tile] of solved) {
    const scramble = ((pos * 3 + id) % 3) + 1;
    board[pos] = { ...tile, rotation: (tile.rotation + scramble) % 4 };
    const turns = tile.type === 'straight' ? scramble % 2 : (4 - scramble) % 4;
    for (let n = 0; n < turns; n++) solution.push({ type: 'turn', index: pos });
  }
  if (junctionIndex >= 0) solution.push({ type: 'turn', index: junctionIndex });
  solution.push({ type: 'dispatch' });
  if (spec.routes.length === 2) solution.push({ type: 'turn', index: junctionIndex }, { type: 'dispatch' });
  const vehicles = spec.routes.map((route, i) => ({ id: `${id}-${i}`, start: [...route[0]], destination: i === 0 ? 'bakery' : 'garden', name: i === 0 ? '早餐小车' : '送花小车', cargo: i === 0 ? '新鲜面包' : '一车鲜花', color: i === 0 ? '#f5ae35' : '#9b7be8', destinationName: names[i === 0 ? 'bakery' : 'garden'] }));
  return { id, title: spec.title, district: spec.district, note: spec.note, width, height: width, board, vehicles, solution, par: solution.filter(a => a.type === 'turn').length, routes: spec.routes, junctionIndex };
}


// Forty distinct, fixed construction drawings. Routes were generated offline,
// then frozen and reference-replayed. No random difficulty or ad-dependent layouts.
const campaignDrawings=[{"n":5,"routes":[[[4,0],[3,0],[2,0],[1,0],[1,1],[2,1],[3,1],[4,1]]]},{"n":5,"routes":[[[4,0],[4,1],[3,1],[3,0],[2,0],[1,0],[1,1],[1,2],[0,2],[0,3],[0,4]]]},{"n":5,"routes":[[[4,0],[4,1],[4,2],[4,3],[4,4],[3,4],[2,4],[1,4],[0,4],[0,3]]]},{"n":5,"routes":[[[4,0],[3,0],[3,1],[4,1],[4,2],[3,2],[2,2],[2,1],[2,0],[1,0],[0,0],[0,1],[0,2]]]},{"n":5,"routes":[[[4,0],[3,0],[2,0],[1,0],[1,1],[2,1],[2,2],[3,2],[3,3],[3,4],[4,4],[4,3],[4,2]]]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[2,3],[2,4],[3,4],[3,5],[4,5],[5,5],[5,4],[4,4],[4,3]]]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[3,1],[2,1],[1,1],[1,0],[0,0],[0,1],[0,2],[1,2],[1,3],[2,3],[3,3],[4,3]]]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[4,2],[5,2],[5,3],[4,3],[4,4],[5,4],[5,5],[4,5],[3,5],[2,5],[2,4],[3,4],[3,3],[3,2]]]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[4,2],[3,2],[3,1],[2,1],[2,0],[1,0],[1,1],[0,1],[0,2],[0,3],[0,4],[0,5],[1,5],[2,5]]]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[4,4],[3,4],[2,4],[2,5],[1,5],[1,4],[0,4],[0,3],[1,3],[2,3]]]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[1,0],[0,0],[0,1],[0,2],[0,3],[0,4],[1,4]],[[5,0],[5,1],[4,1],[4,0],[3,0],[3,1],[3,2],[2,2],[2,3],[3,3],[3,4],[3,5],[2,5]]],"junction":[3,0]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[1,2],[1,1],[0,1],[0,2],[0,3],[1,3]],[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[1,2],[1,1],[2,1],[2,0],[1,0],[0,0]]],"junction":[1,1]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[2,0],[2,1],[1,1],[1,0],[0,0],[0,1],[0,2],[1,2],[1,3],[2,3],[3,3]],[[5,0],[4,0],[3,0],[2,0],[2,1],[2,2],[3,2],[3,1],[4,1]]],"junction":[2,1]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[3,1],[3,2],[3,3],[4,3],[5,3],[5,4],[4,4],[4,5],[3,5]],[[5,0],[4,0],[4,1],[3,1],[2,1],[2,0],[1,0],[1,1]]],"junction":[3,1]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[4,2],[3,2],[3,3],[4,3],[5,3],[5,4],[4,4],[4,5],[3,5],[2,5],[2,4]],[[5,0],[5,1],[5,2],[4,2],[3,2],[3,3],[2,3],[2,2],[1,2],[1,3],[1,4],[0,4]]],"junction":[3,3]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[4,4],[4,3],[3,3],[2,3],[2,2]],[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[3,5],[2,5],[2,4],[1,4]]],"junction":[4,5]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[2,0],[1,0],[1,1],[1,2],[0,2],[0,3],[0,4],[1,4],[2,4],[2,5],[1,5]],[[5,0],[4,0],[3,0],[2,0],[2,1],[3,1],[3,2],[3,3]]],"junction":[2,0]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[4,1],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[3,5],[3,4]],[[5,0],[4,0],[3,0],[3,1],[4,1],[5,1],[5,2],[4,2],[4,3],[3,3],[2,3]]],"junction":[5,2]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[4,2],[3,2],[3,1],[2,1],[2,0],[1,0],[1,1],[1,2],[2,2],[2,3],[1,3]],[[5,0],[5,1],[5,2],[4,2],[3,2],[3,3],[4,3],[5,3],[5,4]]],"junction":[3,2]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[5,3],[5,4],[4,4],[3,4],[3,3],[2,3],[1,3],[0,3],[0,2],[0,1]],[[5,0],[5,1],[5,2],[5,3],[4,3],[4,2],[3,2],[3,1],[3,0],[2,0]]],"junction":[5,3]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[5,1],[5,2],[5,3],[5,4],[4,4],[3,4],[2,4],[1,4],[1,3]],[[5,0],[4,0],[4,1],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[3,5],[2,5],[1,5]]],"junction":[5,4]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[2,1],[2,0],[1,0],[1,1],[0,1],[0,2],[1,2],[1,3],[2,3]],[[5,0],[4,0],[3,0],[3,1],[2,1],[2,2],[3,2],[4,2],[4,1]]],"junction":[2,1]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[3,1],[2,1],[1,1],[0,1],[0,2],[0,3],[1,3],[2,3],[2,4]],[[5,0],[5,1],[4,1],[3,1],[3,0],[2,0],[1,0],[0,0]]],"junction":[3,1]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[1,0],[1,1],[0,1],[0,2],[0,3],[1,3],[2,3]],[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[2,1],[2,2],[3,2],[3,1]]],"junction":[2,0]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[3,1],[2,1],[2,0],[1,0],[1,1],[0,1],[0,2],[0,3],[1,3]],[[5,0],[4,0],[4,1],[3,1],[2,1],[2,0],[1,0],[1,1],[1,2],[2,2],[3,2],[3,3],[2,3]]],"junction":[1,1]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[3,5],[3,4],[2,4],[2,3],[1,3]],[[5,0],[4,0],[4,1],[5,1],[5,2],[4,2],[3,2],[3,1],[3,0]]],"junction":[5,2]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[4,4],[3,4],[3,5],[2,5],[2,4]],[[5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[4,5],[4,4],[4,3],[3,3],[2,3],[1,3],[0,3]]],"junction":[4,4]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[1,0],[0,0],[0,1],[1,1],[2,1],[2,2],[1,2],[0,2]],[[5,0],[5,1],[4,1],[4,0],[3,0],[3,1],[3,2],[3,3],[2,3],[1,3],[0,3],[0,4],[1,4]]],"junction":[3,0]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[3,2],[4,2],[4,3],[3,3],[2,3],[2,2],[1,2],[1,3],[1,4]],[[5,0],[4,0],[3,0],[3,1],[3,2],[4,2],[4,3],[3,3],[3,4],[4,4],[5,4],[5,3]]],"junction":[3,3]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[5,1],[5,2],[4,2],[3,2],[2,2],[1,2],[0,2],[0,3],[1,3],[2,3],[2,4]],[[5,0],[4,0],[4,1],[5,1],[5,2],[4,2],[3,2],[2,2],[2,1],[2,0],[3,0],[3,1]]],"junction":[2,2]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[4,2],[3,2],[2,2],[2,3],[3,3],[4,3],[5,3],[5,4],[4,4],[4,5]],[[5,0],[5,1],[5,2],[4,2],[4,1],[3,1],[3,0],[4,0]]],"junction":[4,2]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[4,2],[3,2],[3,1],[3,0],[2,0],[2,1],[1,1],[1,0],[0,0],[0,1],[0,2]],[[5,0],[5,1],[5,2],[4,2],[4,3],[3,3],[3,4],[4,4],[4,5]]],"junction":[4,2]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[3,2],[3,3],[2,3],[1,3],[0,3],[0,4],[1,4],[2,4],[2,5]],[[5,0],[4,0],[3,0],[3,1],[3,2],[3,3],[2,3],[2,2],[2,1],[1,1],[0,1],[0,2],[1,2]]],"junction":[2,3]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[4,1],[4,2],[3,2],[3,3],[3,4],[4,4],[4,5],[5,5]],[[5,0],[4,0],[3,0],[3,1],[4,1],[4,2],[3,2],[3,3],[2,3],[2,4],[1,4],[0,4],[0,3]]],"junction":[3,3]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[1,2],[1,1],[0,1],[0,2],[0,3],[1,3],[1,4]],[[5,0],[5,1],[4,1],[3,1],[3,2],[2,2],[1,2],[1,1],[2,1],[2,0],[1,0],[0,0]]],"junction":[1,1]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[5,3],[4,3],[4,4],[3,4],[2,4],[2,5],[3,5],[4,5],[5,5]],[[5,0],[5,1],[5,2],[5,3],[4,3],[4,4],[3,4],[3,3],[3,2],[3,1],[4,1]]],"junction":[3,4]},{"n":6,"routes":[[[5,0],[5,1],[5,2],[4,2],[4,3],[4,4],[5,4],[5,5],[4,5],[3,5],[2,5],[1,5],[0,5]],[[5,0],[5,1],[5,2],[4,2],[4,1],[4,0],[3,0],[2,0],[2,1],[3,1],[3,2]]],"junction":[4,2]},{"n":6,"routes":[[[5,0],[4,0],[4,1],[4,2],[4,3],[3,3],[3,2],[2,2],[2,3],[2,4],[1,4],[1,3]],[[5,0],[4,0],[4,1],[4,2],[4,3],[3,3],[3,4],[4,4],[5,4],[5,5],[4,5],[3,5],[2,5]]],"junction":[3,3]},{"n":6,"routes":[[[5,0],[4,0],[3,0],[3,1],[3,2],[3,3],[4,3],[5,3],[5,4],[4,4],[3,4],[2,4],[1,4],[1,5]],[[5,0],[4,0],[3,0],[3,1],[3,2],[3,3],[4,3],[5,3],[5,2],[4,2],[4,1],[5,1]]],"junction":[5,3]},{"n":6,"routes":[[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[1,0],[1,1],[1,2],[0,2],[0,1],[0,0]],[[5,0],[5,1],[4,1],[4,0],[3,0],[2,0],[1,0],[1,1],[2,1],[2,2],[3,2],[3,3]]],"junction":[1,1]}];
const campaignNames=["夜班开工", "沿河抢修", "高架引道", "环城匝道", "港区绕行", "错峰运输", "雨后便道", "隧道出口", "老街接驳", "东岸交付", "双线调度", "共用咽喉", "岔口窗口", "物流节点", "工厂换班", "仓区绕行", "东西接力", "滨河分流", "立交之下", "环港调度", "吊装初试", "拼装便道", "空槽接续", "路板回收", "桥面拼接", "借道施工", "临时栈桥", "钢板换位", "双段接驳", "模组工场", "先通后借", "一板两用", "回收接力", "施工封锁", "单线抢通", "紧急换铺", "逆向调度", "夜间决战", "最后工时", "城市复线"];

function makeCampaign(drawing, offset) {
  const id=offset+11, chapter=Math.floor((id-1)/10)+1;
  const note=chapter===2?'旋转消耗工时，撤销不退工时；预览免费，发车前检查断点。':chapter===3?'先修共用道路，再切换岔口依次运输。错误发车会损失故障容错。':chapter===4?'点吊装，再点带螺栓的路板与空槽。搬运消耗1工时，路板可旋转。':'先交付面包，再把旧支路的螺栓路板吊到鲜花支路；有限工时要规划。';
  const level=makeLevel({size:drawing.n,routes:drawing.routes,junction:drawing.junction,title:campaignNames[offset],district:['','入门街区','限时施工','双线物流','模组工场','旧路新用'][chapter],note},id-1);
  const initialTurns=level.solution.slice(0,level.solution.findIndex(a=>a.type==='dispatch'));
  const solvedBoard=level.board.map(t=>({...t,exits:t.exits?[...t.exits]:undefined}));
  for(const a of initialTurns){const t=solvedBoard[a.index];if(t.type==='switch')t.switchState=1-t.switchState;else t.rotation=(t.rotation+1)%4;}
  let solution=[...initialTurns,{type:'dispatch'}];
  if(level.vehicles.length===2)solution.push({type:'turn',index:level.junctionIndex},{type:'dispatch'});
  level.transfers=[];
  if(chapter===4){
    const count=id<35?1:2;
    const candidates=level.routes[0].slice(1,-1).map(c=>indexOf(...c,level.width)).filter(i=>['straight','bend'].includes(level.board[i].type));
    const stock=level.board.map((t,i)=>t.type==='park'?i:-1).filter(i=>i>=0);
    const moves=[];
    for(let k=0;k<count;k++){
      const to=candidates[(k*3+offset)%candidates.length],from=stock[k];
      level.board[from]={...level.board[to],movable:true};level.board[to]={type:'socket'};
      level.transfers.push({from,to,phase:0});moves.push({type:'move',from,to});
    }
    solution=[...moves,...solution];
  }
  if(chapter===5){
    const first=new Set(level.routes[0].map(c=>indexOf(...c,level.width))),second=new Set(level.routes[1].map(c=>indexOf(...c,level.width)));
    const donors=[...first].filter(i=>!second.has(i)&&['straight','bend'].includes(level.board[i].type));
    const gaps=[...second].filter(i=>!first.has(i)&&['straight','bend'].includes(level.board[i].type));
    const needed=id<46?1:2,used=new Set(),moves=[];
    for(const to of gaps){
      const from=donors.find(i=>!used.has(i)&&level.board[i].type===level.board[to].type);if(from===undefined)continue;
      used.add(from);level.board[from].movable=true;level.board[to]={type:'socket'};level.transfers.push({from,to,phase:1});
      moves.push({type:'move',from,to});
      const actual={...solvedBoard[from]},target=ports(solvedBoard[to]);
      for(let n=0;n<4&&!target.every(p=>ports(actual).includes(p));n++){moves.push({type:'turn',index:to});actual.rotation=(actual.rotation+1)%4;}
      if(level.transfers.length===needed)break;
    }
    if(!level.transfers.length)throw Error(`No reusable road panel in ${id}`);
    const holes=new Set(level.transfers.map(t=>t.to));
    solution=[...initialTurns.filter(a=>!holes.has(a.index)),{type:'dispatch'},...moves,{type:'turn',index:level.junctionIndex},{type:'dispatch'}];
  }
  level.solution=solution;level.par=solution.filter(a=>a.type!=='dispatch').length;
  const slack=chapter===2?Math.max(4,8-(id-11)):chapter===3?Math.max(3,6-(id-21)):chapter===4?Math.max(2,5-(id-31)):Math.max(0,3-Math.floor((id-41)/3));
  level.budget=level.par+slack;level.incidentLimit=id>=46?1:id>=31?2:3;level.chapter=chapter;level.reward=20;
  return level;
}
export const LEVELS = [...templates.map(makeLevel),...campaignDrawings.map(makeCampaign)];
export const CHAPTERS = ['入门街区','限量施工','双线调度','模组吊装','旧路新用'];
