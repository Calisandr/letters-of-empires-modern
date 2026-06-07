import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  logLevel: 'error',
  server: { middlewareMode: true },
});

const clone = (value) => structuredClone(value);

try {
  const { initialGameState } = await server.ssrLoadModule('/src/game/initialState.ts');
  const { gameReducer } = await server.ssrLoadModule('/src/game/reducer.ts');
  const { applyValidatedEffect, createStrategicOrder, endTurn } = await server.ssrLoadModule('/src/game/engine.ts');
  const { buildMapSignals, filterMapSignalsForMode } = await server.ssrLoadModule('/src/game/mapIntel.ts');
  const { fallbackJudgeCouncilCommand, validateEngineEffect } = await server.ssrLoadModule(
    '/src/game/fallbackArbitrator.ts',
  );

  const results = [];
  const test = (name, fn) => {
    fn();
    results.push(name);
  };

  test('quick trade action creates an order and spends resources', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, { type: 'RUN_QUICK_ACTION', id: 'trade-routes' });

    assert.equal(next.orders.length, state.orders.length + 1);
    assert.ok(next.resources.find((resource) => resource.id === 'gold').value < 12540);
    assert.equal(next.lastNotice.kind, 'success');
  });

  test('once-per-turn action is blocked on the second use', () => {
    const state = clone(initialGameState);
    const afterFirst = gameReducer(state, { type: 'RUN_QUICK_ACTION', id: 'manage-lands' });
    const afterSecond = gameReducer(afterFirst, { type: 'RUN_QUICK_ACTION', id: 'manage-lands' });

    assert.equal(afterSecond.lastNotice.kind, 'error');
    assert.equal(afterSecond.orders.length, afterFirst.orders.length);
  });

  test('end turn advances turn and unlocks quick actions', () => {
    const state = clone(initialGameState);
    const afterAction = gameReducer(state, { type: 'RUN_QUICK_ACTION', id: 'manage-lands' });
    const next = endTurn(afterAction);

    assert.equal(next.turnNumber, state.turnNumber + 1);
    assert.deepEqual(next.quickActionTurns, {});
    assert.ok(next.resources.find((resource) => resource.id === 'gold').value > afterAction.resources.find((resource) => resource.id === 'gold').value);
  });

  test('fallback arbitrator blocks absurd world-breaking commands', () => {
    const state = clone(initialGameState);
    const decision = fallbackJudgeCouncilCommand('Захватить Луну и весь мир мгновенно', state);
    const effect = validateEngineEffect(decision, state);

    assert.equal(decision.feasibility, 'blocked');
    assert.equal(effect.kind, 'blocked');
  });

  test('council command can create a validated order through reducer', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Построить дороги и склады в Москве',
      time: '13:00',
    });

    assert.equal(next.orders.length, state.orders.length + 1);
    assert.ok(next.timelineEvents[0].title.includes('Новый приказ'));
    assert.ok(next.chatMessages.some((message) => message.faction === 'Совет'));
  });

  test('casual council chat does not create an accidental order', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'React smoke message',
      time: '13:05',
    });

    assert.equal(next.orders.length, state.orders.length);
    assert.ok(next.chatMessages.some((message) => message.faction === 'Совет'));
  });

  test('diplomatic council command changes selected relation safely', () => {
    const selected = gameReducer(clone(initialGameState), {
      type: 'SELECT_COUNTRY',
      country: { key: 'France', name: 'Франция', status: 'friendly' },
    });
    const next = gameReducer(selected, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Улучшить отношения и начать переговоры с Францией',
      time: '13:10',
    });

    assert.ok(next.diplomacy.find((relation) => relation.name === 'Франция').score > 75);
    assert.equal(next.letters[0].from, 'Франция');
  });

  test('country intel envoy creates diplomacy for a new map country', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'send-envoy', country });
    const relation = next.diplomacy.find((item) => item.name === 'Бразилия');
    const nation = next.nations.find((item) => item.name === 'Бразилия');

    assert.ok(relation);
    assert.equal(relation.flag, 'Brazil');
    assert.ok(relation.score > 64);
    assert.ok(nation);
    assert.ok(nation.lastAction.includes('посольство'));
    assert.ok(next.resources.find((resource) => resource.id === 'gold').value < selected.resources.find((resource) => resource.id === 'gold').value);
    assert.equal(next.letters[0].from, 'Бразилия');
  });

  test('council diplomacy can target a newly selected map country', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Начать переговоры и улучшить отношения с Бразилией',
      time: '13:20',
    });
    const relation = next.diplomacy.find((item) => item.name === 'Бразилия');

    assert.ok(relation);
    assert.ok(relation.score > 64);
    assert.ok(next.nations.some((item) => item.name === 'Бразилия'));
    assert.notEqual(next.lastNotice.kind, 'error');
  });

  test('negative selected-country diplomacy raises dossier pressure', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const discovered = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'gather-intel', country });
    const before = discovered.nations.find((item) => item.name === 'Бразилия');
    const next = applyValidatedEffect(discovered, {
      kind: 'diplomacy-delta',
      diplomacyDelta: { Бразилия: -8 },
    });
    const after = next.nations.find((item) => item.name === 'Бразилия');

    assert.ok(before);
    assert.ok(after);
    assert.ok(after.pressure > before.pressure);
    assert.ok(after.threat > before.threat);
  });

  test('country intel recon creates a detailed dossier without creating an order', () => {
    const country = { key: 'Algeria', name: 'Алжир', status: 'common' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'gather-intel', country });
    const nation = next.nations.find((item) => item.name === 'Алжир');

    assert.ok(nation);
    assert.ok(nation.lastAction.includes('Разведка'));
    assert.equal(next.orders.length, selected.orders.length);
    assert.ok(next.operationPlans.length > selected.operationPlans.length);
    assert.ok(next.timelineEvents[0].title.includes('Досье'));
  });

  test('country intel operation prepares a launchable operation plan', () => {
    const country = { key: 'Ukraine', name: 'Украина', status: 'hostile' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const prepared = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'prepare-operation', country });
    const plan = prepared.operationPlans.find((item) => item.target === 'Украина');

    assert.ok(plan);
    assert.ok(['countermeasure', 'raid'].includes(plan.kind));
    assert.equal(prepared.orders.length, selected.orders.length);

    const launched = gameReducer(prepared, { type: 'RUN_OPERATION_PLAN', id: plan.id });
    assert.equal(launched.orders.length, prepared.orders.length + 1);
    assert.ok(!launched.operationPlans.some((item) => item.id === plan.id));
    assert.equal(launched.orders.at(-1).target, 'Украина');
  });

  test('operation plan launch failure keeps the plan available', () => {
    const country = { key: 'Ukraine', name: 'Украина', status: 'hostile' };
    const prepared = gameReducer(clone(initialGameState), { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'prepare-operation', country });
    const plan = prepared.operationPlans.find((item) => item.target === 'Украина');
    const drained = {
      ...prepared,
      resources: prepared.resources.map((resource) => ({ ...resource, value: 0 })),
    };
    const next = gameReducer(drained, { type: 'RUN_OPERATION_PLAN', id: plan.id });

    assert.equal(next.lastNotice.kind, 'error');
    assert.ok(next.operationPlans.some((item) => item.id === plan.id));
    assert.equal(next.orders.length, drained.orders.length);
  });

  test('operation plans expire on later turns', () => {
    const country = { key: 'France', name: 'Франция', status: 'friendly' };
    const prepared = gameReducer(clone(initialGameState), { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'gather-intel', country });
    const plan = prepared.operationPlans[0];
    const stale = {
      ...prepared,
      operationPlans: [{ ...plan, expiresTurn: prepared.turnNumber }],
    };
    const next = endTurn(stale);

    assert.equal(next.operationPlans.length, 0);
    assert.ok(next.timelineEvents.some((event) => event.title.includes('Оперативные планы')));
  });

  test('country intel trade mission creates a real target order', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'trade-mission', country });
    const order = next.orders.at(-1);

    assert.equal(next.orders.length, selected.orders.length + 1);
    assert.equal(order.target, 'Бразилия');
    assert.equal(order.iconKey, 'anchor');
    assert.ok(next.diplomacy.some((item) => item.name === 'Бразилия'));
  });

  test('map intel highlights trade and strategy targets from game state', () => {
    const countryKeys = {
      Россия: 'Russia',
      Индия: 'India',
      Украина: 'Ukraine',
      Бразилия: 'Brazil',
    };
    const signals = buildMapSignals(clone(initialGameState), countryKeys);
    const tradeSignals = filterMapSignalsForMode(signals, 'trade');
    const strategySignals = filterMapSignalsForMode(signals, 'strategy');
    const india = tradeSignals.find((signal) => signal.countryKey === 'India');
    const ukraine = strategySignals.find((signal) => signal.countryKey === 'Ukraine');

    assert.ok(india);
    assert.equal(india.marker, 'trade');
    assert.ok(india.activeOrders > 0);
    assert.ok(ukraine);
    assert.ok(['military', 'threat'].includes(ukraine.marker));
    assert.ok(ukraine.severity >= 70);
  });

  test('map intel includes newly created country trade target', () => {
    const countryKeys = {
      Россия: 'Russia',
      Индия: 'India',
      Украина: 'Ukraine',
      Бразилия: 'Brazil',
    };
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'trade-mission', country });
    const signals = buildMapSignals(next, countryKeys);
    const brazil = filterMapSignalsForMode(signals, 'trade').find((signal) => signal.countryKey === 'Brazil');

    assert.ok(brazil);
    assert.equal(brazil.marker, 'trade');
    assert.ok(brazil.activeOrders > 0);
  });

  test('engine blocks over-limit order creation', () => {
    const state = clone(initialGameState);
    const filled = {
      ...state,
      orders: [
        ...state.orders,
        ...Array.from({ length: 2 }, (_, index) => ({
          ...state.orders[0],
          id: `extra-${index}`,
        })),
      ],
    };
    const next = createStrategicOrder(filled, {
      iconKey: 'landmark',
      title: 'Лишний приказ',
      owner: 'Совет',
      target: 'Москва',
      remainingTurns: 1,
      totalTurns: 1,
      cost: { gold: 1 },
      completeText: 'Не должен выполниться.',
    });

    assert.equal(next.orders.length, filled.orders.length);
    assert.equal(next.lastNotice.kind, 'error');
  });

  test('end turn produces a living world report and nation actions', () => {
    const state = clone(initialGameState);
    const next = endTurn(state);

    assert.equal(next.turnNumber, state.turnNumber + 1);
    assert.ok(next.lastTurnReport);
    assert.equal(next.lastTurnReport.turn, next.turnNumber);
    assert.ok(next.worldEvents.length > state.worldEvents.length);
    assert.ok(next.chatMessages.length > state.chatMessages.length);
    assert.ok(next.worldTension >= 0 && next.worldTension <= 100);
  });

  test('world turn assigns explicit intentions to every nation', () => {
    const next = endTurn(clone(initialGameState));
    const player = next.nations.find((nation) => nation.id === 'russia');
    const china = next.nations.find((nation) => nation.id === 'china');
    const ukraine = next.nations.find((nation) => nation.id === 'ukraine');

    assert.ok(next.nations.every((nation) => nation.currentIntent));
    assert.ok(player.currentIntent.type === 'industry' || player.currentIntent.type === 'defense');
    assert.equal(china.currentIntent.type, 'trade');
    assert.ok(['military', 'covert', 'defense'].includes(ukraine.currentIntent.type));
    assert.ok(ukraine.currentIntent.confidence >= 55);
    assert.ok(next.lastTurnReport.summary.includes('активных намерений держав'));
  });

  test('turn report offers playable strategic responses', () => {
    const afterTurn = endTurn(clone(initialGameState));
    const responses = afterTurn.lastTurnReport.strategicResponses;
    const response = responses.find((item) => item.kind === 'counter-threat' || item.kind === 'secure-trade');
    const next = gameReducer(afterTurn, { type: 'RUN_STRATEGIC_RESPONSE', id: response.id });

    assert.ok(responses.length > 0);
    assert.ok(response);
    assert.equal(next.lastTurnReport.strategicResponses.find((item) => item.id === response.id).used, true);
    assert.ok(next.orders.length > afterTurn.orders.length);
    assert.notEqual(next.lastNotice.kind, 'error');
  });

  test('failed strategic response does not consume the response', () => {
    const afterTurn = endTurn(clone(initialGameState));
    const response = afterTurn.lastTurnReport.strategicResponses.find((item) => item.kind === 'counter-threat');
    const drained = {
      ...afterTurn,
      resources: afterTurn.resources.map((resource) => ({ ...resource, value: 0 })),
    };
    const next = gameReducer(drained, { type: 'RUN_STRATEGIC_RESPONSE', id: response.id });

    assert.equal(next.lastNotice.kind, 'error');
    assert.equal(next.lastTurnReport.strategicResponses.find((item) => item.id === response.id).used, undefined);
  });

  test('completed orders can change nation dossier pressure and threat', () => {
    const state = {
      ...clone(initialGameState),
      orders: [
        {
          id: 'nation-delta-success',
          iconKey: 'shield',
          title: 'Проверочные контрмеры',
          owner: 'Оперативный штаб',
          target: 'Украина',
          status: 'В работе',
          statusClass: 'progress',
          due: '1 день',
          remainingTurns: 1,
          totalTurns: 1,
          cost: { gold: 10 },
          completeText: 'Контрмеры снизили давление.',
          riskLevel: 'low',
          successChance: 100,
          nationDelta: { Украина: { threat: -18, pressure: -18 } },
        },
      ],
    };
    const next = endTurn(state);
    const changedUkraine = next.nations.find((nation) => nation.name === 'Украина');
    const baselineUkraine = endTurn(clone(initialGameState)).nations.find((nation) => nation.name === 'Украина');

    assert.ok(changedUkraine.threat < baselineUkraine.threat);
    assert.ok(changedUkraine.pressure < baselineUkraine.pressure);
  });

  test('map intel exposes nation intentions in map modes', () => {
    const next = endTurn(clone(initialGameState));
    const countryKeys = {
      Россия: 'Russia',
      Индия: 'India',
      Украина: 'Ukraine',
      Германия: 'Germany',
      Китай: 'China',
    };
    const signals = buildMapSignals(next, countryKeys);
    const germany = filterMapSignalsForMode(signals, 'trade').find((signal) => signal.countryKey === 'Germany');
    const ukraine = filterMapSignalsForMode(signals, 'strategy').find((signal) => signal.countryKey === 'Ukraine');

    assert.ok(germany);
    assert.equal(germany.intentType, 'industry');
    assert.equal(germany.marker, 'trade');
    assert.ok(ukraine);
    assert.equal(ukraine.intentType, 'military');
    assert.equal(ukraine.marker, 'military');
  });

  test('reckless completed order can fail with validated consequences', () => {
    const state = {
      ...clone(initialGameState),
      orders: [
        {
          id: 'forced-fail',
          iconKey: 'swords',
          title: 'Опасная проверка границы',
          owner: 'Генеральный штаб',
          target: 'Украина',
          status: 'В работе',
          statusClass: 'progress',
          due: '1 день',
          remainingTurns: 1,
          totalTurns: 1,
          cost: { gold: 10 },
          reward: { gold: 5000 },
          completeText: 'Не должен пройти.',
          riskLevel: 'critical',
          successChance: 0,
          failureCost: { gold: -250, grain: -100 },
          failureDiplomacyDelta: { Украина: -8 },
          failureText: 'Проверочный приказ провален, ресурсы потеряны.',
        },
      ],
    };
    const next = endTurn(state);

    assert.ok(next.lastTurnReport.completedOrders.some((order) => !order.succeeded));
    assert.ok(next.lastTurnReport.warnings.length > 0);
    assert.ok(next.diplomacy.find((relation) => relation.name === 'Украина').score < -80);
    assert.equal(next.orders.length, 0);
  });

  console.log(JSON.stringify({ passed: results.length, tests: results }, null, 2));
} finally {
  await server.close();
}
