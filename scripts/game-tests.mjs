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
  const { createStrategicOrder, endTurn } = await server.ssrLoadModule('/src/game/engine.ts');
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
