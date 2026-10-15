(function () {
  'use strict';

  // Source: src/rules.js
  /** Pure road rules. Directions clockwise: north, east, south, west. */
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const opposite = direction => (direction + 2) % 4;
  const indexOf = (row, col, width) => row * width + col;
  const isEditable = tile => {
    var _chainObject;
    return ['straight', 'bend', 'switch'].includes((_chainObject = tile, _chainObject === null || _chainObject === void 0 ? void 0 : _chainObject.type));
  };
  const mod4 = n => (n % 4 + 4) % 4;
  const copyBoard = board => board.map(tile => ({
    ...tile,
    ...(tile.exits ? {
      exits: [...tile.exits]
    } : {})
  }));
  function ports(tile) {
    if (!tile) return [];
    if (tile.type === 'straight') return [0, 2].map(n => mod4(n + tile.rotation));
    if (tile.type === 'bend') return [0, 1].map(n => mod4(n + tile.rotation));
    if (tile.type === 'switch') return [tile.stem, tile.exits[tile.switchState]];
    if (tile.type === 'source' || tile.type === 'destination') return [tile.direction];
    return [];
  }

  /** Trace one vehicle, including a safe path for a preview / animation. */
  function traceRoute(level, board, vehicle) {
    var _chainObject2;
    if (!vehicle) return {
      ok: false,
      reason: 'no_vehicle',
      path: [],
      at: null
    };
    let current = indexOf(...vehicle.start, level.width);
    const path = [current];
    const first = board[current];
    if ((_chainObject2 = first, _chainObject2 === null || _chainObject2 === void 0 ? void 0 : _chainObject2.type) !== 'source') return {
      ok: false,
      reason: 'invalid_start',
      path,
      at: current
    };
    let exit = first.direction;
    const visited = new Set();
    for (let step = 0; step <= board.length * 4; step++) {
      const row = Math.floor(current / level.width),
        col = current % level.width;
      const [dr, dc] = DIRS[exit];
      const nr = row + dr,
        nc = col + dc;
      if (nr < 0 || nr >= level.height || nc < 0 || nc >= level.width) {
        return {
          ok: false,
          reason: 'out_of_bounds',
          path,
          at: current
        };
      }
      const next = indexOf(nr, nc, level.width),
        tile = board[next],
        incoming = opposite(exit);
      if (!ports(tile).includes(incoming)) {
        var _chainObject3;
        return {
          ok: false,
          reason: (_chainObject3 = tile, _chainObject3 === null || _chainObject3 === void 0 ? void 0 : _chainObject3.type) === 'switch' ? 'switch_closed' : 'disconnected',
          path,
          at: next
        };
      }
      path.push(next);
      if (tile.type === 'destination') {
        const ok = tile.destination === vehicle.destination;
        return {
          ok,
          reason: ok ? 'arrived' : 'wrong_destination',
          path,
          at: next,
          destination: tile.destination
        };
      }
      if (tile.type === 'source') return {
        ok: false,
        reason: 'wrong_source',
        path,
        at: next
      };
      const key = `${next}:${incoming}`;
      if (visited.has(key)) return {
        ok: false,
        reason: 'loop',
        path,
        at: next
      };
      visited.add(key);
      const connections = ports(tile);
      if (connections.length !== 2) return {
        ok: false,
        reason: 'disconnected',
        path,
        at: next
      };
      exit = connections.find(p => p !== incoming);
      current = next;
    }
    return {
      ok: false,
      reason: 'loop',
      path,
      at: current
    };
  }
  function createState(level) {
    var _nullish, _nullish2;
    return {
      levelId: level.id,
      board: copyBoard(level.board),
      nextVehicle: 0,
      moves: 0,
      history: [],
      workSpent: 0,
      budget: (_nullish = level.budget, _nullish === null || _nullish === void 0 ? null : _nullish),
      incidents: 0,
      incidentLimit: (_nullish2 = level.incidentLimit, _nullish2 === null || _nullish2 === void 0 ? null : _nullish2),
      failed: null,
      revived: false,
      toolUsed: false
    };
  }
  function remember(state) {
    return {
      board: copyBoard(state.board),
      nextVehicle: state.nextVehicle,
      moves: state.moves
    };
  }
  function turnTile(state, index) {
    if (state.failed) return state;
    if (!Number.isInteger(index) || !isEditable(state.board[index])) return state;
    if (state.budget !== null && state.workSpent >= state.budget) return {
      ...state,
      failed: 'budget'
    };
    const board = copyBoard(state.board),
      tile = board[index];
    if (tile.type === 'switch') tile.switchState = tile.switchState === 0 ? 1 : 0;else tile.rotation = mod4(tile.rotation + 1);
    return {
      ...state,
      board,
      moves: state.moves + 1,
      workSpent: state.budget === null ? 0 : state.workSpent + 1,
      history: [...state.history, remember(state)]
    };
  }
  function dispatch(state, level) {
    if (state.levelId !== level.id) return {
      state,
      result: {
        ok: false,
        reason: 'wrong_level',
        path: []
      }
    };
    if (state.failed) return {
      state,
      result: {
        ok: false,
        reason: state.failed,
        path: []
      }
    };
    const result = traceRoute(level, state.board, level.vehicles[state.nextVehicle]);
    if (!result.ok) {
      if (state.incidentLimit === null) return {
        state,
        result
      };
      const incidents = state.incidents + 1;
      return {
        state: {
          ...state,
          incidents,
          failed: incidents >= state.incidentLimit ? 'incidents' : null
        },
        result
      };
    }
    return {
      result,
      state: {
        ...state,
        nextVehicle: state.nextVehicle + 1,
        history: [...state.history, remember(state)]
      }
    };
  }
  function undo(state) {
    if (state.failed || !state.history.length) return state;
    const previous = state.history.at(-1);
    return {
      ...state,
      ...previous,
      board: copyBoard(previous.board),
      history: state.history.slice(0, -1)
    };
  }
  const isComplete = (state, level) => state.nextVehicle >= level.vehicles.length;
  function starsFor(moves, par) {
    return moves <= par ? 3 : moves <= par + 6 ? 2 : 1;
  }

  /** A marked modular road panel may be craned into an empty foundation. */
  function movePanel(state, from, to) {
    var _chainObject4, _chainObject5;
    if (state.failed || from === to || !Number.isInteger(from) || !Number.isInteger(to)) return state;
    const tile = state.board[from];
    if (!(_chainObject4 = tile, _chainObject4 === null || _chainObject4 === void 0 ? void 0 : _chainObject4.movable) || !['straight', 'bend'].includes(tile.type) || (_chainObject5 = state.board[to], _chainObject5 === null || _chainObject5 === void 0 ? void 0 : _chainObject5.type) !== 'socket') return state;
    if (state.budget !== null && state.workSpent >= state.budget) return {
      ...state,
      failed: 'budget'
    };
    const board = copyBoard(state.board);
    board[to] = {
      ...tile
    };
    board[from] = {
      type: 'socket'
    };
    return {
      ...state,
      board,
      moves: state.moves + 1,
      workSpent: state.workSpent + 1,
      history: [...state.history, remember(state)]
    };
  }
  function reviveState(state) {
    if (!state.failed || state.revived) return state;
    return {
      ...state,
      failed: null,
      revived: true,
      budget: state.budget === null ? null : Math.max(state.budget, state.workSpent) + 10,
      incidents: 0,
      history: []
    };
  }
  function useWorkTool(state) {
    if (state.failed || state.toolUsed || state.budget === null) return state;
    return {
      ...state,
      toolUsed: true,
      budget: state.budget + 6
    };
  }
  /** Version 1 saves migrate without losing clears. No server / money economy. */
  function normalizeProgress(value, levelIds) {
    const safe = {
      version: 2,
      completed: [],
      bestMoves: {},
      sound: false,
      lastLevel: 1,
      coins: 0,
      pendingPurchase: null
    };
    if (!value || typeof value !== 'object' || ![1, 2].includes(value.version)) return safe;
    safe.completed = [...new Set(Array.isArray(value.completed) ? value.completed.filter(id => levelIds.includes(id)) : [])];
    for (const id of safe.completed) {
      var _chainObject6;
      const n = (_chainObject6 = value.bestMoves, _chainObject6 === null || _chainObject6 === void 0 ? void 0 : _chainObject6[id]);
      if (Number.isInteger(n) && n >= 0 && n < 100000) safe.bestMoves[id] = n;
    }
    safe.sound = value.sound === true;
    if (levelIds.includes(value.lastLevel)) safe.lastLevel = value.lastLevel;
    safe.coins = value.version === 1 ? safe.completed.length * 20 : Number.isInteger(value.coins) && value.coins >= 0 ? Math.min(value.coins, 12000) : 0;
    const pending = value.pendingPurchase;
    if (value.version === 2 && pending && typeof pending === 'object' && typeof pending.token === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(pending.token) && levelIds.includes(pending.levelId) && typeof pending.workTool === 'boolean' && typeof pending.revive === 'boolean' && (pending.workTool || pending.revive)) safe.pendingPurchase = {
      token: pending.token,
      levelId: pending.levelId,
      workTool: pending.workTool,
      revive: pending.revive
    };
    return safe;
  }
  function awardVictory(progress, level, moves) {
    var _nullish3;
    const first = !progress.completed.includes(level.id);
    return {
      ...progress,
      pendingPurchase: null,
      completed: first ? [...progress.completed, level.id] : [...progress.completed],
      bestMoves: {
        ...progress.bestMoves,
        [level.id]: Math.min((_nullish3 = progress.bestMoves[level.id], _nullish3 === null || _nullish3 === void 0 ? Infinity : _nullish3), moves)
      },
      coins: Math.min(12000, progress.coins + (first ? 20 : 0))
    };
  }
  function spendCoins(progress, amount) {
    if (!Number.isInteger(amount) || amount <= 0 || progress.coins < amount) return null;
    return {
      ...progress,
      coins: progress.coins - amount
    };
  }

  /** Coins are reserved for the active run; only a completed run consumes them.
   * Dropping/reloading an unfinished run refunds the reservation exactly once.
   * The complete deduction plus receipt must be persisted before giving an effect.
   */
  function pendingPurchaseAmount(progress) {
    const p = progress.pendingPurchase;
    return p ? (p.workTool ? 12 : 0) + (p.revive ? 20 : 0) : 0;
  }
  function refundPendingPurchase(progress) {
    const amount = pendingPurchaseAmount(progress);
    return amount ? {
      ...progress,
      coins: Math.min(12000, progress.coins + amount),
      pendingPurchase: null
    } : progress;
  }
  function reserveRunPurchase(progress, token, levelId, kind) {
    var _chainObject7, _chainObject8;
    if (!['workTool', 'revive'].includes(kind) || typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(token) || !Number.isInteger(levelId) || levelId < 1 || levelId > 50) return null;
    const existing = progress.pendingPurchase;
    if (existing && (existing.token !== token || existing.levelId !== levelId || existing[kind])) return null;
    const paid = spendCoins(progress, kind === 'workTool' ? 12 : 20);
    if (!paid) return null;
    return {
      ...paid,
      pendingPurchase: {
        token,
        levelId,
        workTool: (_chainObject7 = existing, _chainObject7 === null || _chainObject7 === void 0 ? void 0 : _chainObject7.workTool) === true,
        revive: (_chainObject8 = existing, _chainObject8 === null || _chainObject8 === void 0 ? void 0 : _chainObject8.revive) === true,
        [kind]: true
      }
    };
  }

  // Source: src/levels.js

  const routeDirection = (from, to) => {
    const dr = to[0] - from[0],
      dc = to[1] - from[1];
    if (Math.abs(dr) + Math.abs(dc) !== 1) throw new Error('Route cells must be adjacent');
    return dr === -1 ? 0 : dc === 1 ? 1 : dr === 1 ? 2 : 3;
  };
  const names = {
    bakery: '面包店',
    garden: '花园'
  };
  const templates = [{
    title: '第一份早餐',
    district: '晨光街',
    size: 4,
    note: '点一下道路，让它顺时针转 90°。把黄色小车送到面包店。',
    routes: [[[3, 0], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3]]]
  }, {
    title: '拐个弯就到了',
    district: '微风巷',
    size: 4,
    note: '先看道路两端，再旋转。直路转两次会回到原来的连接方向。',
    routes: [[[3, 0], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 2], [0, 3]]]
  }, {
    title: '绕过小公园',
    district: '三叶公园',
    size: 5,
    note: '不是越近越好。顺着弯道，为早餐绕一条舒服的路。',
    routes: [[[4, 0], [4, 1], [3, 1], [2, 1], [2, 2], [3, 2], [3, 3], [2, 3], [1, 3], [1, 4]]]
  }, {
    title: '小镇慢慢醒来',
    district: '彩虹社区',
    size: 5,
    note: '长路线也不着急。点“路线预览”，看看小车会在哪里停住。',
    routes: [[[4, 0], [3, 0], [2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4]]]
  }, {
    title: '一个路口，两份心意',
    district: '双车接力 · 初见',
    size: 5,
    note: '新玩法：两辆车依次出发！先送面包，再点橙色岔口换方向，把花送到花园。',
    junction: [3, 2],
    routes: [[[4, 0], [3, 0], [3, 1], [3, 2], [2, 2], [1, 2]], [[4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4]]]
  }, {
    title: '早餐向北，花向南',
    district: '双车接力 · 分流',
    size: 5,
    note: '共用一段路，不等于共用目的地。每辆车出发前，都可以重新调整道路。',
    junction: [2, 2],
    routes: [[[4, 0], [4, 1], [3, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [0, 4]], [[4, 0], [4, 1], [3, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3], [4, 4]]]
  }, {
    title: '穿过社区的礼物',
    district: '双车接力 · 回环',
    size: 5,
    note: '修好的共用路段会保留。第一辆车到达后，只调整第二条支路就好。',
    junction: [2, 2],
    routes: [[[4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [0, 4]], [[4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4]]]
  }, {
    title: '今天去远一点',
    district: '双车接力 · 新城区',
    size: 6,
    note: '小镇变大了，但诀窍没变：先修共用道路，再为每辆车切换目的地。',
    junction: [3, 3],
    routes: [[[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2], [0, 2], [0, 3], [0, 4]], [[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5]]]
  }, {
    title: '不走错的约定',
    district: '双车接力 · 山坡',
    size: 6,
    note: '留心车身颜色：黄色送面包，紫色送花。送到另一家也不算完成哦。',
    junction: [2, 3],
    routes: [[[5, 0], [4, 0], [3, 0], [3, 1], [2, 1], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 3], [0, 4], [0, 5]], [[5, 0], [4, 0], [3, 0], [3, 1], [2, 1], [2, 2], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [5, 3], [5, 4], [5, 5]]]
  }, {
    title: '让整座小镇动起来',
    district: '双车接力 · 毕业日',
    size: 6,
    note: '最后一班接力！没有倒计时。用最少的转动，让两份心意都准时到家。',
    junction: [3, 2],
    routes: [[[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [1, 5]], [[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [3, 3], [3, 4], [2, 4], [2, 5], [3, 5], [4, 5], [5, 5]]]
  }];
  function makeLevel(spec, index) {
    const id = index + 1,
      width = spec.size;
    const board = Array.from({
      length: width * width
    }, (_, i) => ({
      type: 'park',
      decor: (i * 7 + id * 3) % 5
    }));
    const solved = new Map();
    const junctionIndex = spec.junction ? indexOf(...spec.junction, width) : -1;
    spec.routes.forEach((route, routeIndex) => {
      const destination = routeIndex === 0 ? 'bakery' : 'garden';
      route.forEach((cell, step) => {
        const pos = indexOf(...cell, width);
        if (step === 0) {
          board[pos] = {
            type: 'source',
            direction: routeDirection(cell, route[1])
          };
          return;
        }
        if (step === route.length - 1) {
          board[pos] = {
            type: 'destination',
            destination,
            direction: routeDirection(cell, route[step - 1])
          };
          return;
        }
        const incoming = routeDirection(cell, route[step - 1]),
          outgoing = routeDirection(cell, route[step + 1]);
        if (pos === junctionIndex) {
          if (routeIndex === 0) board[pos] = {
            type: 'switch',
            stem: incoming,
            exits: [outgoing],
            switchState: 1
          };else board[pos].exits.push(outgoing);
          return;
        }
        const type = opposite(incoming) === outgoing ? 'straight' : 'bend';
        const rotation = [0, 1, 2, 3].find(r => ports({
          type,
          rotation: r
        }).every(p => [incoming, outgoing].includes(p)));
        const existing = solved.get(pos);
        if (existing && (existing.type !== type || existing.rotation !== rotation)) throw new Error(`Conflicting route ${id}:${pos}`);
        solved.set(pos, {
          type,
          rotation
        });
      });
    });
    const solution = [];
    for (const [pos, tile] of solved) {
      const scramble = (pos * 3 + id) % 3 + 1;
      board[pos] = {
        ...tile,
        rotation: (tile.rotation + scramble) % 4
      };
      const turns = tile.type === 'straight' ? scramble % 2 : (4 - scramble) % 4;
      for (let n = 0; n < turns; n++) solution.push({
        type: 'turn',
        index: pos
      });
    }
    if (junctionIndex >= 0) solution.push({
      type: 'turn',
      index: junctionIndex
    });
    solution.push({
      type: 'dispatch'
    });
    if (spec.routes.length === 2) solution.push({
      type: 'turn',
      index: junctionIndex
    }, {
      type: 'dispatch'
    });
    const vehicles = spec.routes.map((route, i) => ({
      id: `${id}-${i}`,
      start: [...route[0]],
      destination: i === 0 ? 'bakery' : 'garden',
      name: i === 0 ? '早餐小车' : '送花小车',
      cargo: i === 0 ? '新鲜面包' : '一车鲜花',
      color: i === 0 ? '#f5ae35' : '#9b7be8',
      destinationName: names[i === 0 ? 'bakery' : 'garden']
    }));
    return {
      id,
      title: spec.title,
      district: spec.district,
      note: spec.note,
      width,
      height: width,
      board,
      vehicles,
      solution,
      par: solution.filter(a => a.type === 'turn').length,
      routes: spec.routes,
      junctionIndex
    };
  }

  // Forty distinct, fixed construction drawings. Routes were generated offline,
  // then frozen and reference-replayed. No random difficulty or ad-dependent layouts.
  const campaignDrawings = [{
    "n": 5,
    "routes": [[[4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [2, 1], [3, 1], [4, 1]]]
  }, {
    "n": 5,
    "routes": [[[4, 0], [4, 1], [3, 1], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [0, 2], [0, 3], [0, 4]]]
  }, {
    "n": 5,
    "routes": [[[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3]]]
  }, {
    "n": 5,
    "routes": [[[4, 0], [3, 0], [3, 1], [4, 1], [4, 2], [3, 2], [2, 2], [2, 1], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2]]]
  }, {
    "n": 5,
    "routes": [[[4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [3, 4], [4, 4], [4, 3], [4, 2]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [2, 3], [2, 4], [3, 4], [3, 5], [4, 5], [5, 5], [5, 4], [4, 4], [4, 3]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 3], [4, 3]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [4, 2], [5, 2], [5, 3], [4, 3], [4, 4], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [2, 4], [3, 4], [3, 3], [3, 2]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [4, 2], [3, 2], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [4, 4], [3, 4], [2, 4], [2, 5], [1, 5], [1, 4], [0, 4], [0, 3], [1, 3], [2, 3]]]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4]], [[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [3, 1], [3, 2], [2, 2], [2, 3], [3, 3], [3, 4], [3, 5], [2, 5]]],
    "junction": [3, 0]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3]], [[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [2, 1], [2, 0], [1, 0], [0, 0]]],
    "junction": [1, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [2, 0], [2, 1], [1, 1], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 3]], [[5, 0], [4, 0], [3, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 1], [4, 1]]],
    "junction": [2, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [5, 4], [4, 4], [4, 5], [3, 5]], [[5, 0], [4, 0], [4, 1], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1]]],
    "junction": [3, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [3, 3], [4, 3], [5, 3], [5, 4], [4, 4], [4, 5], [3, 5], [2, 5], [2, 4]], [[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [3, 3], [2, 3], [2, 2], [1, 2], [1, 3], [1, 4], [0, 4]]],
    "junction": [3, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [4, 4], [4, 3], [3, 3], [2, 3], [2, 2]], [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [2, 4], [1, 4]]],
    "junction": [4, 5]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [2, 5], [1, 5]], [[5, 0], [4, 0], [3, 0], [2, 0], [2, 1], [3, 1], [3, 2], [3, 3]]],
    "junction": [2, 0]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [3, 4]], [[5, 0], [4, 0], [3, 0], [3, 1], [4, 1], [5, 1], [5, 2], [4, 2], [4, 3], [3, 3], [2, 3]]],
    "junction": [5, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1], [1, 2], [2, 2], [2, 3], [1, 3]], [[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [3, 3], [4, 3], [5, 3], [5, 4]]],
    "junction": [3, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [4, 4], [3, 4], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1]], [[5, 0], [5, 1], [5, 2], [5, 3], [4, 3], [4, 2], [3, 2], [3, 1], [3, 0], [2, 0]]],
    "junction": [5, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [1, 3]], [[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5]]],
    "junction": [5, 4]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3]], [[5, 0], [4, 0], [3, 0], [3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]]],
    "junction": [2, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4]], [[5, 0], [5, 1], [4, 1], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]]],
    "junction": [3, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3]], [[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [2, 1], [2, 2], [3, 2], [3, 1]]],
    "junction": [2, 0]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3]], [[5, 0], [4, 0], [4, 1], [3, 1], [2, 1], [2, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2], [3, 3], [2, 3]]],
    "junction": [1, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [3, 5], [3, 4], [2, 4], [2, 3], [1, 3]], [[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [4, 2], [3, 2], [3, 1], [3, 0]]],
    "junction": [5, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [4, 4], [3, 4], [3, 5], [2, 5], [2, 4]], [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [4, 5], [4, 4], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3]]],
    "junction": [4, 4]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [0, 2]], [[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 4], [1, 4]]],
    "junction": [3, 0]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [4, 2], [4, 3], [3, 3], [2, 3], [2, 2], [1, 2], [1, 3], [1, 4]], [[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [4, 2], [4, 3], [3, 3], [3, 4], [4, 4], [5, 4], [5, 3]]],
    "junction": [3, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4]], [[5, 0], [4, 0], [4, 1], [5, 1], [5, 2], [4, 2], [3, 2], [2, 2], [2, 1], [2, 0], [3, 0], [3, 1]]],
    "junction": [2, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [4, 4], [4, 5]], [[5, 0], [5, 1], [5, 2], [4, 2], [4, 1], [3, 1], [3, 0], [4, 0]]],
    "junction": [4, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [3, 1], [3, 0], [2, 0], [2, 1], [1, 1], [1, 0], [0, 0], [0, 1], [0, 2]], [[5, 0], [5, 1], [5, 2], [4, 2], [4, 3], [3, 3], [3, 4], [4, 4], [4, 5]]],
    "junction": [4, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 4], [1, 4], [2, 4], [2, 5]], [[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [2, 2], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2]]],
    "junction": [2, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [4, 1], [4, 2], [3, 2], [3, 3], [3, 4], [4, 4], [4, 5], [5, 5]], [[5, 0], [4, 0], [3, 0], [3, 1], [4, 1], [4, 2], [3, 2], [3, 3], [2, 3], [2, 4], [1, 4], [0, 4], [0, 3]]],
    "junction": [3, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [1, 4]], [[5, 0], [5, 1], [4, 1], [3, 1], [3, 2], [2, 2], [1, 2], [1, 1], [2, 1], [2, 0], [1, 0], [0, 0]]],
    "junction": [1, 1]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [5, 3], [4, 3], [4, 4], [3, 4], [2, 4], [2, 5], [3, 5], [4, 5], [5, 5]], [[5, 0], [5, 1], [5, 2], [5, 3], [4, 3], [4, 4], [3, 4], [3, 3], [3, 2], [3, 1], [4, 1]]],
    "junction": [3, 4]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [5, 2], [4, 2], [4, 3], [4, 4], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5], [0, 5]], [[5, 0], [5, 1], [5, 2], [4, 2], [4, 1], [4, 0], [3, 0], [2, 0], [2, 1], [3, 1], [3, 2]]],
    "junction": [4, 2]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [4, 1], [4, 2], [4, 3], [3, 3], [3, 2], [2, 2], [2, 3], [2, 4], [1, 4], [1, 3]], [[5, 0], [4, 0], [4, 1], [4, 2], [4, 3], [3, 3], [3, 4], [4, 4], [5, 4], [5, 5], [4, 5], [3, 5], [2, 5]]],
    "junction": [3, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [1, 5]], [[5, 0], [4, 0], [3, 0], [3, 1], [3, 2], [3, 3], [4, 3], [5, 3], [5, 2], [4, 2], [4, 1], [5, 1]]],
    "junction": [5, 3]
  }, {
    "n": 6,
    "routes": [[[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [0, 2], [0, 1], [0, 0]], [[5, 0], [5, 1], [4, 1], [4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]]],
    "junction": [1, 1]
  }];
  const campaignNames = ["夜班开工", "沿河抢修", "高架引道", "环城匝道", "港区绕行", "错峰运输", "雨后便道", "隧道出口", "老街接驳", "东岸交付", "双线调度", "共用咽喉", "岔口窗口", "物流节点", "工厂换班", "仓区绕行", "东西接力", "滨河分流", "立交之下", "环港调度", "吊装初试", "拼装便道", "空槽接续", "路板回收", "桥面拼接", "借道施工", "临时栈桥", "钢板换位", "双段接驳", "模组工场", "先通后借", "一板两用", "回收接力", "施工封锁", "单线抢通", "紧急换铺", "逆向调度", "夜间决战", "最后工时", "城市复线"];
  function makeCampaign(drawing, offset) {
    const id = offset + 11,
      chapter = Math.floor((id - 1) / 10) + 1;
    const note = chapter === 2 ? '旋转消耗工时，撤销不退工时；预览免费，发车前检查断点。' : chapter === 3 ? '先修共用道路，再切换岔口依次运输。错误发车会损失故障容错。' : chapter === 4 ? '点吊装，再点带螺栓的路板与空槽。搬运消耗1工时，路板可旋转。' : '先交付面包，再把旧支路的螺栓路板吊到鲜花支路；有限工时要规划。';
    const level = makeLevel({
      size: drawing.n,
      routes: drawing.routes,
      junction: drawing.junction,
      title: campaignNames[offset],
      district: ['', '入门街区', '限时施工', '双线物流', '模组工场', '旧路新用'][chapter],
      note
    }, id - 1);
    const initialTurns = level.solution.slice(0, level.solution.findIndex(a => a.type === 'dispatch'));
    const solvedBoard = level.board.map(t => ({
      ...t,
      exits: t.exits ? [...t.exits] : undefined
    }));
    for (const a of initialTurns) {
      const t = solvedBoard[a.index];
      if (t.type === 'switch') t.switchState = 1 - t.switchState;else t.rotation = (t.rotation + 1) % 4;
    }
    let solution = [...initialTurns, {
      type: 'dispatch'
    }];
    if (level.vehicles.length === 2) solution.push({
      type: 'turn',
      index: level.junctionIndex
    }, {
      type: 'dispatch'
    });
    level.transfers = [];
    if (chapter === 4) {
      const count = id < 35 ? 1 : 2;
      const candidates = level.routes[0].slice(1, -1).map(c => indexOf(...c, level.width)).filter(i => ['straight', 'bend'].includes(level.board[i].type));
      const stock = level.board.map((t, i) => t.type === 'park' ? i : -1).filter(i => i >= 0);
      const moves = [];
      for (let k = 0; k < count; k++) {
        const to = candidates[(k * 3 + offset) % candidates.length],
          from = stock[k];
        level.board[from] = {
          ...level.board[to],
          movable: true
        };
        level.board[to] = {
          type: 'socket'
        };
        level.transfers.push({
          from,
          to,
          phase: 0
        });
        moves.push({
          type: 'move',
          from,
          to
        });
      }
      solution = [...moves, ...solution];
    }
    if (chapter === 5) {
      const first = new Set(level.routes[0].map(c => indexOf(...c, level.width))),
        second = new Set(level.routes[1].map(c => indexOf(...c, level.width)));
      const donors = [...first].filter(i => !second.has(i) && ['straight', 'bend'].includes(level.board[i].type));
      const gaps = [...second].filter(i => !first.has(i) && ['straight', 'bend'].includes(level.board[i].type));
      const needed = id < 46 ? 1 : 2,
        used = new Set(),
        moves = [];
      for (const to of gaps) {
        const from = donors.find(i => !used.has(i) && level.board[i].type === level.board[to].type);
        if (from === undefined) continue;
        used.add(from);
        level.board[from].movable = true;
        level.board[to] = {
          type: 'socket'
        };
        level.transfers.push({
          from,
          to,
          phase: 1
        });
        moves.push({
          type: 'move',
          from,
          to
        });
        const actual = {
            ...solvedBoard[from]
          },
          target = ports(solvedBoard[to]);
        for (let n = 0; n < 4 && !target.every(p => ports(actual).includes(p)); n++) {
          moves.push({
            type: 'turn',
            index: to
          });
          actual.rotation = (actual.rotation + 1) % 4;
        }
        if (level.transfers.length === needed) break;
      }
      if (!level.transfers.length) throw Error(`No reusable road panel in ${id}`);
      const holes = new Set(level.transfers.map(t => t.to));
      solution = [...initialTurns.filter(a => !holes.has(a.index)), {
        type: 'dispatch'
      }, ...moves, {
        type: 'turn',
        index: level.junctionIndex
      }, {
        type: 'dispatch'
      }];
    }
    level.solution = solution;
    level.par = solution.filter(a => a.type !== 'dispatch').length;
    const slack = chapter === 2 ? Math.max(4, 8 - (id - 11)) : chapter === 3 ? Math.max(3, 6 - (id - 21)) : chapter === 4 ? Math.max(2, 5 - (id - 31)) : Math.max(0, 3 - Math.floor((id - 41) / 3));
    level.budget = level.par + slack;
    level.incidentLimit = id >= 46 ? 1 : id >= 31 ? 2 : 3;
    level.chapter = chapter;
    level.reward = 20;
    return level;
  }
  const LEVELS = [...templates.map(makeLevel), ...campaignDrawings.map(makeCampaign)];
  const CHAPTERS = ['入门街区', '限量施工', '双线调度', '模组吊装', '旧路新用'];

  // Source: src/canvas-game.js

  // This module is platform-independent: no window, document, CSS, network or SDK globals.
  function startGame(platform) {
    var _chainObject10, _chainFunction3, _chainObject25;
    const ctx = platform.canvas.getContext('2d');
    let W = 400,
      H = 800,
      layout = {};
    const KEY = 'fix-the-road-v1';
    const colors = {
      paper: '#202932',
      ink: '#edf4ed',
      muted: '#9db7c4',
      purple: '#d3a1ff',
      green: '#67e5cb',
      yellow: '#ffca51'
    };
    const fontStack = '"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
    let saved,
      lastStoredRaw,
      storageOK = true,
      storageConflict = false,
      storageUncertain = false;
    try {
      lastStoredRaw = platform.storage.getItem(KEY);
      saved = JSON.parse(lastStoredRaw);
    } catch (_ignoredError) {
      saved = null;
      storageOK = false;
    }
    let progress = normalizeProgress(saved, LEVELS.map(l => l.id));
    const startupRefund = pendingPurchaseAmount(progress);
    if (startupRefund) {
      progress = refundPendingPurchase(progress);
      persist(progress);
    } // One atomic reconciliation, not a new reward.
    let level = LEVELS.find(l => l.id === progress.lastLevel) || LEVELS[0],
      state = createState(level);
    let preview = false,
      modal = null,
      message = startupRefund ? storageOK ? `上一局未完成，已退回${startupRefund}金币。` : `上局${startupRefund}金币已恢复，退款待保存。` : '',
      hint = -1,
      hits = [],
      animation = null,
      frameId = null,
      previousTime = null,
      paused = false,
      destroyed = false;
    let transform = {
        scale: 1,
        x: 0,
        y: 0
      },
      gesture = null;
    let crane = false,
      selectedPanel = -1,
      mapPage = Math.floor((level.id - 1) / 10),
      runId = 1,
      adPending = false,
      lastRewardId = null,
      winAward = 0;
    let purchaseToken = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const rewardService = platform.rewards;
    function failIfNeeded() {
      if (state.failed) {
        modal = 'failed';
        crane = false;
        selectedPanel = -1;
      }
      schedule();
    }
    function cancelReward() {
      var _chainObject9, _chainFunction;
      runId++;
      adPending = false;
      _chainObject9 = rewardService, _chainObject9 === null || _chainObject9 === void 0 ? void 0 : (_chainFunction = _chainObject9.cancel, _chainFunction === null || _chainFunction === void 0 ? void 0 : _chainFunction.call(_chainObject9));
    }
    async function requestRevive() {
      var _chainObject0, _chainFunction2, _chainObject1;
      if (!state.failed || state.revived || adPending) return;
      if (!(_chainObject0 = rewardService, _chainObject0 === null || _chainObject0 === void 0 ? void 0 : (_chainFunction2 = _chainObject0.getState, _chainFunction2 === null || _chainFunction2 === void 0 ? void 0 : (_chainObject1 = _chainFunction2.call(_chainObject0), _chainObject1.available)))) {
        message = '广告功能仅预留，当前不可用。可以免费重开。';
        schedule();
        return;
      }
      const expectedRun = runId;
      adPending = true;
      gesture = null;
      modal = rewardService.getState().mode === 'mock' ? 'mock-ad' : 'ad-wait';
      schedule();
      let result;
      try {
        result = await rewardService.request({
          placement: 'revive',
          context: {
            runId: expectedRun,
            levelId: level.id
          }
        });
      } catch (_ignoredError2) {
        result = {
          status: 'error'
        };
      }
      if (destroyed || expectedRun !== runId) return;
      adPending = false;
      if (result.status === 'completed' && result.requestId && result.requestId !== lastRewardId && state.failed && !state.revived) {
        lastRewardId = result.requestId;
        state = reviveState(state);
        modal = null;
        message = '施工支援到位：+10工时，故障容错恢复。本局只可复活一次。';
      } else {
        modal = 'failed';
        message = result.status === 'cancelled' ? '未完成观看，没有发放奖励。' : result.status === 'unavailable' ? '暂无可用广告，没有发放奖励。' : '广告异常，没有发放奖励。';
      }
      previousTime = null;
      schedule();
    }
    function payFor(kind) {
      const paid = reserveRunPurchase(progress, purchaseToken, level.id, kind);
      if (!paid) {
        message = '金币不足；仍可免费重开。';
        schedule();
        return false;
      }
      // Never grant the temporary benefit unless its debit + receipt are durable.
      if (!persist(paid)) {
        message = storageConflict ? '存档在其他页面更新，请刷新；本次未扣金币。' : storageUncertain ? '保存结果未确认，未给道具；重开页面核对退款。' : '无法保存，本次未扣金币；仍可免费重开。';
        schedule();
        return false;
      }
      progress = paid;
      return true;
    }
    function coinRevive() {
      if (!state.failed || state.revived || adPending) return;
      if (!payFor('revive')) return;
      state = reviveState(state);
      modal = null;
      message = '预留20金币复工：+10工时；未通关重开/退出退回。';
      schedule();
    }
    function buyWork() {
      if (state.failed || state.toolUsed || state.budget === null || isComplete(state, level) || animation || adPending) return;
      if (!payFor('workTool')) return;
      state = useWorkTool(state);
      message = '预留12金币：+6工时；未通关重开/退出退回。';
      schedule();
    }
    let sidebarState = (_chainObject10 = platform.sidebar, _chainObject10 === null || _chainObject10 === void 0 ? void 0 : (_chainFunction3 = _chainObject10.getState, _chainFunction3 === null || _chainFunction3 === void 0 ? void 0 : _chainFunction3.call(_chainObject10))) || null;
    platform.audio.setMuted(!progress.sound);
    const currentVehicle = () => level.vehicles[state.nextVehicle];
    function persist(value) {
      const raw = JSON.stringify(value);
      let attempted = false;
      try {
        const current = platform.storage.getItem(KEY);
        // An older tab must not overwrite a newer refund or settlement.
        if (current !== (lastStoredRaw === undefined ? null : lastStoredRaw)) {
          storageOK = false;
          storageConflict = true;
          storageUncertain = false;
          return false;
        }
        attempted = true;
        platform.storage.setItem(KEY, raw);
        if (platform.storage.getItem(KEY) !== raw) {
          storageOK = false;
          storageUncertain = true;
          return false;
        }
        lastStoredRaw = raw;
        storageOK = true;
        storageConflict = false;
        storageUncertain = false;
        return true;
      } catch (_ignoredError3) {
        // A write-then-throw host is committed only after exact receipt readback.
        try {
          const observed = platform.storage.getItem(KEY);
          if (observed === raw) {
            lastStoredRaw = raw;
            storageOK = true;
            storageConflict = false;
            storageUncertain = false;
            return true;
          }
          storageUncertain = attempted && observed !== lastStoredRaw;
        } catch (_ignoredError4) {
          storageUncertain = attempted;
        }
        storageOK = false;
        return false;
      }
    }
    function save() {
      return persist(progress);
    }
    function sound(name) {
      if (progress.sound) {
        try {
          platform.audio.play(name);
        } catch (_ignoredError5) {}
      }
    }
    function round(x, y, w, h, r, fill, stroke) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    function text(value, x, y, size = 14, color = colors.ink, align = 'left', weight = '400') {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${fontStack}`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x, y);
    }
    function wrap(value, x, y, maxWidth, size = 12, lineHeight = 19, color = colors.muted, maxLines = 3) {
      ctx.font = `400 ${size}px ${fontStack}`;
      let line = '',
        lines = 0;
      for (const ch of String(value)) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          text(line, x, y + lines * lineHeight, size, color);
          lines++;
          line = '';
          if (lines >= maxLines) return;
        }
        line += ch;
      }
      if (line) text(line, x, y + lines * lineHeight, size, color);
    }
    function circle(x, y, r, color) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    function path(points, color, width, dashed = false) {
      var _callReceiver, _chainFunction4, _callReceiver2, _chainFunction5;
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      _callReceiver = ctx, _chainFunction4 = _callReceiver.setLineDash, _chainFunction4 === null || _chainFunction4 === void 0 ? void 0 : _chainFunction4.call(_callReceiver, dashed ? [5, 6] : []);
      ctx.stroke();
      _callReceiver2 = ctx, _chainFunction5 = _callReceiver2.setLineDash, _chainFunction5 === null || _chainFunction5 === void 0 ? void 0 : _chainFunction5.call(_callReceiver2, []);
    }
    function button(id, label, x, y, w, h, fn, {
      fill = '#1c4054',
      color = colors.ink,
      disabled = false,
      size = 13
    } = {}) {
      ctx.globalAlpha = disabled ? 0.38 : 1;
      round(x, y + 3, w, h, 3, '#061c2a');
      round(x, y, w, h, 3, fill, fill === colors.yellow ? '#ffe29a' : '#598394');
      text(label, x + w / 2, y + h / 2, size, color, 'center', '700');
      ctx.globalAlpha = 1;
      if (!disabled) hits.push({
        id,
        x,
        y,
        w,
        h,
        fn
      });
    }
    function schedule() {
      if (!destroyed && !paused && frameId === null) frameId = platform.requestFrame(drawFrame);
    }
    function notify(value) {
      message = value;
      schedule();
    }
    async function openSidebar() {
      var _chainObject11;
      if (!platform.sidebar || !(_chainObject11 = sidebarState, _chainObject11 === null || _chainObject11 === void 0 ? void 0 : _chainObject11.available) || sidebarState.pending) return;
      try {
        const opened = await platform.sidebar.navigate();
        if (!destroyed && !opened) notify('暂时无法打开侧边栏，请稍后再试。');
      } catch (_ignoredError6) {
        if (!destroyed) notify('暂时无法打开侧边栏，请稍后再试。');
      }
    }
    function load(id) {
      const refund = pendingPurchaseAmount(progress);
      progress = refundPendingPurchase(progress);
      cancelReward();
      purchaseToken = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${runId}`;
      crane = false;
      selectedPanel = -1;
      winAward = 0;
      level = LEVELS.find(l => l.id === id) || LEVELS[0];
      state = createState(level);
      animation = null;
      previousTime = null;
      preview = false;
      modal = null;
      message = refund ? `未完成局已退回${refund}金币。` : '';
      hint = -1;
      mapPage = Math.floor((level.id - 1) / 10);
      progress.lastLevel = level.id;
      save();
      schedule();
    }
    function routeMessage(result) {
      if (result.ok) return '路线接通了！这辆车可以放心出发。';
      if (result.reason === 'wrong_destination') return '送错目的地啦！点橙色岔口换个方向。';
      if (result.reason === 'switch_closed') return '在岔口停住了。点橙色路口切换方向。';
      if (result.reason === 'out_of_bounds') return '小车要开出小镇啦。把道路转回镇里。';
      if (result.reason === 'loop') return '小车在绕圈。转动道路，接向目的地。';
      return '这段路还没接上。转动道路，让两端对齐。';
    }
    function send() {
      if (animation || state.failed || adPending) return;
      if (isComplete(state, level)) {
        modal = 'win';
        schedule();
        return;
      }
      const outcome = dispatch(state, level);
      animation = {
        outcome,
        vehicle: currentVehicle(),
        elapsed: 0,
        duration: Math.max(400, (outcome.result.path.length - 1) * 190 + (outcome.result.ok ? 420 : 1150))
      };
      previousTime = null;
      preview = true;
      hint = -1;
      message = '小车出发了！';
      sound('send');
      schedule();
    }
    function finishDelivery() {
      const {
        outcome
      } = animation;
      animation = null;
      previousTime = null;
      if (outcome.result.ok) {
        state = outcome.state;
        preview = false;
        sound('win');
        if (isComplete(state, level)) {
          winAward = progress.completed.includes(level.id) ? 0 : 20;
          progress = awardVictory(progress, level, state.moves);
          save();
          modal = 'win';
          message = '运输已验收，道路恢复通行。';
        } else message = level.chapter === 5 ? '首车交付。吊起旧支路的螺栓路板，补上鲜花支路空槽。' : '首车交付。保留共用道路，切换橙色岔口再发鲜花车。';
      } else {
        state = outcome.state;
        message = routeMessage(outcome.result);
        sound('error');
        failIfNeeded();
      }
    }
    function showHint() {
      const route = level.routes[state.nextVehicle];
      hint = -1;
      for (let i = 1; i < route.length - 1; i++) {
        const cell = route[i],
          index = cell[0] * level.width + cell[1];
        const direction = p => p[0] < cell[0] ? 0 : p[1] > cell[1] ? 1 : p[0] > cell[0] ? 2 : 3;
        if (![direction(route[i - 1]), direction(route[i + 1])].every(d => ports(state.board[index]).includes(d))) {
          hint = index;
          break;
        }
      }
      notify(hint < 0 ? '路线已经接通，放心出发吧！' : state.board[hint].type === 'switch' ? '紫色框标出了岔口：点一下，换个分流方向。' : '紫色框标出了该调整的路：转到前后都接上。');
    }
    function drawRoad(tile, x, y, size, active) {
      const edge = [[x + size / 2, y - 1], [x + size + 1, y + size / 2], [x + size / 2, y + size + 1], [x - 1, y + size / 2]],
        center = [x + size / 2, y + size / 2];
      function connection(a, b, color, width, dash = false) {
        var _callReceiver3, _chainFunction6, _callReceiver4, _chainFunction7;
        const p = edge[a],
          q = edge[b];
        ctx.beginPath();
        ctx.moveTo(...p);
        if ((a + 2) % 4 === b) ctx.lineTo(...q);else {
          ctx.lineTo(center[0] + (p[0] - center[0]) * .48, center[1] + (p[1] - center[1]) * .48);
          ctx.quadraticCurveTo(...center, center[0] + (q[0] - center[0]) * .48, center[1] + (q[1] - center[1]) * .48);
          ctx.lineTo(...q);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        _callReceiver3 = ctx, _chainFunction6 = _callReceiver3.setLineDash, _chainFunction6 === null || _chainFunction6 === void 0 ? void 0 : _chainFunction6.call(_callReceiver3, dash ? [size * .08, size * .07] : []);
        ctx.stroke();
        _callReceiver4 = ctx, _chainFunction7 = _callReceiver4.setLineDash, _chainFunction7 === null || _chainFunction7 === void 0 ? void 0 : _chainFunction7.call(_callReceiver4, []);
      }
      if (tile.type === 'switch') connection(tile.stem, tile.exits[1 - tile.switchState], '#384c54', size * .38);
      ctx.fillStyle = '#00000026';
      for (let k = 0; k < 18; k++) {
        const xx = (k * 17 + tile.rotation * 13) % 97 / 97,
          yy = (k * 31 + 11) % 89 / 89;
        ctx.fillRect(x + xx * size, y + yy * size, 1.2, 1.2);
      }
      const p = ports(tile);
      connection(...p, tile.type === 'switch' ? '#f4a949' : '#8099a9', size * .48);
      connection(...p, '#242b30', size * .34);
      connection(...p, active ? '#65f1df' : '#e5e8c9', size * .035, true);
      if (tile.type === 'switch') {
        circle(...center, size * .11, '#ffbf47');
        path([[center[0] - size * .06, center[1]], [center[0] + size * .06, center[1]]], '#26323a', 2);
      }
      if (tile.movable) {
        for (const [u, v] of [[.12, .12], [.88, .12], [.12, .88], [.88, .88]]) {
          circle(x + size * u, y + size * v, size * .035, '#c8d0cf');
          circle(x + size * u, y + size * v, size * .013, '#26323a');
        }
        text('吊', x + size * .81, y + size * .2, 9, '#ffce6c', 'center', '700');
      }
      if (active) {
        circle(x + size * .82, y + size * .18, 2.5, colors.green);
      }
    }
    function drawBuilding(tile, x, y, s) {
      const e = [[.5, 0], [1, .5], [.5, 1], [0, .5]][tile.direction];
      path([[x + s * .5, y + s * .5], [x + s * e[0], y + s * e[1]]], '#8099a9', s * .37);
      path([[x + s * .5, y + s * .5], [x + s * e[0], y + s * e[1]]], '#233641', s * .25);
      const garden = tile.destination === 'garden',
        garage = tile.type === 'source',
        color = garage ? '#6dc6cc' : garden ? '#d2a0ff' : '#ffcf59';
      round(x + s * .17, y + s * .23, s * .72, s * .55, 1, '#152129');
      round(x + s * .12, y + s * .19, s * .72, s * .53, 1, '#59656a', color);
      ctx.fillStyle = '#889294';
      ctx.beginPath();
      ctx.moveTo(x + s * .12, y + s * .19);
      ctx.lineTo(x + s * .23, y + s * .1);
      ctx.lineTo(x + s * .93, y + s * .1);
      ctx.lineTo(x + s * .84, y + s * .19);
      ctx.closePath();
      ctx.fill();
      round(x + s * .2, y + s * .27, s * .56, s * .16, 1, '#24343e');
      path([[x + s * .23, y + s * .3], [x + s * .73, y + s * .3]], color, 2);
      if (garage) {
        for (let i = 0; i < 3; i++) path([[x + s * .3, y + s * (.5 + i * .06)], [x + s * .7, y + s * (.5 + i * .06)]], color, 1.4);
      } else if (garden) {
        for (let i = 0; i < 3; i++) {
          const xx = x + s * (.31 + i * .19);
          path([[xx, y + s * .64], [xx, y + s * .49]], '#88d0a3', 1.5);
          circle(xx, y + s * .5, s * .06, i === 1 ? '#ffd171' : color);
        }
      } else {
        round(x + s * .28, y + s * .5, s * .44, s * .13, s * .05, '#e5a54b');
        for (let i = 0; i < 3; i++) path([[x + s * (.36 + i * .13), y + s * .52], [x + s * (.32 + i * .13), y + s * .59]], '#ffe5a1', 1.3);
      }
      text(garage ? '调度站' : garden ? '花园' : '面包店', x + s * .5, y + s * .86, Math.max(9, s * .12), color, 'center', '700');
    }
    function drawPark(decor, x, y, s) {
      ctx.fillStyle = '#293331';
      ctx.fillRect(x, y, s, s);
      if (decor % 3 === 0) {
        round(x + s * .1, y + s * .24, s * .8, s * .62, 1, '#141e22');
        round(x + s * .12, y + s * .15, s * .72, s * .62, 1, '#626a67');
        ctx.fillStyle = '#8d9490';
        ctx.beginPath();
        ctx.moveTo(x + s * .12, y + s * .15);
        ctx.lineTo(x + s * .22, y + s * .07);
        ctx.lineTo(x + s * .91, y + s * .07);
        ctx.lineTo(x + s * .84, y + s * .15);
        ctx.closePath();
        ctx.fill();
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          ctx.fillStyle = (r + c + decor) % 3 ? '#26343c' : '#e8ba67';
          ctx.fillRect(x + s * (.23 + c * .18), y + s * (.28 + r * .15), s * .09, s * .06);
        }
      } else if (decor % 3 === 1) {
        for (let k = 0; k < 3; k++) {
          round(x + s * .14, y + s * (.2 + k * .2), s * .72, s * .13, 1, '#8b8980');
          path([[x + s * .28, y + s * (.2 + k * .2)], [x + s * .28, y + s * (.33 + k * .2)]], '#515653', 1.4);
        }
        circle(x + s * .78, y + s * .78, s * .12, '#1b262b');
        circle(x + s * .78, y + s * .78, s * .065, '#707a7a');
      } else {
        const cx = x + s * .5,
          cy = y + s * .53;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * .27);
        ctx.lineTo(cx + s * .17, cy + s * .13);
        ctx.lineTo(cx - s * .17, cy + s * .13);
        ctx.closePath();
        ctx.fillStyle = '#df8b3d';
        ctx.fill();
        path([[cx - s * .09, cy], [cx + s * .09, cy]], '#eee6d1', s * .06);
        round(cx - s * .24, cy + s * .12, s * .48, s * .08, 1, '#182229');
        for (let k = 0; k < 4; k++) circle(x + s * (.15 + k % 2 * .64), y + s * (.13 + Math.floor(k / 2) * .67), s * .025, '#68716b');
      }
    }
    function drawSocket(x, y, s) {
      var _callReceiver5, _chainFunction8, _callReceiver6, _chainFunction9;
      round(x + 3, y + 3, s - 6, s - 6, 2, '#151d22', '#9d8560');
      _callReceiver5 = ctx, _chainFunction8 = _callReceiver5.setLineDash, _chainFunction8 === null || _chainFunction8 === void 0 ? void 0 : _chainFunction8.call(_callReceiver5, [4, 4]);
      path([[x + 7, y + 7], [x + s - 7, y + 7], [x + s - 7, y + s - 7], [x + 7, y + s - 7], [x + 7, y + 7]], '#b19158', 1, true);
      _callReceiver6 = ctx, _chainFunction9 = _callReceiver6.setLineDash, _chainFunction9 === null || _chainFunction9 === void 0 ? void 0 : _chainFunction9.call(_callReceiver6, []);
      text('空槽', x + s / 2, y + s / 2, Math.max(10, s * .17), '#c8ae7b', 'center', '700');
    }
    function incidentFX(x, y, s, elapsed) {
      const t = Math.min(1, Math.max(0, elapsed / 900));
      ctx.save();
      ctx.globalAlpha = 1 - t * .55;
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4,
          r = s * (.12 + t * .7) * (1 + k % 3 * .15);
        circle(x + Math.cos(a) * r, y + Math.sin(a) * r * .6, s * (.055 + t * .07), k % 2 ? '#b6b0a2' : '#6f7776');
      }
      path([[x - s * .4, y + s * .24], [x - s * .8, y + s * .35]], '#0b1013', 3);
      path([[x - s * .4, y - s * .24], [x - s * .8, y - s * .13]], '#0b1013', 3);
      ctx.restore();
      circle(x + s * .25, y - s * .38, s * .13, '#ef704b');
      text('!', x + s * .25, y - s * .38, s * .2, '#fff0d9', 'center', '700');
    }
    function drawCar(x, y, size, color, angle = 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      round(-size * .46, -size * .3, size * .92, size * .6, 4, '#092231');
      round(-size * .41, -size * .25, size * .58, size * .5, 3, color);
      round(size * .18, -size * .22, size * .24, size * .44, 3, color);
      round(size * .2, -size * .17, size * .14, size * .34, 1, '#23485a');
      round(-size * .27, -size * .34, size * .18, size * .1, 1, '#081b26');
      round(-size * .27, size * .24, size * .18, size * .1, 1, '#081b26');
      round(size * .22, -size * .32, size * .12, size * .1, 1, '#081b26');
      round(size * .22, size * .22, size * .12, size * .1, 1, '#081b26');
      path([[-size * .3, -size * .12], [size * .07, -size * .12]], '#fff1be', 1.5);
      for (let i = 0; i < 4; i++) path([[-size * .32 + i * size * .11, -size * .22], [-size * .32 + i * size * .11, size * .22]], '#00000025', 1);
      round(size * .39, -size * .18, size * .05, size * .1, 1, '#fff0b0');
      round(size * .39, size * .08, size * .05, size * .1, 1, '#fff0b0');
      round(-size * .44, -size * .18, size * .035, size * .1, 1, '#e76c43');
      ctx.restore();
    }
    function stripe(x, y, w, h) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#ffca51';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#26343c';
      ctx.lineWidth = 8;
      for (let xx = x - h; xx < x + w + h; xx += 17) {
        ctx.beginPath();
        ctx.moveTo(xx, y + h);
        ctx.lineTo(xx + h, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    function blueprint(width = W, height = H) {
      ctx.fillStyle = colors.paper;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#2a3640';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
    function drawSkyline(y, h) {
      // A layered working city, not a decorative web card. This fits only in spare
      // vertical space so the minimum phone still prioritizes the actual map.
      if (h < 42) return;
      const base = y + h;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, W, h);
      ctx.clip();
      for (let i = 0; i < Math.ceil(W / 41) + 1; i++) {
        const x = i * 41 - 12,
          hh = Math.min(h - 6, 24 + (i * 17 + level.id * 3) % 39 + (h > 100 ? i % 3 * h * .16 : 0));
        ctx.fillStyle = i % 2 ? '#303f45' : '#34464c';
        ctx.fillRect(x, base - hh, 34, hh);
        ctx.fillStyle = '#56656a';
        ctx.fillRect(x + 2, base - hh, 30, 2);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          ctx.fillStyle = (r + c + i) % 4 ? '#1d2e38' : '#b9985f';
          ctx.fillRect(x + 6 + c * 8, base - hh + 8 + r * 11, 3, 4);
        }
      }
      const cx = W * .73;
      path([[cx, base], [cx, base - h + 7], [cx - 49, base - h + 7], [cx + 53, base - h + 7]], '#c49b5b', 2);
      path([[cx - 40, base - h + 7], [cx, base - h + 22], [cx + 46, base - h + 7]], '#a1804e', 1);
      path([[cx + 34, base - h + 7], [cx + 34, base - 8]], '#a8b8bc', 1);
      round(cx + 28, base - 8, 12, 6, 1, '#d7b66c');
      path([[0, base - 1], [W, base - 1]], '#849190', 1);
      ctx.restore();
    }
    function drawBoard() {
      var _chainObject12;
      const {
          boardX: bx,
          boardY: by,
          boardSize: bw,
          boardGap: gap
        } = layout,
        tileSize = (bw - gap * (level.width - 1)) / level.width;
      round(bx - 6, by + 1, bw + 12, bw + 12, 3, '#0a141b');
      round(bx - 4, by - 4, bw + 8, bw + 8, 2, '#19272e', '#839294');
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        circle(bx - 2 + u * (bw + 4), by - 2 + v * (bw + 4), 2, '#a0aaa4');
      }
      const route = currentVehicle() ? traceRoute(level, state.board, currentVehicle()) : null,
        routeCells = new Set(preview ? (_chainObject12 = route, _chainObject12 === null || _chainObject12 === void 0 ? void 0 : _chainObject12.path) : []);
      state.board.forEach((tile, i) => {
        const x = bx + i % level.width * (tileSize + gap),
          y = by + Math.floor(i / level.width) * (tileSize + gap);
        const fill = tile.type === 'park' ? '#283332' : tile.type === 'switch' ? '#63503a' : tile.type === 'destination' ? '#334348' : tile.type === 'source' ? '#33454b' : '#424c50';
        round(x, y, tileSize, tileSize, 2, fill);
        ctx.save();
        round(x, y, tileSize, tileSize, 2);
        ctx.clip();
        if (tile.type === 'socket') drawSocket(x, y, tileSize);else if (tile.type === 'park') drawPark(tile.decor, x, y, tileSize);else if (tile.type === 'source' || tile.type === 'destination') drawBuilding(tile, x, y, tileSize);else drawRoad(tile, x, y, tileSize, routeCells.has(i));
        ctx.restore();
        if (hint === i || preview && route && !route.ok && route.at === i) {
          ctx.lineWidth = 3;
          round(x + 2, y + 2, tileSize - 4, tileSize - 4, 1, null, hint === i ? colors.purple : '#ff8b52');
          ctx.lineWidth = 1;
        }
        if (selectedPanel === i) {
          ctx.lineWidth = 3;
          round(x + 2, y + 2, tileSize - 4, tileSize - 4, 1, null, colors.yellow);
          ctx.lineWidth = 1;
        }
        if ((isEditable(tile) || crane && tile.type === 'socket') && !animation && !state.failed && !isComplete(state, level)) hits.push({
          id: `tile-${i}`,
          x,
          y,
          w: tileSize,
          h: tileSize,
          fn: () => {
            if (animation || state.failed || adPending || isComplete(state, level)) return;
            if (crane) {
              if (tile.movable) {
                selectedPanel = selectedPanel === i ? -1 : i;
                message = selectedPanel < 0 ? '已放下路板。' : '路板已选中，点击空槽完成吊装（1工时）。';
              } else if (tile.type === 'socket' && selectedPanel >= 0) {
                state = movePanel(state, selectedPanel, i);
                selectedPanel = -1;
                message = '路板已吊入空槽，可继续旋转接通道路。';
                sound('switch');
                failIfNeeded();
              } else message = '只可吊装带螺栓的路板；先点路板，再点空槽。';
            } else {
              state = turnTile(state, i);
              hint = -1;
              message = preview ? routeMessage(traceRoute(level, state.board, currentVehicle())) : '';
              sound(tile.type === 'switch' ? 'switch' : 'turn');
              failIfNeeded();
            }
            schedule();
          }
        });
      });
      if (animation) {
        const route = animation.outcome.result.path,
          t = Math.min(animation.elapsed / 190, route.length - 1),
          a = Math.floor(t),
          b = Math.min(a + 1, route.length - 1),
          f = t - a,
          from = route[a],
          to = route[b],
          col = from % level.width * (1 - f) + to % level.width * f,
          row = Math.floor(from / level.width) * (1 - f) + Math.floor(to / level.width) * f;
        const delta = to - from || (a > 0 ? from - route[a - 1] : 1),
          angle = delta === 1 ? 0 : delta === -1 ? Math.PI : delta > 0 ? Math.PI / 2 : -Math.PI / 2;
        drawCar(bx + col * (tileSize + gap) + tileSize / 2, by + row * (tileSize + gap) + tileSize / 2, tileSize * .76, animation.vehicle.destination === 'bakery' ? colors.yellow : colors.purple, angle);
        if (!animation.outcome.result.ok && animation.elapsed > Math.max(0, (route.length - 1) * 190)) {
          incidentFX(bx + col * (tileSize + gap) + tileSize / 2, by + row * (tileSize + gap) + tileSize / 2, tileSize, animation.elapsed - (route.length - 1) * 190);
          round(bx + 8, by + 8, bw - 16, 28, 2, '#a5472c');
          text('紧急制动 · 前方道路未接通', bx + bw / 2, by + 22, 12, '#fff0d7', 'center', '700');
        }
      } else if (!isComplete(state, level)) {
        const index = state.board.findIndex(t => t.type === 'source');
        drawCar(bx + index % level.width * (tileSize + gap) + tileSize / 2, by + Math.floor(index / level.width) * (tileSize + gap) + tileSize * .46, tileSize * .5, currentVehicle().destination === 'bakery' ? colors.yellow : colors.purple);
      }
    }
    function drawMain() {
      var _chainObject13;
      const {
          margin: m,
          missionY,
          myStatus,
          footerY,
          footerH,
          compact
        } = layout,
        complete = isComplete(state, level),
        vehicle = currentVehicle() || level.vehicles.at(-1);
      stripe(12, m, 5, 42);
      text('修好这条路', 25, m + 16, 19, colors.ink, 'left', '700');
      text(`CITY RECONNECT  /  ${String(level.id).padStart(2, '0')}  /  金币 ${progress.coins}`, 25, m + 36, 9, colors.muted);
      button('levels', '路网', W - 112, m, 48, 44, () => {
        modal = 'levels';
        schedule();
      }, {
        size: 13
      });
      button('tools', '工具', W - 56, m, 44, 44, () => {
        modal = 'tools';
        schedule();
      }, {
        size: 13
      });
      if (compact) {
        text(complete ? '运输完成' : `${vehicle.destination === 'bakery' ? '面包 → 面包店' : '鲜花 → 花园'}  ${Math.min(state.nextVehicle + 1, level.vehicles.length)}/${level.vehicles.length}`, 12, missionY + 10, 12, colors.ink, 'left', '700');
        text(state.budget === null ? `${state.moves} 次 / 目标 ${level.par}` : `工时 ${Math.max(0, state.budget - state.workSpent)} / 容错 ${state.incidentLimit - state.incidents}`, W - 14, missionY + 10, 11, colors.yellow, 'right');
      } else {
        drawCar(35, missionY + 18, 35, vehicle.destination === 'bakery' ? colors.yellow : colors.purple);
        text(complete ? '本段运输完成' : vehicle.destination === 'bakery' ? '面包运输 → 面包店' : '鲜花运输 → 花园', 61, missionY + 11, 13, colors.ink, 'left', '700');
        text(`${level.vehicles.length === 2 ? '双车接力' : '单车任务'} · ${Math.min(state.nextVehicle + 1, level.vehicles.length)}/${level.vehicles.length}`, 61, missionY + 29, 11, colors.muted);
        text(state.budget === null ? `${state.moves} 次` : `余 ${Math.max(0, state.budget - state.workSpent)} 工时`, W - 14, missionY + 11, 14, colors.yellow, 'right', '700');
        text(state.incidentLimit === null ? `目标 ${level.par}` : `容错 ${state.incidentLimit - state.incidents}`, W - 14, missionY + 29, 10, colors.muted, 'right');
      }
      drawSkyline(missionY + 47, layout.boardY - missionY - 73);
      if (layout.boardY - missionY > 70) {
        text(`施工图 ${String(level.id).padStart(2, '0')} / ${level.title}`, 12, layout.boardY - 17, 12, colors.muted);
      }
      drawBoard();
      if (layout.boardY + layout.boardSize + 25 < myStatus) {
        text('黄色：面包   /   紫色：鲜花   /   橙色：岔口', W / 2, layout.boardY + layout.boardSize + 22, 10, colors.muted, 'center');
      }
      // A continuous city/depot fills tall-phone space below the square puzzle;
      // it is scenery, never an extra hit region or a stretched road tile.
      const depotTop = layout.boardY + layout.boardSize + 42,
        depotHeight = myStatus - depotTop - 12;
      if (depotHeight >= 48) {
        drawSkyline(depotTop, Math.max(42, depotHeight - 28));
        const roadY = depotTop + depotHeight - 20;
        path([[0, roadY], [W, roadY]], '#17242b', 28);
        path([[0, roadY], [W, roadY]], '#77928e', 1, true);
        drawCar(W * .22, roadY, 26, colors.yellow);
        drawCar(W * .67, roadY, 26, colors.purple, Math.PI);
      }
      const tip = message || (level.id > 10 ? level.note : (_chainObject13 = sidebarState, _chainObject13 === null || _chainObject13 === void 0 ? void 0 : _chainObject13.enteredFromSidebar) ? '欢迎从侧边栏回来，继续修路。' : level.id >= 5 ? '先送面包，再切换橙色岔口送鲜花。' : '点道路旋转，让车库与目的地接通。');
      path([[13, myStatus + 3], [13, myStatus + (compact ? 19 : 29)]], colors.yellow, 3);
      wrap(tip, 24, myStatus + 9, W - 38, compact ? 11 : 12, 17, colors.ink, compact ? 1 : 2);
      const locked = !!animation || !!state.failed || adPending;
      button('undo', '撤销', 12, footerY, 48, footerH, () => {
        state = undo(state);
        selectedPanel = -1;
        hint = -1;
        message = state.budget === null ? '已撤销上一步。' : '已撤销，但施工工时不退还。';
        schedule();
      }, {
        disabled: locked || !state.history.length,
        size: 12
      });
      button('preview', preview ? '收线' : '预览', 66, footerY, 48, footerH, () => {
        preview = !preview;
        message = preview ? routeMessage(traceRoute(level, state.board, currentVehicle())) : '';
        schedule();
      }, {
        disabled: locked || complete,
        fill: preview ? '#245c60' : '#1c4054',
        size: 12
      });
      if (level.id >= 31) {
        button('crane', crane ? '旋转' : '吊装', 120, footerY, 48, footerH, () => {
          crane = !crane;
          selectedPanel = -1;
          message = crane ? '吊装：先点螺栓路板，再点空槽。' : '旋转模式：点击道路顺时针旋转。';
          schedule();
        }, {
          disabled: locked || complete,
          fill: crane ? colors.yellow : '#1c4054',
          color: crane ? '#102b3c' : colors.ink,
          size: 12
        });
      }
      const dx = level.id >= 31 ? 174 : 120;
      button('dispatch', animation ? '制动/运输' : complete ? '验收' : '发车', dx, footerY, W - dx - 12, footerH, send, {
        fill: colors.yellow,
        color: '#102b3c',
        size: 17,
        disabled: locked
      });
    }
    function modalHeader(title, subtitle, closeId = 'close') {
      hits = [];
      blueprint();
      stripe(12, 12, W - 24, 7);
      text(title, 16, 48, 24, colors.ink, 'left', '700');
      wrap(subtitle, 16, 76, W - 32, 11, 16, colors.muted, 1);
      button(closeId, '×', W - 60, 30, 44, 44, () => {
        modal = null;
        schedule();
      }, {
        size: 25
      });
    }
    function drawModal() {
      if (modal === 'tools') {
        var _chainObject14, _chainObject15, _chainObject16, _chainObject17, _chainObject18;
        modalHeader('施工工具箱', message && /未扣|未确认|侧边栏|不足/.test(message) ? message : '费用预留，未通关退出自动退回。', 'close-tools');
        const gap = 10,
          bw = (W - 34) / 2,
          bh = 54,
          y = 100,
          complete = isComplete(state, level);
        button('hint', '定位断点', 12, y, bw, bh, () => {
          modal = null;
          showHint();
        }, {
          disabled: !!animation || complete,
          color: colors.purple,
          size: 16
        });
        button('reset', '重开本段', 22 + bw, y, bw, bh, () => load(level.id), {
          disabled: !!animation,
          size: 16
        });
        button('sound', progress.sound ? '声音：开' : '声音：关', 12, y + 64, bw, bh, () => {
          progress.sound = !progress.sound;
          platform.audio.setMuted(!progress.sound);
          save();
          sound('turn');
          schedule();
        }, {
          size: 16
        });
        button('help', '施工手册', 22 + bw, y + 64, bw, bh, () => {
          modal = 'help';
          schedule();
        }, {
          size: 16
        });
        if (_chainObject14 = sidebarState, _chainObject14 === null || _chainObject14 === void 0 ? void 0 : _chainObject14.available) button('sidebar', sidebarState.pending ? '侧边栏打开中…' : '侧边栏 ↗', 12, y + 192, W - 24, 52, openSidebar, {
          disabled: sidebarState.pending,
          size: 14
        });
        button('work-tool', state.toolUsed ? '加班券已用' : '+6工时 · 预留12币', 12, y + 128, W - 24, 52, buyWork, {
          disabled: !!animation || state.budget === null || state.toolUsed || !!state.failed || complete,
          size: 14
        });
        const noteY = y + ((_chainObject15 = sidebarState, _chainObject15 === null || _chainObject15 === void 0 ? void 0 : _chainObject15.available) ? 252 : 192);
        if (!(_chainObject16 = sidebarState, _chainObject16 === null || _chainObject16 === void 0 ? void 0 : _chainObject16.available) || H > 510) wrap((_chainObject17 = sidebarState, _chainObject17 === null || _chainObject17 === void 0 ? void 0 : _chainObject17.enteredFromSidebar) ? '欢迎从侧边栏回来，进度没有变化。' : message ? message : storageOK ? `金币 ${progress.coins} · 未通关退出退回预留费。` : '本机存储暂时不可用，仍可继续玩。', 16, noteY, W - 32, 12, 20, colors.muted, (_chainObject18 = sidebarState, _chainObject18 === null || _chainObject18 === void 0 ? void 0 : _chainObject18.available) ? 2 : 3);
        button('continue', '继续修路  →', 12, H - 68, W - 24, 52, () => {
          modal = null;
          schedule();
        }, {
          fill: colors.yellow,
          color: '#102b3c',
          size: 16
        });
      } else if (modal === 'levels') {
        modalHeader('城市复线', `50 个工段 · ${CHAPTERS[mapPage]} · 已完成 ${progress.completed.length}/50`);
        const tabW = (W - 40) / 5;
        for (let c = 0; c < 5; c++) button(`chapter-${c}`, `${c * 10 + 1}–${c * 10 + 10}`, 12 + c * (tabW + 4), 96, tabW, 44, () => {
          mapPage = c;
          schedule();
        }, {
          fill: mapPage === c ? colors.yellow : '#1c4054',
          color: mapPage === c ? '#172a35' : colors.ink,
          size: 11
        });
        const gap = 7,
          bw = (W - 24 - gap * 4) / 5,
          y = 158,
          stride = 78,
          bh = 54;
        LEVELS.slice(mapPage * 10, mapPage * 10 + 10).forEach((l, i) => {
          var _chainObject19;
          const x = 12 + i % 5 * (bw + gap),
            yy = y + Math.floor(i / 5) * stride;
          button(`level-${l.id}`, String(l.id).padStart(2, '0'), x, yy, bw, bh, () => load(l.id), {
            fill: level.id === l.id ? colors.yellow : '#1c4054',
            color: level.id === l.id ? '#102b3c' : colors.ink,
            size: 21
          });
          const best = progress.bestMoves[l.id];
          text(best === undefined ? l.id <= 10 ? '练习' : (_chainObject19 = l.transfers, _chainObject19 === null || _chainObject19 === void 0 ? void 0 : _chainObject19.length) ? '吊装' : '工时' : '★'.repeat(starsFor(best, l.par)), x + bw / 2, yy + bh + 13, 10, best === undefined ? colors.muted : colors.yellow, 'center');
        });
        if (H > 480) wrap(['1–5 入门，6–10 正常体验。', '11关起工时耗尽或故障容错用完会停工。', '双车共用道路；预览免费，先规划再发车。', '螺栓路板可以吊到空槽，搬运消耗1工时。', '先完成第一车，再回收旧路补第二条支路。'][mapPage], 16, 336, W - 32, 12, 20, colors.muted, 2);
        button('back-map', '回到施工现场', 12, H - 68, W - 24, 52, () => {
          modal = null;
          schedule();
        }, {
          fill: colors.yellow,
          color: '#102b3c',
          size: 16
        });
      } else if (modal === 'help') {
        modalHeader('施工手册', '接通道路，再安排车辆出发。', 'close-manual');
        const items = [['01  转动道路', '点击道路转90°。建筑和锥桶不能动。'], ['02  工时有限，预览免费', '11关起误操作会耗工时，错误发车损失容错；撤销不退工时。'], ['03  路板要循环使用', '31关起吊装螺栓路板到空槽；41关起先送首车再回收旧路。']];
        items.forEach(([title, body], i) => {
          const y = 116 + i * 86;
          path([[16, y - 10], [16, y + 51]], i === 2 ? colors.yellow : colors.green, 3);
          text(title, 28, y, 16, colors.ink, 'left', '700');
          wrap(body, 28, y + 25, W - 45, 12, 19, colors.muted, 2);
        });
        button('close-help', '明白了，开工！', 12, H - 68, W - 24, 52, () => {
          modal = null;
          schedule();
        }, {
          fill: colors.yellow,
          color: '#102b3c',
          size: 16
        });
      } else if (modal === 'failed') {
        var _chainObject20, _chainFunction0, _chainObject21;
        modalHeader('施工暂停', state.failed === 'incidents' ? '运输事故次数已达到本段容错上限。' : '施工工时已耗尽，当前布置不能继续施工。', 'close-failed');
        const close = hits.find(h => h.id === 'close-failed');
        if (close) close.fn = () => {
          modal = 'levels';
          schedule();
        };
        // Failure is a reversible local run state. Restart never costs currency.
        const y = H < 500 ? 98 : 118;
        stripe(16, y, W - 32, 10);
        text(state.failed === 'incidents' ? '紧急制动 · 道路封控' : '工时耗尽 · 重新规划', W / 2, y + 38, 21, '#f59e71', 'center', '700');
        wrap(message || '本段初始状态可解。免费重开可重新规划，不需要看广告。', 18, y + 72, W - 36, 12, 20, colors.muted, 2);
        const yy = Math.min(y + 126, H - 234);
        button('coin-revive', state.revived ? '本局复活已使用' : '预留20币复活 · +10工时', 12, yy, W - 24, 48, coinRevive, {
          disabled: state.revived || adPending,
          size: 14
        });
        const rs = (_chainObject20 = rewardService, _chainObject20 === null || _chainObject20 === void 0 ? void 0 : (_chainFunction0 = _chainObject20.getState, _chainFunction0 === null || _chainFunction0 === void 0 ? void 0 : _chainFunction0.call(_chainObject20)));
        button('ad-revive', (_chainObject21 = rs, _chainObject21 === null || _chainObject21 === void 0 ? void 0 : _chainObject21.mode) === 'mock' ? '模拟广告复活（测试）' : '广告复活（预留未启用）', 12, yy + 58, W - 24, 48, requestRevive, {
          disabled: state.revived || adPending,
          size: 14
        });
        text('未通关重开/退出，预留金币自动退回。', W / 2, H - 92, 11, colors.muted, 'center');
        button('free-restart', '免费重开本段', 12, H - 68, W - 24, 52, () => load(level.id), {
          fill: colors.yellow,
          color: '#172a35',
          size: 17
        });
      } else if (modal === 'mock-ad' || modal === 'ad-wait') {
        modalHeader(modal === 'mock-ad' ? '模拟广告测试' : '等待广告结果', '本页不是真实广告，不产生收入。', 'close-ad');
        // Replace the header close callback: invalidate this run's pending reward.
        const close = hits.find(h => h.id === 'close-ad');
        if (close) close.fn = () => {
          var _chainObject22, _chainFunction1;
          _chainObject22 = rewardService, _chainObject22 === null || _chainObject22 === void 0 ? void 0 : (_chainFunction1 = _chainObject22.cancel, _chainFunction1 === null || _chainFunction1 === void 0 ? void 0 : _chainFunction1.call(_chainObject22));
          modal = 'failed';
          schedule();
        };
        wrap('只有“完整观看”才测试一次复活。提前关闭、无填充、错误都不得获得奖励。', 18, 104, W - 36, 12, 18, colors.muted, 3);
        if (modal === 'mock-ad') {
          const choices = [['completed', '模拟完整观看'], ['cancelled', '模拟提前关闭'], ['unavailable', '模拟无填充'], ['error', '模拟广告异常']];
          choices.forEach(([status, label], i) => button(`mock-${status}`, label, 12, 158 + i * 50, W - 24, 46, () => {
            rewardService.resolveMock(status);
            hits = [];
          }, {
            fill: i === 0 ? colors.yellow : '#1c4054',
            color: i === 0 ? '#172a35' : colors.ink,
            size: 14
          }));
        }
        button('ad-restart', '不等广告，免费重开', 12, H - 58, W - 24, 46, () => load(level.id), {
          size: 14
        });
      } else if (modal === 'win') {
        modalHeader('工段验收通过', !storageOK ? '保存未成功，重开将退回预留费。' : progress.completed.length === LEVELS.length ? '整座路网已经恢复畅通。' : `施工段 ${String(level.id).padStart(2, '0')} · ${level.title}`, 'close-win');
        const cy = Math.max(120, Math.min(H * .4, H - 292, 240));
        stripe(30, cy - 40, W - 60, 10);
        text('★'.repeat(starsFor(state.moves, level.par)), W / 2, cy + 12, 45, colors.yellow, 'center', '700');
        text('运输任务完成', W / 2, cy + 64, 24, colors.ink, 'center', '700');
        text(`${state.moves} 次转动  /  ${level.vehicles.length} 辆车送达`, W / 2, cy + 102, 14, colors.green, 'center');
        text(`三星目标：${level.par} 次以内 / ${winAward ? '+20金币' : '本段金币已领'}`, W / 2, cy + 128, 12, colors.muted, 'center');
        button('next', level.id === LEVELS.length ? '查看完整路网  →' : '进入下一工段  →', 12, H - 132, W - 24, 52, () => {
          if (level.id === LEVELS.length) {
            modal = 'levels';
            schedule();
          } else load(level.id + 1);
        }, {
          fill: colors.yellow,
          color: '#102b3c',
          size: 16
        });
        button('replay', '重新挑战本段', 12, H - 68, W - 24, 52, () => load(level.id), {
          size: 15
        });
      }
    }
    function drawFrame(time) {
      frameId = null;
      if (destroyed || paused) return;
      if (animation && !adPending) {
        if (previousTime !== null) animation.elapsed += Math.min(100, Math.max(0, time - previousTime));
        previousTime = time;
        if (animation.elapsed >= animation.duration) finishDelivery();
      }
      const size = platform.getSize(),
        {
          width,
          height,
          dpr
        } = size,
        raw = size.safeInsets || {};
      const inset = (value, max) => Math.max(0, Math.min(Number(value) || 0, max));
      const safe = {
        top: inset(raw.top, height / 3),
        right: inset(raw.right, width / 4),
        bottom: inset(raw.bottom, height / 3),
        left: inset(raw.left, width / 4)
      };
      // Fill the entire host viewport. Insets protect controls, not the scene.
      W = width - safe.left - safe.right;
      H = height - safe.top - safe.bottom;
      transform = {
        scale: 1,
        x: safe.left,
        y: safe.top
      };
      const compact = H < 490,
        margin = H < 540 ? 4 : 8,
        missionY = margin + 48,
        missionH = compact ? 20 : H < 650 ? 36 : 44,
        boardTop = missionY + missionH + (compact ? 4 : 8),
        footerH = compact ? 44 : 52,
        footerY = H - margin - footerH,
        myStatus = footerY - (compact ? 2 : 4) - (compact ? 24 : H < 650 ? 32 : 40),
        boardAvailable = myStatus - boardTop - (compact ? 4 : 6),
        boardGap = W < 274 ? 0 : 2,
        minMapWidth = level.width * 44 + boardGap * (level.width - 1),
        mapPad = Math.max(0, Math.min(12, (W - minMapWidth) / 2)),
        boardSize = Math.min(W - 2 * mapPad, boardAvailable);
      layout = {
        viewportWidth: width,
        viewportHeight: height,
        dpr,
        boardGap,
        compact,
        margin,
        missionY,
        myStatus,
        footerY,
        footerH,
        boardX: (W - boardSize) / 2,
        boardY: boardTop + Math.min(96, (boardAvailable - boardSize) * .40),
        boardSize,
        width: W,
        height: H,
        safeInsets: safe
      };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      blueprint(width, height);
      ctx.translate(transform.x, transform.y);
      hits = [];
      drawMain();
      if (modal) drawModal();
      if (animation) schedule();
    }
    const unsubscribers = [platform.onPointer(event => {
      var _chainObject24;
      if (destroyed || paused) return;
      const x = (event.x - transform.x) / transform.scale,
        y = (event.y - transform.y) / transform.scale;
      const targetAt = (px, py) => [...hits].reverse().find(h => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
      if (event.type === 'down') {
        var _chainObject23, _nullish4;
        if (gesture) return; // One active finger owns a tap; ignore secondary touches.
        gesture = {
          x,
          y,
          id: event.id,
          targetId: (_nullish4 = (_chainObject23 = targetAt(x, y), _chainObject23 === null || _chainObject23 === void 0 ? void 0 : _chainObject23.id), _nullish4 === null || _nullish4 === void 0 ? null : _nullish4)
        };
        return;
      }
      if (!gesture || gesture.id !== event.id) return;
      if (event.type === 'cancel') {
        gesture = null;
        return;
      }
      if (event.type === 'move') {
        if (Math.hypot(x - gesture.x, y - gesture.y) > 15) gesture.targetId = null;
        return;
      }
      if (event.type !== 'up') return;
      const down = gesture;
      gesture = null;
      if (!down.targetId || Math.hypot(x - down.x, y - down.y) > 15) return;
      const hit = targetAt(x, y);
      if ((_chainObject24 = hit, _chainObject24 === null || _chainObject24 === void 0 ? void 0 : _chainObject24.id) !== down.targetId) return;
      // Never reuse a rendered closure after a synchronous state transition.
      hits = [];
      hit.fn();
      schedule();
    }), platform.onResize(() => {
      gesture = null;
      hits = [];
      schedule();
    }), platform.onPause(() => {
      paused = true;
      gesture = null;
      previousTime = null;
      if (frameId !== null) {
        platform.cancelFrame(frameId);
        frameId = null;
      }
    }), platform.onResume(() => {
      paused = false;
      previousTime = null;
      schedule();
    })];
    if (typeof (_chainObject25 = platform.sidebar, _chainObject25 === null || _chainObject25 === void 0 ? void 0 : _chainObject25.subscribe) === 'function') unsubscribers.push(platform.sidebar.subscribe(value => {
      sidebarState = value;
      schedule();
    }));
    schedule();
    return {
      destroy() {
        var _chainObject26, _chainFunction10;
        if (destroyed) return;
        if (pendingPurchaseAmount(progress)) {
          progress = refundPendingPurchase(progress);
          save();
        }
        destroyed = true;
        cancelReward();
        _chainObject26 = rewardService, _chainObject26 === null || _chainObject26 === void 0 ? void 0 : (_chainFunction10 = _chainObject26.destroy, _chainFunction10 === null || _chainFunction10 === void 0 ? void 0 : _chainFunction10.call(_chainObject26));
        animation = null;
        if (frameId !== null) platform.cancelFrame(frameId);
        unsubscribers.forEach(fn => {
          if (typeof fn === 'function') fn();
        });
      },
      getSnapshot() {
        var _chainObject27, _chainFunction11;
        return {
          levelId: level.id,
          moves: state.moves,
          nextVehicle: state.nextVehicle,
          complete: isComplete(state, level),
          busy: !!animation,
          modal,
          preview,
          message,
          storageOK,
          storageConflict,
          storageUncertain,
          pendingPurchase: progress.pendingPurchase ? {
            ...progress.pendingPurchase
          } : null,
          pendingPurchaseCoins: pendingPurchaseAmount(progress),
          sidebar: sidebarState ? {
            ...sidebarState
          } : null,
          board: state.board.map(t => ({
            ...t,
            ...(t.exits ? {
              exits: [...t.exits]
            } : {})
          })),
          hitTargets: hits.map(({
            id,
            x,
            y,
            w,
            h
          }) => ({
            id,
            x,
            y,
            w,
            h
          })),
          transform: {
            ...transform
          },
          layout: {
            ...layout,
            safeInsets: {
              ...layout.safeInsets
            }
          },
          design: 'road-city-reconnect-v4',
          campaignSize: LEVELS.length,
          crane,
          selectedPanel,
          coins: progress.coins,
          workSpent: state.workSpent,
          budget: state.budget,
          incidents: state.incidents,
          incidentLimit: state.incidentLimit,
          failed: state.failed,
          revived: state.revived,
          toolUsed: state.toolUsed,
          rewards: (_chainObject27 = rewardService, _chainObject27 === null || _chainObject27 === void 0 ? void 0 : (_chainFunction11 = _chainObject27.getState, _chainFunction11 === null || _chainFunction11 === void 0 ? void 0 : _chainFunction11.call(_chainObject27))) || {
            mode: 'disabled'
          },
          adPending,
          runId
        };
      }
    };
  }

  // Source: adapters/rewarded.js
  // Platform-neutral reward gate. Live is deliberately disabled unless explicitly
  // enabled with a real unit and verified no-share fallback configuration.
  function createRewardedService({
    mode = 'disabled',
    api = null,
    adUnitId = '',
    shareFallbackDisabled = false,
    timers = {}
  } = {}) {
    const setTimer = timers.setTimeout || (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : () => null),
      clearTimer = timers.clearTimeout || (typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : () => {});
    let active = null,
      serial = 0,
      destroyed = false,
      retiring = false,
      retireFailed = false;
    const liveReady = mode === 'live' && api && typeof api.createRewardedVideoAd === 'function' && typeof adUnitId === 'string' && adUnitId.trim().length > 0 && !/placeholder|YOUR_|test|mock|xxxx/i.test(adUnitId) && shareFallbackDisabled === true;
    const actualMode = mode === 'mock' ? 'mock' : liveReady ? 'live' : 'disabled';
    function finish(session, status) {
      if (!session || session.done || active !== session) return;
      session.done = true;
      active = null;
      clearTimer(session.timer);
      if (session.ad) {
        try {
          var _callReceiver7, _chainFunction12;
          _callReceiver7 = session.ad, _chainFunction12 = _callReceiver7.offClose, _chainFunction12 === null || _chainFunction12 === void 0 ? void 0 : _chainFunction12.call(_callReceiver7, session.close);
        } catch (_ignoredError7) {}
        try {
          var _callReceiver8, _chainFunction13;
          _callReceiver8 = session.ad, _chainFunction13 = _callReceiver8.offError, _chainFunction13 === null || _chainFunction13 === void 0 ? void 0 : _chainFunction13.call(_callReceiver8, session.error);
        } catch (_ignoredError8) {}
        retiring = true;
        try {
          var _callReceiver9, _chainFunction14;
          Promise.resolve((_callReceiver9 = session.ad, _chainFunction14 = _callReceiver9.destroy, _chainFunction14 === null || _chainFunction14 === void 0 ? void 0 : _chainFunction14.call(_callReceiver9))).catch(() => {
            retireFailed = true;
          }).finally(() => {
            retiring = false;
          });
        } catch (_ignoredError9) {
          retiring = false;
          retireFailed = true;
        }
      }
      session.resolve({
        status,
        requestId: session.id
      });
    }
    return {
      getState: () => ({
        mode: actualMode,
        available: !destroyed && actualMode !== 'disabled' && !retiring && !retireFailed,
        busy: !!active,
        retiring,
        retireFailed
      }),
      request({
        placement = 'revive',
        context = null
      } = {}) {
        const id = `road-reward-${++serial}`;
        if (destroyed || active || retiring || retireFailed || actualMode === 'disabled') return Promise.resolve({
          status: 'unavailable',
          requestId: id
        });
        return new Promise(resolve => {
          const session = {
            id,
            placement,
            context,
            resolve,
            done: false,
            ad: null,
            timer: null
          };
          active = session;
          session.timer = setTimer(() => finish(session, 'error'), 90000);
          if (actualMode === 'mock') return;
          try {
            session.ad = api.createRewardedVideoAd({
              adUnitId,
              multiton: false
            });
            if (!session.ad || typeof session.ad.onClose !== 'function' || typeof session.ad.onError !== 'function' || typeof session.ad.show !== 'function' || typeof session.ad.destroy !== 'function') {
              finish(session, 'unavailable');
              return;
            }
            session.close = res => {
              var _chainObject28;
              const complete = (_chainObject28 = res, _chainObject28 === null || _chainObject28 === void 0 ? void 0 : _chainObject28.isEnded) === true && (res.count === undefined || Number.isFinite(res.count) && res.count >= 1);
              finish(session, complete ? 'completed' : 'cancelled');
            };
            session.error = err => {
              var _chainObject29, _chainObject30, _nullish5;
              return finish(session, Number((_nullish5 = (_chainObject29 = err, _chainObject29 === null || _chainObject29 === void 0 ? void 0 : _chainObject29.errCode), _nullish5 === null || _nullish5 === void 0 ? (_chainObject30 = err, _chainObject30 === null || _chainObject30 === void 0 ? void 0 : _chainObject30.errNo) : _nullish5)) === 1004 ? 'unavailable' : 'error');
            };
            session.ad.onClose(session.close);
            session.ad.onError(session.error);
            Promise.resolve(session.ad.show()).catch(session.error);
          } catch (_ignoredError0) {
            finish(session, 'error');
          }
        });
      },
      resolveMock(status) {
        if (actualMode === 'mock' && ['completed', 'cancelled', 'unavailable', 'error'].includes(status)) finish(active, status);
      },
      cancel() {
        finish(active, 'cancelled');
      },
      destroy() {
        destroyed = true;
        finish(active, 'cancelled');
      }
    };
  }

  // Source: adapters/douyin-sidebar.js
  /** Actual optional Douyin sidebar capability. No reward or navigation is implied by a successful API callback. */
  function createDouyinSidebar(tt) {
    let state = {
      available: false,
      checked: false,
      enteredFromSidebar: false,
      pending: false,
      error: null
    };
    let destroyed = false,
      finishPending = null;
    const listeners = new Set();
    const update = patch => {
      if (destroyed) return;
      state = {
        ...state,
        ...patch
      };
      listeners.forEach(fn => fn({
        ...state
      }));
    };
    const onShow = options => {
      const entered = !!options && options.launch_from === 'homepage' && options.location === 'sidebar_card';
      // Every foreground event replaces the prior entry state, including ordinary resumes.
      update({
        enteredFromSidebar: entered
      });
      if (finishPending) finishPending(entered, entered ? null : 'Navigation did not return through sidebar');
    };
    // Subscribe synchronously before canvas or game creation, as required by the platform guide.
    if (typeof tt.onShow === 'function') tt.onShow(onShow);
    if (typeof tt.checkScene === 'function' && typeof tt.navigateToScene === 'function') {
      try {
        tt.checkScene({
          scene: 'sidebar',
          success: result => update({
            checked: true,
            available: !!result && result.isExist === true,
            error: null
          }),
          fail: result => update({
            checked: true,
            available: false,
            error: result && result.errMsg || 'Sidebar capability check failed'
          })
        });
      } catch (_error) {
        update({
          checked: true,
          available: false,
          error: 'Sidebar capability check failed'
        });
      }
    } else update({
      checked: true,
      available: false
    });
    return {
      getState: () => ({
        ...state
      }),
      subscribe(fn) {
        if (destroyed) return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      navigate() {
        if (destroyed || !state.available || state.pending) return Promise.resolve(false);
        update({
          pending: true,
          error: null
        });
        return new Promise(resolve => {
          let settled = false;
          const finish = (ok, error = null) => {
            if (settled) return;
            settled = true;
            if (finishPending === finish) finishPending = null;
            update({
              pending: false,
              error
            });
            resolve(ok);
          };
          finishPending = finish;
          try {
            tt.navigateToScene({
              scene: 'sidebar',
              success: result => finish(!(result && result.code === 1), result && result.code === 1 ? 'Navigation cancelled' : null),
              fail: result => finish(false, result && result.errMsg || 'Sidebar navigation failed')
            });
          } catch (_error) {
            finish(false, 'Sidebar navigation failed');
          }
        });
      },
      destroy() {
        if (destroyed) return;
        if (finishPending) finishPending(false, 'Sidebar adapter destroyed');
        destroyed = true;
        if (typeof tt.offShow === 'function') tt.offShow(onShow);
        listeners.clear();
      }
    };
  }

  // Source: adapters/tt.js

  // No browser globals. tt and the frame scheduler are explicitly injected.
  function createTTPlatform(api, scheduler, audioPaths = {}) {
    const sidebar = createDouyinSidebar(api); // Register newest onShow before game boot.
    const rewards = createRewardedService(); // No real ad unit or monetization activation.
    const canvas = api.createCanvas(); // Exactly one on-screen canvas.
    const listeners = {
      pointer: new Set(),
      resize: new Set(),
      pause: new Set(),
      resume: new Set()
    };
    const removers = [];
    const sounds = new Map();
    const emit = (name, value) => listeners[name].forEach(fn => fn(value));
    const subscribe = name => fn => {
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    };
    const bind = (on, off, fn) => {
      if (typeof api[on] === 'function') {
        api[on](fn);
        removers.push(() => {
          if (typeof api[off] === 'function') api[off](fn);
        });
      }
    };
    let size;
    function resize(event) {
      var _chainObject31, _nullish6, _nullish7;
      const info = api.getSystemInfoSync();
      // Native on-screen Canvas is screen-sized (not a DOM canvas). Explicit
      // resize-event dimensions win for hosts with a resized game container.
      const changed = (_chainObject31 = event, _chainObject31 === null || _chainObject31 === void 0 ? void 0 : _chainObject31.size) || event || {};
      const positive = n => Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0;
      const width = positive(changed.windowWidth) || positive(info.screenWidth) || positive(info.windowWidth);
      const height = positive(changed.windowHeight) || positive(info.screenHeight) || positive(info.windowHeight),
        area = info.safeArea || {};
      const bounded = (n, max) => Math.max(0, Math.min(Number(n) || 0, max));
      const safeInsets = {
        top: bounded(area.top, height / 3),
        left: bounded(area.left, width / 4),
        right: bounded(width - (_nullish6 = area.right, _nullish6 === null || _nullish6 === void 0 ? (area.left || 0) + (area.width || width) : _nullish6), width / 4),
        bottom: bounded(height - (_nullish7 = area.bottom, _nullish7 === null || _nullish7 === void 0 ? (area.top || 0) + (area.height || height) : _nullish7), height / 3)
      };
      // Some hosts place their own menu capsule below the OS notch area.
      // Reserve its bottom edge when the optional host API is available.
      try {
        var _callReceiver0, _chainFunction15, _chainObject32;
        const menu = typeof api.getMenuButtonLayout === 'function' ? api.getMenuButtonLayout() : (_callReceiver0 = api, _chainFunction15 = _callReceiver0.getMenuButtonBoundingClientRect, _chainFunction15 === null || _chainFunction15 === void 0 ? void 0 : _chainFunction15.call(_callReceiver0));
        if (Number.isFinite((_chainObject32 = menu, _chainObject32 === null || _chainObject32 === void 0 ? void 0 : _chainObject32.bottom)) && menu.bottom > 0) safeInsets.top = Math.max(safeInsets.top, bounded(menu.bottom + 8, height / 3));
      } catch (_ignoredError1) {/* Optional capability; keep the OS safe area. */}
      const next = {
        width,
        height,
        dpr: Math.min(info.pixelRatio || 1, 3),
        safeInsets
      };
      if (!(next.width > 0 && next.height > 0)) throw new Error('Platform viewport dimensions are missing');
      if (size && next.width === size.width && next.height === size.height && next.dpr === size.dpr && JSON.stringify(next.safeInsets) === JSON.stringify(size.safeInsets)) return;
      size = next;
      canvas.width = Math.round(size.width * size.dpr);
      canvas.height = Math.round(size.height * size.dpr);
      emit('resize', {
        ...size
      });
    }
    resize();
    for (const [suffix, type] of [['Start', 'down'], ['Move', 'move'], ['End', 'up'], ['Cancel', 'cancel']]) {
      bind('onTouch' + suffix, 'offTouch' + suffix, event => {
        var _chainObject33;
        const touches = (_chainObject33 = event.changedTouches, _chainObject33 === null || _chainObject33 === void 0 ? void 0 : _chainObject33.length) ? event.changedTouches : event.touches || [];
        touches.forEach(touch => emit('pointer', {
          type,
          x: touch.clientX,
          y: touch.clientY,
          id: touch.identifier
        }));
      });
    }
    let muted = false;
    const stopAudio = () => sounds.forEach(sound => sound.pause());
    bind('onHide', 'offHide', () => {
      stopAudio();
      emit('pause');
    });
    bind('onShow', 'offShow', () => {
      resize();
      emit('resume');
    });
    // Optional onWindowResize on hosts that expose it; unsupported hosts still
    // refresh dimensions on every onShow. Never multiply touch coordinates by DPR.
    bind('onWindowResize', 'offWindowResize', resize);
    return {
      canvas,
      sidebar,
      rewards,
      getSize: () => ({
        ...size
      }),
      onPointer: subscribe('pointer'),
      onResize: subscribe('resize'),
      onPause: subscribe('pause'),
      onResume: subscribe('resume'),
      requestFrame: fn => scheduler.requestAnimationFrame(fn),
      cancelFrame: id => scheduler.cancelAnimationFrame(id),
      storage: {
        getItem(key) {
          const value = api.getStorageSync(key);
          return value === undefined || value === null || value === '' ? null : String(value);
        },
        setItem(key, value) {
          api.setStorageSync(key, String(value));
        }
      },
      audio: {
        play(name) {
          if (muted || !audioPaths[name] || typeof api.createInnerAudioContext !== 'function') return;
          try {
            let sound = sounds.get(name);
            if (!sound) {
              var _callReceiver1, _chainFunction16;
              sound = api.createInnerAudioContext();
              sound.src = audioPaths[name];
              _callReceiver1 = sound, _chainFunction16 = _callReceiver1.onError, _chainFunction16 === null || _chainFunction16 === void 0 ? void 0 : _chainFunction16.call(_callReceiver1, () => {});
              sounds.set(name, sound);
            }
            sound.seek(0);
            sound.play();
          } catch (_ignoredError10) {/* Audio failure must not block play. */}
        },
        setMuted(value) {
          muted = Boolean(value);
          if (muted) stopAudio();
        }
      },
      destroy() {
        rewards.destroy();
        sidebar.destroy();
        removers.forEach(fn => fn());
        sounds.forEach(sound => sound.destroy());
        Object.values(listeners).forEach(set => set.clear());
      }
    };
  }
  const platform = createTTPlatform(tt, {
    requestAnimationFrame,
    cancelAnimationFrame
  }, {
    "turn": "assets/tap.wav",
    "switch": "assets/tap.wav",
    "send": "assets/tap.wav",
    "win": "assets/tap.wav",
    "error": "assets/tap.wav"
  });
  startGame(platform);
})();
