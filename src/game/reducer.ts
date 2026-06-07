import { fallbackJudgeCouncilCommand, validateEngineEffect } from './fallbackArbitrator';
import {
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
  runCountryIntelAction,
  runStrategicResponse,
} from './engine';
import type { GameAction, GameState, OrderDraft, QuickActionId, ResourceDelta } from './types';

function markQuickAction(state: GameState, id: QuickActionId) {
  return { ...state.quickActionTurns, [id]: state.turnNumber };
}

function quickActionAlreadyUsed(state: GameState, id: QuickActionId) {
  return oncePerTurnQuickActions.has(id) && state.quickActionTurns[id] === state.turnNumber;
}

function quickOrder(state: GameState, order: OrderDraft) {
  return createStrategicOrder(state, order);
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

  if (action.type === 'SUBMIT_COUNCIL_MESSAGE') {
    const withMessage: GameState = {
      ...state,
      chatMessages: [
        ...state.chatMessages,
        {
          id: `chat-${state.nextActionId}`,
          time: action.time,
          flag: 'russia',
          faction: 'Россия',
          text: action.text,
        },
      ],
    };
    const decision = fallbackJudgeCouncilCommand(action.text, withMessage);
    const effect = validateEngineEffect(decision, withMessage);
    const applied = applyValidatedEffect(withMessage, effect);

    if (effect.kind === 'blocked') {
      return {
        ...applied,
        chatMessages: [
          ...applied.chatMessages,
          {
            id: `chat-${applied.nextActionId}-advisor`,
            time: action.time,
            flag: 'neutral',
            faction: 'Совет',
            text: decision.playerFacingResult,
          },
        ],
      };
    }

    return {
      ...applied,
      chatMessages: [
        ...applied.chatMessages,
        {
          id: `chat-${applied.nextActionId}-advisor`,
          time: action.time,
          flag: 'neutral',
          faction: 'Совет',
          text: decision.playerFacingResult,
        },
      ],
    };
  }

  if (action.type === 'RUN_QUICK_ACTION') return runQuickAction(state, action.id);
  if (action.type === 'RUN_COUNTRY_INTEL_ACTION') return runCountryIntelAction(state, action.id, action.country);
  if (action.type === 'RUN_STRATEGIC_RESPONSE') return runStrategicResponse(state, action.id);
  if (action.type === 'CANCEL_ORDER') return cancelOrder(state, action.id);
  if (action.type === 'END_TURN') return endTurn(state);

  return state;
}
