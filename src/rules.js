/** Pure road rules. Directions clockwise: north, east, south, west. */
export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
export const opposite = direction => (direction + 2) % 4;
export const indexOf = (row, col, width) => row * width + col;
export const isEditable = tile => ['straight', 'bend', 'switch'].includes(tile?.type);
const mod4 = n => ((n % 4) + 4) % 4;
const copyBoard = board => board.map(tile => ({ ...tile, ...(tile.exits ? { exits: [...tile.exits] } : {}) }));

export function ports(tile) {
  if (!tile) return [];
  if (tile.type === 'straight') return [0, 2].map(n => mod4(n + tile.rotation));
  if (tile.type === 'bend') return [0, 1].map(n => mod4(n + tile.rotation));
  if (tile.type === 'switch') return [tile.stem, tile.exits[tile.switchState]];
  if (tile.type === 'source' || tile.type === 'destination') return [tile.direction];
  return [];
}

/** Trace one vehicle, including a safe path for a preview / animation. */
export function traceRoute(level, board, vehicle) {
  if (!vehicle) return { ok: false, reason: 'no_vehicle', path: [], at: null };
  let current = indexOf(...vehicle.start, level.width);
  const path = [current];
  const first = board[current];
  if (first?.type !== 'source') return { ok: false, reason: 'invalid_start', path, at: current };
  let exit = first.direction;
  const visited = new Set();
  for (let step = 0; step <= board.length * 4; step++) {
    const row = Math.floor(current / level.width), col = current % level.width;
    const [dr, dc] = DIRS[exit];
    const nr = row + dr, nc = col + dc;
    if (nr < 0 || nr >= level.height || nc < 0 || nc >= level.width) {
      return { ok: false, reason: 'out_of_bounds', path, at: current };
    }
    const next = indexOf(nr, nc, level.width), tile = board[next], incoming = opposite(exit);
    if (!ports(tile).includes(incoming)) {
      return { ok: false, reason: tile?.type === 'switch' ? 'switch_closed' : 'disconnected', path, at: next };
    }
    path.push(next);
    if (tile.type === 'destination') {
      const ok = tile.destination === vehicle.destination;
      return { ok, reason: ok ? 'arrived' : 'wrong_destination', path, at: next, destination: tile.destination };
    }
    if (tile.type === 'source') return { ok: false, reason: 'wrong_source', path, at: next };
    const key = `${next}:${incoming}`;
    if (visited.has(key)) return { ok: false, reason: 'loop', path, at: next };
    visited.add(key);
    const connections = ports(tile);
    if (connections.length !== 2) return { ok: false, reason: 'disconnected', path, at: next };
    exit = connections.find(p => p !== incoming);
    current = next;
  }
  return { ok: false, reason: 'loop', path, at: current };
}

export function createState(level) {
  return { levelId: level.id, board: copyBoard(level.board), nextVehicle: 0, moves: 0, history: [], workSpent: 0, budget: level.budget ?? null, incidents: 0, incidentLimit: level.incidentLimit ?? null, failed: null, revived: false, toolUsed: false };
}
function remember(state) {
  return { board: copyBoard(state.board), nextVehicle: state.nextVehicle, moves: state.moves };
}
export function turnTile(state, index) {
  if (state.failed) return state;
  if (!Number.isInteger(index) || !isEditable(state.board[index])) return state;
  if (state.budget !== null && state.workSpent >= state.budget) return { ...state, failed: 'budget' };
  const board = copyBoard(state.board), tile = board[index];
  if (tile.type === 'switch') tile.switchState = tile.switchState === 0 ? 1 : 0;
  else tile.rotation = mod4(tile.rotation + 1);
  return { ...state, board, moves: state.moves + 1, workSpent: state.budget===null?0:state.workSpent + 1, history: [...state.history, remember(state)] };
}
export function dispatch(state, level) {
  if (state.levelId !== level.id) return { state, result: { ok: false, reason: 'wrong_level', path: [] } };
  if (state.failed) return { state, result: { ok: false, reason: state.failed, path: [] } };
  const result = traceRoute(level, state.board, level.vehicles[state.nextVehicle]);
  if (!result.ok) {
    if (state.incidentLimit === null) return { state, result };
    const incidents = state.incidents + 1;
    return { state: { ...state, incidents, failed: incidents >= state.incidentLimit ? 'incidents' : null }, result };
  }
  return { result, state: { ...state, nextVehicle: state.nextVehicle + 1, history: [...state.history, remember(state)] } };
}
export function undo(state) {
  if (state.failed || !state.history.length) return state;
  const previous = state.history.at(-1);
  return { ...state, ...previous, board: copyBoard(previous.board), history: state.history.slice(0, -1) };
}
export const isComplete = (state, level) => state.nextVehicle >= level.vehicles.length;
export function starsFor(moves, par) { return moves <= par ? 3 : moves <= par + 6 ? 2 : 1; }

/** A marked modular road panel may be craned into an empty foundation. */
export function movePanel(state, from, to) {
  if (state.failed || from === to || !Number.isInteger(from) || !Number.isInteger(to)) return state;
  const tile=state.board[from];
  if (!tile?.movable || !['straight','bend'].includes(tile.type) || state.board[to]?.type !== 'socket') return state;
  if (state.budget !== null && state.workSpent >= state.budget) return { ...state, failed: 'budget' };
  const board=copyBoard(state.board); board[to]={...tile}; board[from]={type:'socket'};
  return {...state,board,moves:state.moves+1,workSpent:state.workSpent+1,history:[...state.history,remember(state)]};
}
export function reviveState(state) {
  if (!state.failed || state.revived) return state;
  return {...state,failed:null,revived:true,budget:state.budget===null?null:Math.max(state.budget,state.workSpent)+10,incidents:0,history:[]};
}
export function useWorkTool(state) {
  if (state.failed || state.toolUsed || state.budget===null) return state;
  return {...state,toolUsed:true,budget:state.budget+6};
}
/** Version 1 saves migrate without losing clears. No server / money economy. */
export function normalizeProgress(value, levelIds) {
  const safe = { version: 2, completed: [], bestMoves: {}, sound: false, lastLevel: 1, coins: 0 };
  if (!value || typeof value !== 'object' || ![1,2].includes(value.version)) return safe;
  safe.completed = [...new Set(Array.isArray(value.completed) ? value.completed.filter(id => levelIds.includes(id)) : [])];
  for (const id of safe.completed) {
    const n = value.bestMoves?.[id];
    if (Number.isInteger(n) && n >= 0 && n < 100000) safe.bestMoves[id] = n;
  }
  safe.sound = value.sound === true;
  if (levelIds.includes(value.lastLevel)) safe.lastLevel = value.lastLevel;
  safe.coins=value.version===1?safe.completed.length*20:(Number.isInteger(value.coins)&&value.coins>=0?Math.min(value.coins,12000):0);
  return safe;
}
export function awardVictory(progress, level, moves) {
  const first=!progress.completed.includes(level.id);
  return {...progress,completed:first?[...progress.completed,level.id]:[...progress.completed],bestMoves:{...progress.bestMoves,[level.id]:Math.min(progress.bestMoves[level.id]??Infinity,moves)},coins:Math.min(12000,progress.coins+(first?20:0))};
}
export function spendCoins(progress, amount) {
  if (!Number.isInteger(amount)||amount<=0||progress.coins<amount) return null;
  return {...progress,coins:progress.coins-amount};
}
