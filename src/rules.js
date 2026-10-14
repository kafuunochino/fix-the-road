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
  return { levelId: level.id, board: copyBoard(level.board), nextVehicle: 0, moves: 0, history: [] };
}
function remember(state) {
  return { board: copyBoard(state.board), nextVehicle: state.nextVehicle, moves: state.moves };
}
export function turnTile(state, index) {
  if (!Number.isInteger(index) || !isEditable(state.board[index])) return state;
  const board = copyBoard(state.board), tile = board[index];
  if (tile.type === 'switch') tile.switchState = tile.switchState === 0 ? 1 : 0;
  else tile.rotation = mod4(tile.rotation + 1);
  return { ...state, board, moves: state.moves + 1, history: [...state.history, remember(state)] };
}
export function dispatch(state, level) {
  if (state.levelId !== level.id) return { state, result: { ok: false, reason: 'wrong_level', path: [] } };
  const result = traceRoute(level, state.board, level.vehicles[state.nextVehicle]);
  if (!result.ok) return { state, result };
  return { result, state: { ...state, nextVehicle: state.nextVehicle + 1, history: [...state.history, remember(state)] } };
}
export function undo(state) {
  if (!state.history.length) return state;
  const previous = state.history.at(-1);
  return { ...state, ...previous, board: copyBoard(previous.board), history: state.history.slice(0, -1) };
}
export const isComplete = (state, level) => state.nextVehicle >= level.vehicles.length;
export function starsFor(moves, par) { return moves <= par ? 3 : moves <= par + 6 ? 2 : 1; }

/** Normalize saved data; never trust localStorage shape or numeric ranges. */
export function normalizeProgress(value, levelIds) {
  const safe = { version: 1, completed: [], bestMoves: {}, sound: false, lastLevel: 1 };
  if (!value || typeof value !== 'object' || value.version !== 1) return safe;
  safe.completed = [...new Set(Array.isArray(value.completed) ? value.completed.filter(id => levelIds.includes(id)) : [])];
  for (const id of safe.completed) {
    const n = value.bestMoves?.[id];
    if (Number.isInteger(n) && n >= 0 && n < 100000) safe.bestMoves[id] = n;
  }
  safe.sound = value.sound === true;
  if (levelIds.includes(value.lastLevel)) safe.lastLevel = value.lastLevel;
  return safe;
}
