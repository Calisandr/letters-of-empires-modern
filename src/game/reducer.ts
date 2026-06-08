import { fallbackJudgeCouncilCommand, validateEngineEffect } from './fallbackArbitrator';
import {
  MAX_CHAT_MESSAGES,
  applyDiplomacyDelta,
  applyResourceDelta,
  applyValidatedEffect,
  cancelOrder,
  createNotice,
  createStrategicOrder,
  endTurn,
  oncePerTurnQuickActions,
  pushLetter,
  pushTimeline,
  dismissOperationPlan,
  respondToLetter,
  runCountryIntelAction,
  runOperationPlan,
  runStrategicResponse,
} from './engine';
import type { ChatMessage, GameAction, GameState, OrderDraft, QuickActionId, ResourceDelta } from './types';

function markQuickAction(state: GameState, id: QuickActionId) {
  return { ...state.quickActionTurns, [id]: state.turnNumber };
}

function quickActionAlreadyUsed(state: GameState, id: QuickActionId) {
  return oncePerTurnQuickActions.has(id) && state.quickActionTurns[id] === state.turnNumber;
}

function quickOrder(state: GameState, order: OrderDraft) {
  return createStrategicOrder(state, order);
}

function appendChatMessages(state: GameState, messages: ChatMessage[]) {
  return {
    ...state,
    chatMessages: [...state.chatMessages, ...messages].slice(-MAX_CHAT_MESSAGES),
    nextActionId: state.nextActionId + messages.length,
  };
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
  const applied = applyValidatedEffect(withMessage, effect);

  return appendChatMessages(applied, [
    {
      id: `chat-${applied.nextActionId}-advisor`,
      channel: 'council',
      time,
      flag: 'neutral',
      faction: 'Совет',
      text: decision.playerFacingResult,
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
    if (id === 'compose-letter') return createNotice(state, 'Канцелярия уже отправила письмо в этом ходу', 'error');
    if (id === 'manage-lands') return createNotice(state, 'Земли уже перераспределены в этом ходу', 'error');
    if (id === 'diplomacy') return createNotice(state, 'Дипломаты уже ведут переговоры в этом ходу', 'error');
  }

  if (id === 'compose-letter') {
    return createNotice(
      {
        ...state,
        quickActionTurns: markQuickAction(state, id),
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '✉',
          tone: 'blue',
          title: 'Письмо союзникам отправлено',
          text: 'Канцелярия направила исходящее письмо союзникам. Ответ появится во входящих после дипломатического хода.',
        }),
      },
      'Письмо отправлено союзникам',
    );
  }

  if (id === 'manage-lands') {
    const cost: ResourceDelta = { gold: 380, wood: 220, stone: 180 };
    const nextResources = applyResourceDelta(state.resources, { gold: -380, wood: -220, stone: -180 }).map((resource) => {
      if (resource.id === 'grain') return { ...resource, perTurn: resource.perTurn + 90 };
      if (resource.id === 'gold') return { ...resource, perTurn: resource.perTurn + 45 };
      return resource;
    });
    const canAfford = state.resources.every((resource) => (cost[resource.id] || 0) <= resource.value);

    if (!canAfford) return createNotice(state, 'Не хватает ресурсов для управления землями', 'error');

    return createNotice(
      {
        ...state,
        quickActionTurns: markQuickAction(state, id),
        resources: nextResources,
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '♜',
          tone: 'green',
          title: 'Земли упорядочены',
          text: 'Новые управленцы повысили доход золота и зерна за ход.',
        }),
      },
      'Доходы земель выросли',
    );
  }

  if (id === 'trade-routes') {
    return quickOrder(state, {
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
    });
  }

  if (id === 'recruit-army') {
    return quickOrder(state, {
      iconKey: 'shield',
      title: 'Сформировать новую полевую армию',
      owner: 'Генеральный штаб',
      target: 'Москва',
      remainingTurns: 3,
      totalTurns: 3,
      cost: { gold: 820, iron: 520, grain: 360, population: 0.2 },
      reward: { iron: 160 },
      completeText: 'Новая полевая армия готова к переброске и усилила безопасность державы.',
    });
  }

  if (id === 'diplomacy') {
    return createNotice(
      {
        ...state,
        quickActionTurns: markQuickAction(state, id),
        diplomacy: applyDiplomacyDelta(state.diplomacy, { Франция: 4, Турция: 2 }),
        letters: pushLetter(state.letters, {
          tone: 'gold',
          from: 'Франция',
          subject: 'Ответ на переговоры',
          time: 'только что',
        }),
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '◎',
          tone: 'green',
          title: 'Дипломаты начали переговоры',
          text: 'Франция и Турция получили новые предложения о сотрудничестве.',
        }),
      },
      'Дипломатия улучшена',
    );
  }

  const target = state.selectedCountry?.name || 'Москва';
  return quickOrder(state, {
    iconKey: 'landmark',
    title: `Развить инфраструктуру: ${target}`,
    owner: 'Совет по развитию',
    target,
    remainingTurns: 2,
    totalTurns: 2,
    cost: { gold: 520, wood: 260, stone: 220 },
    reward: { stone: 620, gold: 260 },
    completeText: `Инфраструктура в цели "${target}" улучшена: логистика и сбор налогов стали эффективнее.`,
  });
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
  if (action.type === 'DISMISS_OPERATION_PLAN') return dismissOperationPlan(state, action.id);
  if (action.type === 'RESPOND_TO_LETTER') return respondToLetter(state, action.letterId, action.responseId);
  if (action.type === 'CANCEL_ORDER') return cancelOrder(state, action.id);
  if (action.type === 'END_TURN') return endTurn(state);

  return state;
}
