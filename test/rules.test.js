import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { ports, createState, traceRoute, turnTile, dispatch, undo, isComplete, normalizeProgress, starsFor } from '../src/rules.js';

test('rotation ports and switches are deterministic', () => {
  assert.deepEqual(ports({ type: 'straight', rotation: 1 }), [1, 3]);
  assert.deepEqual(ports({ type: 'bend', rotation: 3 }), [3, 0]);
  assert.deepEqual(ports({ type: 'switch', stem: 3, exits: [0, 1], switchState: 1 }), [3, 1]);
});
for (const level of LEVELS) {
  test(`handcrafted level ${level.id} has a replayable complete solution`, () => {
    let state = createState(level);
    assert.equal(traceRoute(level, state.board, level.vehicles[0]).ok, false, 'level starts unsolved');
    for (const action of level.solution) {
      if (action.type === 'turn') state = turnTile(state, action.index);
      else {
        const sent = dispatch(state, level);
        assert.equal(sent.result.ok, true, JSON.stringify(sent.result));
        state = sent.state;
      }
    }
    assert.equal(isComplete(state, level), true);
    assert.equal(state.moves, level.par);
    assert.equal(dispatch(state, level).result.reason, 'no_vehicle');
    assert.deepEqual(createState(level).board, level.board, 'solution does not mutate source data');
  });
}
const simple = { id: 100, width: 3, height: 1, board: [{ type: 'source', direction: 1 }, { type: 'straight', rotation: 1 }, { type: 'destination', direction: 3, destination: 'bakery' }], vehicles: [{ start: [0,0], destination: 'bakery' }] };
test('connected roads arrive at the correct destination', () => {
  assert.equal(traceRoute(simple, simple.board, simple.vehicles[0]).reason, 'arrived');
});
test('disconnected roads stop before the inaccessible tile', () => {
  const state = turnTile(createState(simple), 1);
  const result = traceRoute(simple, state.board, simple.vehicles[0]);
  assert.equal(result.reason, 'disconnected'); assert.deepEqual(result.path, [0]); assert.equal(result.at, 1);
});
test('wrong destination is not a successful delivery', () => {
  const result = traceRoute(simple, simple.board, { start: [0,0], destination: 'garden' });
  assert.equal(result.reason, 'wrong_destination'); assert.equal(result.ok, false);
});
test('out of bounds is safely rejected without wrapping rows', () => {
  const level = { ...simple, board: [{ type: 'source', direction: 3 }, ...simple.board.slice(1)] };
  assert.equal(traceRoute(level, level.board, simple.vehicles[0]).reason, 'out_of_bounds');
});
test('same shared junction must change between two deliveries', () => {
  const level = LEVELS[4]; let state = createState(level);
  for (const action of level.solution) {
    if (action.type === 'dispatch') break;
    state = turnTile(state, action.index);
  }
  state = dispatch(state, level).state;
  assert.equal(traceRoute(level, state.board, level.vehicles[1]).reason, 'wrong_destination');
  state = turnTile(state, level.junctionIndex);
  assert.equal(traceRoute(level, state.board, level.vehicles[1]).ok, true);
});
test('turns, dispatch and undo are immutable and rewind delivery', () => {
  const original = createState(simple), changed = turnTile(original, 1);
  assert.equal(original.moves, 0); assert.equal(changed.moves, 1); assert.equal(original.board[1].rotation, 1);
  const reverted = undo(changed);
  assert.deepEqual(reverted, original);
  const sent = dispatch(original, simple).state;
  assert.equal(sent.nextVehicle, 1); assert.equal(undo(sent).nextVehicle, 0);
  assert.equal(turnTile(original, 0), original); assert.equal(turnTile(original, -1), original); assert.equal(undo(original), original);
});
test('failed departures and wrong level cannot change state', () => {
  const state = turnTile(createState(simple), 1);
  assert.equal(dispatch(state, simple).state, state);
  assert.equal(dispatch(state, { ...simple, id: 200 }).result.reason, 'wrong_level');
});
test('progress rejects corrupt, unknown, duplicate and extreme values', () => {
  assert.deepEqual(normalizeProgress(null, [1,2]).completed, []);
  const saved = normalizeProgress({ version: 1, completed: [1,1,2,99], bestMoves: {1: 7, 2: -1}, sound: 'true', lastLevel: 99 }, [1,2]);
  assert.deepEqual(saved.completed, [1,2]); assert.deepEqual(saved.bestMoves, {1:7}); assert.equal(saved.sound, false); assert.equal(saved.lastLevel, 1);
});
test('star thresholds always award at least one star', () => {
  assert.equal(starsFor(5, 5), 3); assert.equal(starsFor(11,5), 2); assert.equal(starsFor(100,5), 1);
});

test('every solution follows the exact authored route, not an accidental shortcut', () => {
  for (const level of LEVELS) {
    let state = createState(level), deliveries = 0;
    for (const action of level.solution) {
      if (action.type === 'turn') state = turnTile(state, action.index);
      else {
        const sent = dispatch(state, level);
        assert.deepEqual(sent.result.path, level.routes[deliveries].map(([r,c]) => r * level.width + c), `level ${level.id} vehicle ${deliveries}`);
        deliveries++;
        state = sent.state;
      }
    }
  }
});

test('closed switch rejects an approach from the inactive branch', () => {
  const level = { id: 101, width: 2, height: 2, board: [
    { type: 'park' }, { type: 'source', direction: 2 },
    { type: 'destination', direction: 1, destination: 'bakery' },
    { type: 'switch', stem: 3, exits: [0,2], switchState: 1 }
  ], vehicles: [{ start: [0,1], destination: 'bakery' }] };
  const result = traceRoute(level, level.board, level.vehicles[0]);
  assert.equal(result.reason, 'switch_closed'); assert.equal(result.at, 3);
  const changed = turnTile(createState(level), 3);
  assert.equal(traceRoute(level, changed.board, level.vehicles[0]).ok, true);
});

test('returning to another garage cannot count as a destination', () => {
  const level = { ...simple, board: [...simple.board.slice(0,2), { type: 'source', direction: 3 }] };
  assert.equal(traceRoute(level, level.board, level.vehicles[0]).reason, 'wrong_source');
});

test('invalid starts and no remaining vehicle fail safely', () => {
  assert.equal(traceRoute(simple, simple.board, { start: [0,1], destination: 'bakery' }).reason, 'invalid_start');
  assert.equal(traceRoute(simple, simple.board, undefined).reason, 'no_vehicle');
});

test('four road turns and two switch changes restore the original board', () => {
  for (const level of LEVELS) {
    for (let i = 0; i < level.board.length; i++) {
      const tile = level.board[i];
      if (!['straight','bend','switch'].includes(tile.type)) continue;
      let state = createState(level);
      const times = tile.type === 'switch' ? 2 : 4;
      for (let n = 0; n < times; n++) state = turnTile(state, i);
      assert.deepEqual(state.board, level.board);
      assert.equal(state.moves, times);
    }
  }
});

test('all single-tile orientations trace safely without mutating the level', () => {
  for (const level of LEVELS) {
    const before = JSON.stringify(level);
    for (let i = 0; i < level.board.length; i++) {
      let state = createState(level);
      for (let n = 0; n < 4; n++) {
        state = turnTile(state, i);
        for (const vehicle of level.vehicles) {
          const result = traceRoute(level, state.board, vehicle);
          assert.ok(Array.isArray(result.path));
          assert.equal(typeof result.ok, 'boolean');
        }
      }
    }
    assert.equal(JSON.stringify(level), before);
  }
});

test('fresh state resets turns, deliveries and history without sharing mutable board tiles', () => {
  const first = createState(LEVELS[4]), second = createState(LEVELS[4]);
  first.board[LEVELS[4].junctionIndex].exits[0] = 3;
  assert.notDeepEqual(first.board, second.board);
  assert.deepEqual(second.board, LEVELS[4].board);
  assert.equal(second.nextVehicle, 0); assert.equal(second.moves, 0); assert.deepEqual(second.history, []);
});

test('undoing the entire solution restores exact initial state including both deliveries', () => {
  for (const level of LEVELS) {
    let state = createState(level);
    for (const action of level.solution) state = action.type === 'turn' ? turnTile(state, action.index) : dispatch(state, level).state;
    while (state.history.length) state = undo(state);
    assert.deepEqual(state, createState(level));
  }
});

test('progress version mismatch and unknown current levels reset safely', () => {
  assert.deepEqual(normalizeProgress({ version: 2, completed: [1], sound: true }, [1]), normalizeProgress(null, [1]));
  const progress = normalizeProgress({version: 1, completed: 'all', lastLevel: 2, bestMoves: {2: Number.MAX_SAFE_INTEGER}}, [1,2]);
  assert.deepEqual(progress.completed, []); assert.deepEqual(progress.bestMoves, {}); assert.equal(progress.lastLevel, 2);
});
