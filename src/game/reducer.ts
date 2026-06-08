import { fallbackJudgeCouncilCommand, validateEngineEffect } from './fallbackArbitrator';
import {
  MAX_CHAT_MESSAGES,
  MAX_OPERATION_PLANS,
  cancelOrder,
  createNotice,
  endTurn,
  oncePerTurnQuickActions,
  pushTimeline,
  dismissOperationPlan,
  refineOperationPlan,
  respondToLetter,
  runCountryIntelAction,
  runOperationPlan,
  runStrategicResponse,
} from './engine';
import type {
  ChatMessage,
  EngineEffect,
  GameAction,
  GameState,
  OperationPlan,
  OperationPlanKind,
  OrderDraft,
  QuickActionId,
} from './types';

function markQuickAction(state: GameState, id: QuickActionId) {
  return { ...state.quickActionTurns, [id]: state.turnNumber };
}

function quickActionAlreadyUsed(state: GameState, id: QuickActionId) {
  return oncePerTurnQuickActions.has(id) && state.quickActionTurns[id] === state.turnNumber;
}

function appendChatMessages(state: GameState, messages: ChatMessage[]) {
  return {
    ...state,
    chatMessages: [...state.chatMessages, ...messages].slice(-MAX_CHAT_MESSAGES),
    nextActionId: state.nextActionId + messages.length,
  };
}

function riskChance(risk: NonNullable<OrderDraft['riskLevel']>) {
  if (risk === 'critical') return 36;
  if (risk === 'high') return 58;
  if (risk === 'medium') return 76;
  return 92;
}

function planKindFromOrder(order: OrderDraft): OperationPlanKind {
  if (order.iconKey === 'anchor') return 'trade';
  if (order.iconKey === 'shield' || order.iconKey === 'swords') return 'military';
  if (order.iconKey === 'mail') return 'diplomacy';
  if (order.iconKey === 'landmark' || order.iconKey === 'pickaxe') return 'infrastructure';
  return 'stability';
}

function fallbackRelationForSelectedStatus(status: string) {
  if (status === 'russia') return 200;
  if (status === 'ally') return 115;
  if (status === 'friendly') return 64;
  if (status === 'neutral') return 0;
  if (status === 'risk') return -34;
  if (status === 'hostile') return -78;
  return -6;
}

function diplomacyDeltaForCouncilOrder(state: GameState, delta: Record<string, number> = {}) {
  return Object.fromEntries(
    Object.entries(delta).map(([countryName, change]) => {
      const known = state.diplomacy.some((relation) => relation.name === countryName);
      const selected = state.selectedCountry?.name === countryName ? state.selectedCountry : null;
      const base = !known && selected ? fallbackRelationForSelectedStatus(selected.status) : 0;

      return [countryName, base + change];
    }),
  );
}

function councilProposalId(state: GameState, tag: string) {
  return `proposal-${state.turnNumber}-${state.nextActionId}-${tag.toLowerCase().replace(/[^a-zа-я0-9-]+/gi, '-')}`;
}

function upsertCouncilProposal(plans: OperationPlan[], plan: OperationPlan) {
  const withoutSameProposal = plans.filter(
    (item) => !(item.target === plan.target && item.kind === plan.kind && item.title === plan.title),
  );

  return [plan, ...withoutSameProposal]
    .filter((item) => item.expiresTurn >= plan.createdTurn)
    .slice(0, MAX_OPERATION_PLANS);
}

function orderToCouncilProposal(
  state: GameState,
  order: OrderDraft,
  sourceText: string,
  summary = `Совет разобрал распоряжение и подготовил приказ "${order.title}". Утверждение потратит ресурсы и поставит приказ в работу.`,
): OperationPlan {
  const riskLevel = order.riskLevel || 'medium';

  return {
    id: councilProposalId(state, order.title),
    kind: planKindFromOrder(order),
    target: order.target,
    title: order.title,
    summary,
    advisor: order.owner,
    iconKey: order.iconKey,
    owner: order.owner,
    durationTurns: order.remainingTurns,
    riskLevel,
    successChance: order.successChance ?? riskChance(riskLevel),
    createdTurn: state.turnNumber,
    expiresTurn: state.turnNumber + 2,
    cost: order.cost || {},
    reward: order.reward,
    diplomacyDelta: order.diplomacyDelta,
    nationDelta: order.nationDelta,
    failureCost: order.failureCost,
    failureDiplomacyDelta: order.failureDiplomacyDelta,
    failureNationDelta: order.failureNationDelta,
    completeText: order.completeText,
    letter: order.letter,
    failureText:
      order.failureText ||
      `Если план "${order.title}" сорвется, совет потеряет время, часть ресурсов и влияние у цели "${order.target}".`,
    origin: 'council',
    sourceText,
    refinements: 0,
  };
}

function effectToCouncilProposal(state: GameState, effect: EngineEffect, sourceText: string): OperationPlan | null {
  if (effect.kind === 'create-order' && effect.order) return orderToCouncilProposal(state, effect.order, sourceText);

  if (effect.kind === 'diplomacy-delta') {
    const target = Object.keys(effect.diplomacyDelta || {})[0] || state.selectedCountry?.name || 'Франция';
    const diplomacyDelta = diplomacyDeltaForCouncilOrder(state, effect.diplomacyDelta);

    return orderToCouncilProposal(
      state,
      {
        iconKey: 'mail',
        title: `Дипломатический ход: ${target}`,
        owner: 'Канцелярия',
        target,
        remainingTurns: 1,
        totalTurns: 1,
        cost: { gold: 220 },
        reward: { gold: 160 },
        diplomacyDelta,
        letter: effect.letter,
        completeText: effect.eventText || `Канцелярия провела осторожные переговоры с целью "${target}".`,
        failureText: `Переговоры с целью "${target}" могут сорваться, если другая сторона увидит давление или слабую выгоду.`,
        riskLevel: 'low',
        successChance: 90,
      },
      sourceText,
      `Совет предлагает оформить дипломатический ход. Утверждение создаст приказ канцелярии и изменит отношения только после исполнения.`,
    );
  }

  if (effect.kind === 'resource-delta') {
    return orderToCouncilProposal(
      state,
      {
        iconKey: 'landmark',
        title: 'Внутреннее распоряжение Совета',
        owner: 'Внутренний совет',
        target: 'Россия',
        remainingTurns: 1,
        totalTurns: 1,
        cost: { gold: 180 },
        reward: effect.resourceDelta,
        completeText: effect.eventText || 'Внутренний совет провел распоряжение и изменил баланс ресурсов.',
        failureText: 'Внутреннее распоряжение может потерять часть золота без заметного результата.',
        riskLevel: 'low',
        successChance: 94,
      },
      sourceText,
      'Совет предлагает внутреннее распоряжение. Ресурсный эффект появится только после утверждения и исполнения.',
    );
  }

  return null;
}

function addCouncilProposal(state: GameState, plan: OperationPlan, notice = 'Совет подготовил предложение') {
  return createNotice(
    {
      ...state,
      operationPlans: upsertCouncilProposal(state.operationPlans, plan),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '⚑',
        tone: plan.riskLevel === 'high' || plan.riskLevel === 'critical' ? 'bronze' : 'blue',
        title: 'Совет подготовил предложение',
        text: `${plan.title}. Шанс ${plan.successChance}%, срок ${plan.durationTurns} ход.`,
      }),
    },
    notice,
  );
}

function flagForCountry(state: GameState, countryName: string, fallback = 'neutral') {
  return (
    state.nations.find((nation) => nation.name === countryName)?.flag ||
    state.diplomacy.find((relation) => relation.name === countryName)?.flag ||
    fallback
  );
}

function submitCouncilMessage(state: GameState, text: string, time: string): GameState {
  const withMessage = appendChatMessages(state, [
    {
      id: `chat-${state.nextActionId}`,
      channel: 'council',
      time,
      flag: 'russia',
      faction: 'Россия',
      text,
    },
  ]);
  const decision = fallbackJudgeCouncilCommand(text, withMessage);
  const effect = validateEngineEffect(decision, withMessage);
  const proposal = effectToCouncilProposal(withMessage, effect, text);
  const proposed = proposal
    ? addCouncilProposal(withMessage, proposal, 'Совет подготовил предложение')
    : createNotice(
        {
          ...withMessage,
          timelineEvents:
            effect.kind === 'event-only' && (effect.eventTitle || effect.eventText)
              ? pushTimeline(withMessage.timelineEvents, {
                  icon: '◎',
                  tone: 'blue',
                  title: effect.eventTitle || 'Совет получил сообщение',
                  text: effect.eventText || 'Канцелярия зафиксировала сообщение правителя без создания приказа.',
                })
              : withMessage.timelineEvents,
        },
        effect.kind === 'blocked' ? effect.reason || 'Совет отклонил действие' : 'Совет принял сообщение',
        effect.kind === 'blocked' ? 'error' : 'success',
      );

  const advisorText =
    effect.kind === 'blocked'
      ? decision.playerFacingResult
      : proposal
        ? `Я подготовил предложение "${proposal.title}". Проверь цену, риск и шанс в панели приказов, затем утверди, уточни или отложи.`
        : decision.playerFacingResult;

  return appendChatMessages(proposed, [
    {
      id: `chat-${proposed.nextActionId}-advisor`,
      channel: 'council',
      time,
      flag: 'neutral',
      faction: 'Совет',
      text: advisorText,
    },
  ]);
}

function pickWorldResponder(state: GameState) {
  if (state.selectedCountry && state.selectedCountry.name !== 'Россия') {
    return {
      name: state.selectedCountry.name,
      flag: flagForCountry(state, state.selectedCountry.name, state.selectedCountry.key),
    };
  }

  const pressuredNation = [...state.nations]
    .filter((nation) => nation.name !== 'Россия')
    .sort((first, second) => second.pressure + second.threat - (first.pressure + first.threat))[0];

  return {
    name: pressuredNation?.name || 'Мировая канцелярия',
    flag: pressuredNation?.flag || 'neutral',
  };
}

function submitWorldMessage(state: GameState, text: string, time: string): GameState {
  const responder = pickWorldResponder(state);
  const withMessages = appendChatMessages(state, [
    {
      id: `world-chat-player-${state.nextActionId}`,
      channel: 'world',
      time,
      flag: 'russia',
      faction: 'Россия',
      text,
    },
    {
      id: `world-chat-reaction-${state.nextActionId + 1}`,
      channel: 'world',
      time,
      flag: responder.flag,
      faction: responder.name,
      text: `${responder.name} отмечает публичное заявление России. Дальнейшая реакция будет зависеть от приказов, писем и следующего хода.`,
    },
  ]);

  return createNotice(
    {
      ...withMessages,
      timelineEvents: pushTimeline(withMessages.timelineEvents, {
        icon: '☉',
        tone: 'blue',
        title: 'Публичное заявление России',
        text: `Россия выступила в мировом канале: "${text}".`,
      }),
    },
    'Заявление опубликовано в мировом канале',
  );
}

function pickAllianceResponder(state: GameState) {
  const ally = [...state.diplomacy]
    .filter((relation) => relation.tone === 'ally' || relation.score >= 100)
    .sort((first, second) => second.score - first.score)[0];

  if (ally) {
    return {
      name: ally.name,
      flag: flagForCountry(state, ally.name, ally.flag),
      score: ally.score,
    };
  }

  return {
    name: 'Союзный секретариат',
    flag: 'neutral',
    score: 0,
  };
}

function submitAllianceMessage(state: GameState, text: string, time: string): GameState {
  const ally = pickAllianceResponder(state);
  const allyText =
    ally.score > 0
      ? `${ally.name} получил закрытое сообщение России. Союзники ждут, подтвердите ли вы план приказом или дипломатическим письмом.`
      : 'Закрытый канал сохранен, но надежных союзников мало. Сначала укрепите отношения через дипломатию или письма.';
  const withMessages = appendChatMessages(state, [
    {
      id: `alliance-chat-player-${state.nextActionId}`,
      channel: 'alliance',
      time,
      flag: 'russia',
      faction: 'Россия',
      text,
    },
    {
      id: `alliance-chat-reply-${state.nextActionId + 1}`,
      channel: 'alliance',
      time,
      flag: ally.flag,
      faction: ally.name,
      text: allyText,
    },
  ]);

  return createNotice(
    {
      ...withMessages,
      timelineEvents: pushTimeline(withMessages.timelineEvents, {
        icon: '◌',
        tone: ally.score > 0 ? 'green' : 'bronze',
        title: 'Закрытая связь с союзниками',
        text: `Россия отправила союзному каналу сообщение: "${text}".`,
      }),
    },
    ally.score > 0 ? 'Сообщение отправлено союзникам' : 'Союзный канал требует дипломатической опоры',
    ally.score > 0 ? 'success' : 'error',
  );
}

function runQuickAction(state: GameState, id: QuickActionId): GameState {
  if (quickActionAlreadyUsed(state, id)) {
    if (id === 'compose-letter') return createNotice(state, 'Совет уже подготовил письмо союзникам в этом ходу', 'error');
    if (id === 'manage-lands') return createNotice(state, 'Совет уже подготовил хозяйственный ход в этом ходу', 'error');
    if (id === 'diplomacy') return createNotice(state, 'Совет уже подготовил дипломатический зонд в этом ходу', 'error');
  }

  if (id === 'compose-letter') {
    return addCouncilProposal(
      { ...state, quickActionTurns: markQuickAction(state, id) },
      orderToCouncilProposal(
        state,
        {
          iconKey: 'mail',
          title: 'Письмо союзникам о координации',
          owner: 'Канцелярия',
          target: 'Союзники',
          remainingTurns: 1,
          totalTurns: 1,
          cost: { gold: 160 },
          reward: { gold: 120 },
          diplomacyDelta: { Китай: 2, Индия: 2 },
          completeText: 'Канцелярия отправила союзникам координационное письмо: закрытый канал стал устойчивее.',
          failureText: 'Союзники сочли письмо слишком общим: золото потрачено, но канал почти не усилился.',
          riskLevel: 'low',
          successChance: 94,
        },
        'Быстрое действие: письмо союзникам',
        'Совет предлагает сначала утвердить письмо союзникам. После исполнения оно укрепит закрытый дипломатический канал.',
      ),
      'Совет подготовил письмо союзникам',
    );
  }

  if (id === 'manage-lands') {
    return addCouncilProposal(
      { ...state, quickActionTurns: markQuickAction(state, id) },
      orderToCouncilProposal(
        state,
        {
          iconKey: 'landmark',
          title: 'Хозяйственный ход: упорядочить земли',
          owner: 'Внутренний совет',
          target: 'Россия',
          remainingTurns: 1,
          totalTurns: 1,
          cost: { gold: 380, wood: 220, stone: 180 },
          reward: { gold: 520, grain: 420 },
          nationDelta: { Россия: { stability: 4, pressure: -5 } },
          completeText: 'Земли упорядочены: сбор налогов и движение зерна стали устойчивее.',
          failureText: 'Перепись земель затянулась: часть ресурсов ушла на исправление ошибок чиновников.',
          riskLevel: 'low',
          successChance: 96,
        },
        'Быстрое действие: хозяйственный ход',
        'Совет предлагает хозяйственный ход: безопасный внутренний приказ с понятной ценой и быстрым результатом.',
      ),
      'Совет подготовил хозяйственный ход',
    );
  }

  if (id === 'trade-routes') {
    return addCouncilProposal(
      state,
      orderToCouncilProposal(
        state,
        {
          iconKey: 'anchor',
          title: 'Расширить торговый маршрут в Индию',
          owner: 'Торговый совет',
          target: 'Индия',
          remainingTurns: 2,
          totalTurns: 2,
          cost: { gold: 360, grain: 180 },
          reward: { gold: 1250, grain: 480 },
          diplomacyDelta: { Индия: 5 },
          completeText: 'Новый торговый маршрут увеличил доход и укрепил отношения с Индией.',
          failureText: 'Караван не закрепил маршрут: часть зерна потеряна, Индия ждёт гарантий безопасности.',
          riskLevel: 'low',
          successChance: 90,
        },
        'Быстрое действие: торговый план',
        'Торговый совет предлагает удобный план для Индии: прибыль высокий, риск низкий, но маршрут нужно утвердить.',
      ),
      'Совет подготовил торговый план',
    );
  }

  if (id === 'recruit-army') {
    return addCouncilProposal(
      state,
      orderToCouncilProposal(
        state,
        {
          iconKey: 'shield',
          title: 'Сформировать новую полевую армию',
          owner: 'Генеральный штаб',
          target: 'Москва',
          remainingTurns: 3,
          totalTurns: 3,
          cost: { gold: 820, iron: 520, grain: 360, population: 0.2 },
          reward: { iron: 160 },
          nationDelta: { Россия: { army: 6, threat: -2, pressure: -2 } },
          completeText: 'Новая полевая армия готова к переброске и усилила безопасность державы.',
          failureText: 'Набор сорвался из-за снабжения: часть золота и зерна потрачена без полноценной армии.',
          riskLevel: 'medium',
          successChance: 78,
        },
        'Быстрое действие: военный набор',
        'Генеральный штаб предлагает набор армии. Это дорого, но укрепляет державу и открывает пространство для операций.',
      ),
      'Совет подготовил военный набор',
    );
  }

  if (id === 'diplomacy') {
    return addCouncilProposal(
      { ...state, quickActionTurns: markQuickAction(state, id) },
      orderToCouncilProposal(
        state,
        {
          iconKey: 'mail',
          title: 'Дипломатический зонд: Франция и Турция',
          owner: 'Канцелярия',
          target: 'Франция',
          remainingTurns: 1,
          totalTurns: 1,
          cost: { gold: 260 },
          reward: { gold: 180 },
          diplomacyDelta: { Франция: 4, Турция: 2 },
          completeText: 'Франция и Турция получили осторожные предложения о сотрудничестве.',
          failureText: 'Дипломатический зонд вышел слишком расплывчатым: отношения почти не изменились.',
          riskLevel: 'low',
          successChance: 88,
        },
        'Быстрое действие: дипломатический зонд',
        'Канцелярия предлагает мягкий дипломатический зонд: он не подписывает договор сразу, а открывает пространство для ответа.',
      ),
      'Совет подготовил дипломатический зонд',
    );
  }

  const target = state.selectedCountry?.name || 'Москва';
  return addCouncilProposal(
    state,
    orderToCouncilProposal(
      state,
      {
        iconKey: 'landmark',
        title: `Развить инфраструктуру: ${target}`,
        owner: 'Совет по развитию',
        target,
        remainingTurns: 2,
        totalTurns: 2,
        cost: { gold: 520, wood: 260, stone: 220 },
        reward: { stone: 620, gold: 260 },
        completeText: `Инфраструктура в цели "${target}" улучшена: логистика и сбор налогов стали эффективнее.`,
        failureText: `Инфраструктурный ход по цели "${target}" может затянуться и потерять часть материалов.`,
        riskLevel: 'medium',
        successChance: 80,
      },
      'Быстрое действие: черновик приказа',
      `Совет подготовил черновик по цели "${target}". Проверьте цену и риск перед утверждением.`,
    ),
    'Совет подготовил черновик приказа',
  );
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'SELECT_COUNTRY') {
    return createNotice(
      {
        ...state,
        selectedCountry: action.country,
      },
      `Выбрана страна: ${action.country.name}`,
    );
  }

  if (action.type === 'CLEAR_SELECTED_COUNTRY') {
    return {
      ...state,
      selectedCountry: null,
    };
  }

  if (action.type === 'SUBMIT_COUNCIL_MESSAGE') {
    return submitCouncilMessage(state, action.text, action.time);
  }

  if (action.type === 'SUBMIT_CHAT_MESSAGE') {
    if (action.channel === 'council') return submitCouncilMessage(state, action.text, action.time);
    if (action.channel === 'world') return submitWorldMessage(state, action.text, action.time);
    return submitAllianceMessage(state, action.text, action.time);
  }

  if (action.type === 'RUN_QUICK_ACTION') return runQuickAction(state, action.id);
  if (action.type === 'RUN_COUNTRY_INTEL_ACTION') return runCountryIntelAction(state, action.id, action.country);
  if (action.type === 'RUN_STRATEGIC_RESPONSE') return runStrategicResponse(state, action.id);
  if (action.type === 'RUN_OPERATION_PLAN') return runOperationPlan(state, action.id);
  if (action.type === 'REFINE_OPERATION_PLAN') return refineOperationPlan(state, action.id);
  if (action.type === 'DISMISS_OPERATION_PLAN') return dismissOperationPlan(state, action.id);
  if (action.type === 'RESPOND_TO_LETTER') return respondToLetter(state, action.letterId, action.responseId);
  if (action.type === 'CANCEL_ORDER') return cancelOrder(state, action.id);
  if (action.type === 'END_TURN') return endTurn(state);

  return state;
}
