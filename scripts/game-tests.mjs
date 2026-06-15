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
  const { applyValidatedEffect, createStrategicOrder, endTurn, getLetterRuntimeId, pushLetter } = await server.ssrLoadModule(
    '/src/game/engine.ts',
  );
  const { loadGameState } = await server.ssrLoadModule('/src/game/storage.ts');
  const { buildMapSignals, filterMapSignalsForMode } = await server.ssrLoadModule('/src/game/mapIntel.ts');
  const { fallbackJudgeCouncilCommand, validateEngineEffect } = await server.ssrLoadModule(
    '/src/game/fallbackArbitrator.ts',
  );

  const results = [];
  const test = (name, fn) => {
    fn();
    results.push(name);
  };

  test('quick trade action prepares a council proposal before spending resources', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, { type: 'RUN_QUICK_ACTION', id: 'trade-routes' });
    const plan = next.operationPlans[0];

    assert.equal(next.orders.length, state.orders.length);
    assert.equal(next.operationPlans.length, state.operationPlans.length + 1);
    assert.ok(plan.title.includes('торговый маршрут'));
    assert.equal(next.resources.find((resource) => resource.id === 'gold').value, state.resources.find((resource) => resource.id === 'gold').value);
    assert.ok(
      next.chatMessages
        .slice(state.chatMessages.length)
        .some((message) => message.channel === 'council' && message.faction === 'Совет' && message.text.includes('рабочее предложение')),
    );
    assert.equal(next.lastNotice.kind, 'success');

    const launched = gameReducer(next, { type: 'RUN_OPERATION_PLAN', id: plan.id });

    assert.equal(launched.orders.length, state.orders.length + 1);
    assert.ok(!launched.operationPlans.some((item) => item.id === plan.id));
    assert.ok(launched.resources.find((resource) => resource.id === 'gold').value < state.resources.find((resource) => resource.id === 'gold').value);
  });

  test('council proposal can be refined before approval', () => {
    const prepared = gameReducer(clone(initialGameState), { type: 'RUN_QUICK_ACTION', id: 'recruit-army' });
    const plan = prepared.operationPlans[0];
    const beforeGold = prepared.resources.find((resource) => resource.id === 'gold').value;
    const refined = gameReducer(prepared, { type: 'REFINE_OPERATION_PLAN', id: plan.id });
    const refinedPlan = refined.operationPlans.find((item) => item.id === plan.id);

    assert.ok(refinedPlan);
    assert.equal(refinedPlan.refinements, 1);
    assert.ok(refinedPlan.successChance > plan.successChance);
    assert.ok(refinedPlan.riskLevel === 'low' || refinedPlan.riskLevel === 'medium');
    assert.ok(refined.resources.find((resource) => resource.id === 'gold').value < beforeGold);
    assert.equal(refined.lastNotice.kind, 'success');
  });

  test('repeatable quick action refreshes a council proposal without turn locks', () => {
    const state = clone(initialGameState);
    const afterFirst = gameReducer(state, { type: 'RUN_QUICK_ACTION', id: 'manage-lands' });
    const afterSecond = gameReducer(afterFirst, { type: 'RUN_QUICK_ACTION', id: 'manage-lands' });

    assert.equal(afterSecond.lastNotice.kind, 'success');
    assert.equal(afterSecond.orders.length, afterFirst.orders.length);
    assert.ok(afterSecond.operationPlans.some((plan) => plan.title.includes('Хозяйственное решение')));
  });

  test('cancelled order is removed from active orders and logged', () => {
    const state = clone(initialGameState);
    const orderId = state.orders[0].id;
    const next = gameReducer(state, { type: 'CANCEL_ORDER', id: orderId });

    assert.equal(next.orders.some((order) => order.id === orderId), false);
    assert.equal(next.lastNotice.kind, 'success');
    assert.equal(next.timelineEvents[0].title, 'Приказ отменен');
  });

  test('legacy world simulation advances internal world state', () => {
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

  test('council command creates a validated proposal that can be approved', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Построить дороги и склады в Москве',
      time: '13:00',
    });
    const plan = next.operationPlans[0];

    assert.equal(next.orders.length, state.orders.length);
    assert.equal(next.operationPlans.length, state.operationPlans.length + 1);
    assert.ok(plan.title.length > 3);
    assert.ok(next.timelineEvents[0].title.includes('Совет подготовил предложение'));
    assert.ok(next.chatMessages.some((message) => message.faction === 'Совет' && message.channel === 'council'));

    const approved = gameReducer(next, { type: 'RUN_OPERATION_PLAN', id: plan.id });

    assert.equal(approved.orders.length, state.orders.length + 1);
    assert.ok(approved.timelineEvents[0].title.includes('Новый приказ'));
  });

  test('casual council chat does not create an accidental order', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'React smoke message',
      time: '13:05',
    });

    assert.equal(next.orders.length, state.orders.length);
    assert.equal(next.operationPlans.length, state.operationPlans.length);
    assert.ok(next.chatMessages.some((message) => message.faction === 'Совет' && message.channel === 'council'));
  });

  test('world chat publishes statements without creating council orders', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_CHAT_MESSAGE',
      channel: 'world',
      text: 'Россия предлагает общий торговый коридор через Черное море',
      time: '13:15',
    });
    const newMessages = next.chatMessages.slice(state.chatMessages.length);

    assert.equal(next.orders.length, state.orders.length);
    assert.ok(newMessages.every((message) => message.channel === 'world'));
    assert.ok(newMessages.some((message) => message.faction === 'Россия'));
    assert.ok(next.timelineEvents[0].title.includes('Публичное заявление'));
  });

  test('alliance chat stays private and gets an allied reply', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'SUBMIT_CHAT_MESSAGE',
      channel: 'alliance',
      text: 'Союзникам: согласовать защиту караванов',
      time: '13:20',
    });
    const newMessages = next.chatMessages.slice(state.chatMessages.length);

    assert.equal(next.orders.length, state.orders.length);
    assert.ok(newMessages.every((message) => message.channel === 'alliance'));
    assert.ok(newMessages.some((message) => message.faction === 'Россия'));
    assert.ok(newMessages.some((message) => message.faction !== 'Россия'));
    assert.equal(next.lastNotice.kind, 'success');
  });

  test('letter response applies diplomacy and marks the letter answered', () => {
    const state = clone(initialGameState);
    const letterId = getLetterRuntimeId(state.letters[0], 0);
    const next = gameReducer(state, { type: 'RESPOND_TO_LETTER', letterId, responseId: 'accept-trade' });

    assert.equal(next.letters[0].status, 'answered');
    assert.equal(next.letters[0].answeredBy, 'Принять торговлю');
    assert.ok(next.diplomacy.find((relation) => relation.name === 'Франция').score > 75);
    assert.ok(next.resources.find((resource) => resource.id === 'gold').value < state.resources.find((resource) => resource.id === 'gold').value);
    assert.ok(next.timelineEvents[0].title.includes('Французский торговый канал'));
  });

  test('letter response can create a new diplomacy and nation dossier target', () => {
    const state = clone(initialGameState);
    const letterIndex = state.letters.findIndex((letter) => letter.from === 'Аргентина');
    const letterId = getLetterRuntimeId(state.letters[letterIndex], letterIndex);
    const next = gameReducer(state, { type: 'RESPOND_TO_LETTER', letterId, responseId: 'resource-exchange' });

    assert.ok(next.diplomacy.some((relation) => relation.name === 'Аргентина'));
    assert.ok(next.nations.some((nation) => nation.name === 'Аргентина'));
    assert.equal(next.letters[letterIndex].status, 'answered');
    assert.ok(next.resources.find((resource) => resource.id === 'gold').value > state.resources.find((resource) => resource.id === 'gold').value);
  });

  test('duplicate incoming letter reopens instead of keeping stale answered state', () => {
    const answeredLetter = {
      ...initialGameState.letters[0],
      status: 'answered',
      answeredBy: 'Проверочный ответ',
      time: 'решено',
    };
    const reopened = pushLetter([answeredLetter, ...initialGameState.letters.slice(1)], {
      ...initialGameState.letters[0],
      time: 'только что',
    });

    assert.equal(reopened[0].status, 'open');
    assert.equal(reopened[0].answeredBy, undefined);
    assert.equal(reopened[0].time, 'только что');
  });

  test('duplicate incoming letter reopens old item even below the first row', () => {
    const answeredLetter = {
      ...initialGameState.letters[1],
      status: 'answered',
      answeredBy: 'Старый ответ',
      time: 'решено',
    };
    const letters = [initialGameState.letters[0], answeredLetter, ...initialGameState.letters.slice(2)];
    const reopened = pushLetter(letters, {
      ...initialGameState.letters[1],
      time: 'только что',
    });

    assert.equal(reopened.filter((letter) => letter.from === answeredLetter.from && letter.subject === answeredLetter.subject).length, 1);
    assert.equal(reopened[0].from, answeredLetter.from);
    assert.equal(reopened[0].status, 'open');
    assert.equal(reopened[0].answeredBy, undefined);
  });

  test('diplomatic council command prepares and resolves a safe relation order', () => {
    const selected = gameReducer(clone(initialGameState), {
      type: 'SELECT_COUNTRY',
      country: { key: 'France', name: 'Франция', status: 'friendly' },
    });
    const next = gameReducer(selected, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Улучшить отношения и начать переговоры с Францией',
      time: '13:10',
    });
    const plan = next.operationPlans[0];
    const approved = gameReducer(next, { type: 'RUN_OPERATION_PLAN', id: plan.id });
    const guaranteed = { ...approved, orders: approved.orders.map((order) => ({ ...order, successChance: 100 })) };
    const resolved = endTurn(guaranteed);

    assert.equal(next.orders.length, selected.orders.length);
    assert.equal(plan.target, 'Франция');
    assert.equal(approved.orders.length, selected.orders.length + 1);
    assert.ok(resolved.diplomacy.find((relation) => relation.name === 'Франция').score > selected.diplomacy.find((relation) => relation.name === 'Франция').score);
    assert.ok(resolved.letters.some((letter) => letter.from === 'Франция'));
  });

  test('new target council diplomacy stores only a delta, not base relation', () => {
    const selected = gameReducer(clone(initialGameState), {
      type: 'SELECT_COUNTRY',
      country: { key: 'Brazil', name: 'Бразилия', status: 'friendly' },
    });
    const next = gameReducer(selected, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Улучшить отношения и начать переговоры с выбранной страной',
      time: '13:12',
    });
    const plan = next.operationPlans[0];
    const delta = plan.diplomacyDelta?.['Бразилия'];

    assert.ok(delta);
    assert.ok(delta > 0 && delta <= 10);
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

  test('council diplomacy can target a newly selected map country after approval', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const selected = gameReducer(clone(initialGameState), { type: 'SELECT_COUNTRY', country });
    const next = gameReducer(selected, {
      type: 'SUBMIT_COUNCIL_MESSAGE',
      text: 'Начать переговоры и улучшить отношения с Бразилией',
      time: '13:20',
    });
    const plan = next.operationPlans[0];
    const approved = gameReducer(next, { type: 'RUN_OPERATION_PLAN', id: plan.id });
    const guaranteed = { ...approved, orders: approved.orders.map((order) => ({ ...order, successChance: 100 })) };
    const resolved = endTurn(guaranteed);
    const relation = resolved.diplomacy.find((item) => item.name === 'Бразилия');

    assert.equal(next.orders.length, selected.orders.length);
    assert.equal(plan.target, 'Бразилия');
    assert.ok(relation);
    assert.ok(relation.score > 64);
    assert.ok(resolved.nations.some((item) => item.name === 'Бразилия'));
    assert.notEqual(resolved.lastNotice.kind, 'error');
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

  test('failed country intel trade mission does not create target diplomacy or dossier', () => {
    const country = { key: 'Brazil', name: 'Бразилия', status: 'friendly' };
    const drained = {
      ...clone(initialGameState),
      resources: initialGameState.resources.map((resource) => ({ ...resource, value: 0 })),
    };
    const next = gameReducer(drained, { type: 'RUN_COUNTRY_INTEL_ACTION', id: 'trade-mission', country });

    assert.equal(next.lastNotice.kind, 'error');
    assert.equal(next.orders.length, drained.orders.length);
    assert.equal(next.diplomacy.some((item) => item.name === 'Бразилия'), false);
    assert.equal(next.nations.some((item) => item.name === 'Бразилия'), false);
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

  test('profile update keeps nickname limited and avatar safe', () => {
    const state = clone(initialGameState);
    const next = gameReducer(state, {
      type: 'UPDATE_PROFILE',
      profile: {
        name: 'Александр Великий Победитель',
        title: 'Император',
        status: 'Проверяю границы, торговлю и дипломатические письма перед каждым решением.',
        avatarDataUrl: 'data:image/webp;base64,avatar',
      },
    });

    assert.equal(Array.from(next.profile.name).length, 15);
    assert.equal(next.profile.title, 'Правитель');
    assert.ok(next.profile.avatarDataUrl.startsWith('data:image/webp'));
    assert.equal(next.lastNotice.kind, 'success');

    const repaired = gameReducer(state, {
      type: 'UPDATE_PROFILE',
      profile: {
        name: '   ',
        title: 'Император',
        status: '',
        avatarDataUrl: 'javascript:alert(1)',
      },
    });

    assert.equal(repaired.profile.name, initialGameState.profile.name);
    assert.equal(repaired.profile.avatarDataUrl, '');
  });

  test('legacy world simulation produces a living world report and nation actions', () => {
    const state = clone(initialGameState);
    const next = endTurn(state);

    assert.equal(next.turnNumber, state.turnNumber + 1);
    assert.ok(next.lastTurnReport);
    assert.equal(next.lastTurnReport.turn, next.turnNumber);
    assert.ok(next.worldEvents.length > state.worldEvents.length);
    assert.ok(next.chatMessages.length > state.chatMessages.length);
    assert.ok(next.chatMessages.slice(state.chatMessages.length).every((message) => message.channel === 'world'));
    assert.ok(next.worldTension >= 0 && next.worldTension <= 100);
  });

  test('world report explains causes and effects of the new event', () => {
    const next = endTurn(clone(initialGameState));
    const causeLog = next.lastTurnReport.causeLog;

    assert.ok(causeLog.length >= 2);
    assert.ok(causeLog.every((item) => item.title && item.cause.length > 20 && item.effect.length > 20));
    assert.ok(causeLog.some((item) => item.title.includes('Казна')));
    assert.ok(causeLog.some((item) => item.title.includes(':') || item.title.includes('Приказ')));
    assert.ok(causeLog.every((item) => ['success', 'warning', 'danger', 'neutral'].includes(item.tone)));
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

  test('world report offers playable strategic responses', () => {
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
    assert.deepEqual(next.diplomacy, drained.diplomacy);
    assert.deepEqual(next.nations, drained.nations);
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

  test('hostile nations counter active orders before they resolve', () => {
    const state = {
      ...clone(initialGameState),
      orders: [
        {
          id: 'hostile-counter-check',
          iconKey: 'swords',
          title: 'Проверить укрепления у Украины',
          owner: 'Оперативный штаб',
          target: 'Харьков',
          status: 'В пути',
          statusClass: 'moving',
          due: '2 дня',
          remainingTurns: 2,
          totalTurns: 2,
          cost: { gold: 10 },
          completeText: 'Операция должна была пройти.',
          riskLevel: 'medium',
          successChance: 80,
          diplomacyDelta: { Украина: -2 },
        },
      ],
    };
    const next = endTurn(state);
    const order = next.orders[0];

    assert.equal(order.lastCounterMove.actor, 'Украина');
    assert.ok(order.successChance < 80);
    assert.ok(order.counterPressure > 0);
    assert.ok(next.lastTurnReport.warnings.some((warning) => warning.includes('Украина')));
  });

  test('allied nations can support active orders', () => {
    const state = {
      ...clone(initialGameState),
      orders: [
        {
          id: 'allied-support-check',
          iconKey: 'package',
          title: 'Проверить торговый коридор с Индией',
          owner: 'Торговый совет',
          target: 'Дели',
          status: 'В пути',
          statusClass: 'moving',
          due: '2 дня',
          remainingTurns: 2,
          totalTurns: 2,
          cost: { gold: 10 },
          completeText: 'Торговый коридор должен пройти.',
          riskLevel: 'low',
          successChance: 80,
          diplomacyDelta: { Индия: 2 },
        },
      ],
    };
    const next = endTurn(state);
    const order = next.orders[0];

    assert.equal(order.lastCounterMove.actor, 'Индия');
    assert.ok(order.successChance > 80);
    assert.equal(order.lastCounterMove.chanceDelta > 0, true);
    assert.ok(next.lastTurnReport.opportunities.some((opportunity) => opportunity.includes('Индия')));
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

  test('completed order can add a new diplomacy target', () => {
    const state = {
      ...clone(initialGameState),
      orders: [
        {
          id: 'test-new-diplomacy-target',
          iconKey: 'mail',
          title: 'Открыть канал с Алжиром',
          owner: 'Канцелярия',
          target: 'Алжир',
          status: 'В пути',
          statusClass: 'moving',
          due: '1 день',
          remainingTurns: 1,
          totalTurns: 1,
          reward: { gold: 10 },
          diplomacyDelta: { Алжир: 18 },
          completeText: 'Канцелярия открыла осторожный дипломатический канал с Алжиром.',
          riskLevel: 'low',
          successChance: 100,
        },
      ],
    };

    const next = endTurn(state);
    const relation = next.diplomacy.find((item) => item.name === 'Алжир');

    assert.ok(relation);
    assert.equal(relation.score, 18);
    assert.equal(next.orders.length, 0);
  });

  test('loadGameState repairs corrupted current-version save shapes', () => {
    const previousWindow = globalThis.window;
    const saved = JSON.stringify({
      version: initialGameState.version,
      resources: null,
      letters: null,
      diplomacy: null,
      nations: null,
      timelineEvents: null,
      chatMessages: null,
      quickActionTurns: [],
      selectedCountry: [],
      lastTurnReport: [],
      profile: {
        name: 'ОченьДлинныйНикнеймПравителя',
        title: 'Император',
        status: 'Короткий статус',
        avatarDataUrl: 'not-image',
      },
      turnNumber: '132',
    });

    globalThis.window = {
      localStorage: {
        getItem: () => saved,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    };

    try {
      const loaded = loadGameState();

      assert.ok(Array.isArray(loaded.resources));
      assert.ok(Array.isArray(loaded.letters));
      assert.ok(Array.isArray(loaded.diplomacy));
      assert.deepEqual(loaded.quickActionTurns, initialGameState.quickActionTurns);
      assert.equal(loaded.selectedCountry, initialGameState.selectedCountry);
      assert.equal(loaded.lastTurnReport, initialGameState.lastTurnReport);
      assert.equal(loaded.turnNumber, initialGameState.turnNumber);
      assert.equal(Array.from(loaded.profile.name).length, 15);
      assert.equal(loaded.profile.title, 'Правитель');
      assert.equal(loaded.profile.avatarDataUrl, '');
      assert.ok(loaded.chatMessages.every((message) => message.channel));
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  test('loadGameState ignores null objects inside saved arrays', () => {
    const previousWindow = globalThis.window;
    const saved = JSON.stringify({
      ...initialGameState,
      resources: [null],
      letters: [null, initialGameState.letters[0]],
      diplomacy: [null, initialGameState.diplomacy[0]],
      nations: [null, initialGameState.nations[0]],
      chatMessages: [null, initialGameState.chatMessages[0]],
    });

    globalThis.window = {
      localStorage: {
        getItem: () => saved,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    };

    try {
      const loaded = loadGameState();

      assert.equal(loaded.resources.length, initialGameState.resources.length);
      const costlyOrder = createStrategicOrder(loaded, {
        iconKey: 'landmark',
        title: 'Impossible order',
        owner: 'Council',
        target: 'Moscow',
        remainingTurns: 1,
        totalTurns: 1,
        cost: { gold: Number.MAX_SAFE_INTEGER },
        completeText: 'Should not complete.',
      });
      assert.equal(costlyOrder.orders.length, loaded.orders.length);
      assert.equal(costlyOrder.lastNotice.kind, 'error');
      assert.equal(loaded.letters.length, 1);
      assert.equal(loaded.letters[0].from, initialGameState.letters[0].from);
      assert.equal(loaded.diplomacy.length, 1);
      assert.equal(loaded.nations.length, 1);
      assert.equal(loaded.chatMessages.length, 1);
      assert.equal(loaded.chatMessages[0].channel, initialGameState.chatMessages[0].channel);
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  test('loadGameState falls back when localStorage access is blocked', () => {
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.create(null, {
        localStorage: {
          get() {
            throw new Error('blocked');
          },
        },
      }),
    });

    try {
      const loaded = loadGameState();
      assert.equal(loaded, initialGameState);
    } finally {
      delete globalThis.window;
      if (previousWindow !== undefined) {
        globalThis.window = previousWindow;
      }
    }
  });

  test('loadGameState migrates legacy chat messages into channels', () => {
    const previousWindow = globalThis.window;
    const saved = JSON.stringify({
      ...initialGameState,
      chatMessages: [
        {
          id: 'world-chat-124-france-1',
          time: '12:00',
          flag: 'france',
          faction: 'Франция',
          text: 'Публичное старое сообщение',
        },
        {
          id: 'legacy-council-message',
          time: '12:01',
          flag: 'neutral',
          faction: 'Совет',
          text: 'Старое сообщение совета',
        },
      ],
    });

    globalThis.window = {
      localStorage: {
        getItem: () => saved,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    };

    try {
      const loaded = loadGameState();

      assert.equal(loaded.chatMessages[0].channel, 'world');
      assert.equal(loaded.chatMessages[1].channel, 'council');
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
    }
  });

  console.log(JSON.stringify({ passed: results.length, tests: results }, null, 2));
} finally {
  await server.close();
}
