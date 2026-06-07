import { formatOrderDue } from './formatters';
import type {
  ActionStatusKind,
  DiplomacyRelation,
  EngineEffect,
  GameState,
  Letter,
  Order,
  OrderDraft,
  OrderStatusClass,
  QuickActionId,
  ResourceDelta,
  ResourceId,
  ResourceState,
  TimelineEvent,
} from './types';

export const MAX_ACTIVE_ORDERS = 5;
export const MAX_TIMELINE_EVENTS = 5;
export const MAX_LETTERS = 5;
export const oncePerTurnQuickActions = new Set<QuickActionId>(['compose-letter', 'manage-lands', 'diplomacy']);

export function createNotice(state: GameState, message: string, kind: ActionStatusKind = 'success') {
  return {
    ...state,
    lastNotice: { id: state.nextActionId, message, kind },
    actionStatus: { kind, message },
    nextActionId: state.nextActionId + 1,
  };
}

export function applyResourceDelta(resources: ResourceState[], delta: ResourceDelta = {}) {
  return resources.map((resource) => {
    const change = delta[resource.id] ?? 0;
    if (!change) return resource;

    return {
      ...resource,
      value: Math.max(0, Number((resource.value + change).toFixed(resource.format === 'population' ? 1 : 0))),
    };
  });
}

export function canPay(resources: ResourceState[], cost: ResourceDelta = {}) {
  return resources.every((resource) => (cost[resource.id] ?? 0) <= resource.value);
}

export function describeResourceCost(resources: ResourceState[], cost: ResourceDelta = {}) {
  return resources
    .filter((resource) => cost[resource.id])
    .map((resource) => `${resource.label}: ${Math.round(cost[resource.id] ?? 0).toLocaleString('ru-RU')}`)
    .join(', ');
}

export function relationTone(score: number): DiplomacyRelation['tone'] {
  if (score >= 100) return 'ally';
  if (score >= 50) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'risk';
  return 'hostile';
}

export function relationStatus(score: number) {
  const tone = relationTone(score);
  if (tone === 'ally') return 'Союзники';
  if (tone === 'friendly') return 'Дружественные';
  if (tone === 'neutral') return 'Нейтральные';
  if (tone === 'risk') return 'Риск конфликта';
  return 'Враждебные';
}

export function applyDiplomacyDelta(relations: DiplomacyRelation[], delta: Record<string, number> = {}) {
  return relations.map((relation) => {
    const change = delta[relation.name] ?? 0;
    if (!change) return relation;

    const score = Math.max(-100, Math.min(200, relation.score + change));
    return {
      ...relation,
      score,
      status: relationStatus(score),
      tone: relationTone(score),
    };
  });
}

export function pushTimeline(events: TimelineEvent[], event: Omit<TimelineEvent, 'time'> & { time?: string }) {
  const nextEvent = { ...event, time: event.time || 'только что' };
  const latest = events[0];

  if (latest?.title === nextEvent.title && latest.text === nextEvent.text) {
    return [{ ...latest, time: nextEvent.time }, ...events.slice(1)];
  }

  return [nextEvent, ...events].slice(0, MAX_TIMELINE_EVENTS);
}

export function pushLetter(letters: Letter[], letter: Letter) {
  const latest = letters[0];

  if (latest?.from === letter.from && latest.subject === letter.subject) {
    return [{ ...latest, time: letter.time }, ...letters.slice(1)];
  }

  return [letter, ...letters].slice(0, MAX_LETTERS);
}

export function createStrategicOrder(state: GameState, order: OrderDraft): GameState {
  const activeOrderCount = state.orders.filter((item) => item.statusClass !== 'cancelled').length;

  if (activeOrderCount >= MAX_ACTIVE_ORDERS) {
    return createNotice(state, 'Лимит приказов заполнен', 'error');
  }

  if (!canPay(state.resources, order.cost)) {
    return createNotice(state, `Не хватает ресурсов: ${describeResourceCost(state.resources, order.cost)}`, 'error');
  }

  const costDelta = Object.fromEntries(
    Object.entries(order.cost || {}).map(([key, value]) => [key, -value]),
  ) as ResourceDelta;
  const nextId = state.nextActionId;
  const statusClass: OrderStatusClass = order.remainingTurns <= 1 ? 'progress' : 'moving';

  return createNotice(
    {
      ...state,
      resources: applyResourceDelta(state.resources, costDelta),
      orders: [
        ...state.orders,
        {
          ...order,
          id: `player-order-${Date.now()}-${nextId}`,
          status: order.remainingTurns <= 1 ? 'В работе' : 'В пути',
          statusClass,
          due: formatOrderDue(order.remainingTurns),
        },
      ],
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '⚑',
        tone: order.riskLevel === 'high' || order.riskLevel === 'critical' ? 'bronze' : 'blue',
        title: 'Новый приказ принят',
        text: order.title,
      }),
    },
    'Приказ принят к исполнению',
  );
}

export function cancelOrder(state: GameState, id: string): GameState {
  const order = state.orders.find((item) => item.id === id);
  if (!order || order.statusClass === 'cancelled') {
    return createNotice(state, 'Приказ уже снят или не найден', 'error');
  }

  const refund = Object.fromEntries(
    Object.entries(order.cost || {}).map(([key, value]) => [key, Math.round(value * 0.45)]),
  ) as ResourceDelta;

  return createNotice(
    {
      ...state,
      orders: state.orders.map((item) =>
        item.id === id
          ? { ...item, status: 'Отменен', statusClass: 'cancelled', due: 'снят', remainingTurns: 0 }
          : item,
      ),
      resources: applyResourceDelta(state.resources, refund),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '×',
        tone: 'red',
        title: 'Приказ отменен',
        text: `${order.title}. Часть ресурсов возвращена в казну.`,
      }),
    },
    'Приказ отменен, часть ресурсов возвращена',
  );
}

export function endTurn(state: GameState): GameState {
  const nextTurn = state.turnNumber + 1;
  const completedOrders: Order[] = [];
  const activeOrders = state.orders
    .filter((order) => order.statusClass !== 'cancelled')
    .map((order) => {
      const remainingTurns = Math.max(0, order.remainingTurns - 1);
      if (remainingTurns <= 0) {
        completedOrders.push(order);
        return null;
      }

      return {
        ...order,
        remainingTurns,
        status: remainingTurns <= 1 ? 'В работе' : order.status,
        statusClass: remainingTurns <= 1 ? 'progress' : order.statusClass,
        due: formatOrderDue(remainingTurns),
      };
    })
    .filter(Boolean) as Order[];

  const incomeDelta = state.resources.reduce<ResourceDelta>((delta, resource) => {
    delta[resource.id] = resource.perTurn;
    return delta;
  }, {});

  const rewardDelta = completedOrders.reduce<ResourceDelta>((delta, order) => {
    Object.entries(order.reward || {}).forEach(([key, value]) => {
      const resourceKey = key as ResourceId;
      delta[resourceKey] = (delta[resourceKey] || 0) + value;
    });
    return delta;
  }, incomeDelta);

  const relationDelta = completedOrders.reduce<Record<string, number>>((delta, order) => {
    Object.entries(order.diplomacyDelta || {}).forEach(([name, value]) => {
      delta[name] = (delta[name] || 0) + value;
    });
    return delta;
  }, {});

  const completedEvents = completedOrders.map<TimelineEvent>((order) => ({
    icon: '✓',
    tone: order.diplomacyDelta?.Украина ? 'bronze' : 'green',
    title: 'Приказ выполнен',
    text: order.completeText,
    time: `Ход ${nextTurn}`,
  }));

  const turnEvent: TimelineEvent = {
    icon: '⌛',
    tone: 'blue',
    title: `Ход ${nextTurn} начался`,
    text: completedOrders.length
      ? `Завершено приказов: ${completedOrders.length}. Доход державы начислен.`
      : 'Доход державы начислен, текущие приказы продвинулись.',
    time: 'только что',
  };

  let nextLetters = state.letters;
  if (completedOrders.length) {
    nextLetters = pushLetter(nextLetters, {
      tone: 'neutral',
      from: 'Совет империи',
      subject: `Отчет за ход ${nextTurn}`,
      time: 'только что',
    });
  }

  return createNotice(
    {
      ...state,
      turnNumber: nextTurn,
      orders: activeOrders,
      resources: applyResourceDelta(state.resources, rewardDelta),
      diplomacy: applyDiplomacyDelta(state.diplomacy, relationDelta),
      timelineEvents: [...completedEvents, turnEvent, ...state.timelineEvents].slice(0, MAX_TIMELINE_EVENTS),
      letters: nextLetters,
      quickActionTurns: {},
    },
    `Ход ${nextTurn} начался`,
  );
}

export function applyValidatedEffect(state: GameState, effect: EngineEffect): GameState {
  if (effect.kind === 'blocked') {
    return createNotice(state, effect.reason || 'Действие невозможно', 'error');
  }

  if (effect.kind === 'create-order' && effect.order) {
    return createStrategicOrder(state, effect.order);
  }

  const withResources = effect.resourceDelta
    ? { ...state, resources: applyResourceDelta(state.resources, effect.resourceDelta) }
    : state;
  const withDiplomacy = effect.diplomacyDelta
    ? { ...withResources, diplomacy: applyDiplomacyDelta(withResources.diplomacy, effect.diplomacyDelta) }
    : withResources;
  const withLetter = effect.letter ? { ...withDiplomacy, letters: pushLetter(withDiplomacy.letters, effect.letter) } : withDiplomacy;
  const withEvent = effect.eventTitle || effect.eventText
    ? {
        ...withLetter,
        timelineEvents: pushTimeline(withLetter.timelineEvents, {
          icon: effect.kind === 'diplomacy-delta' ? '◎' : '⚑',
          tone: effect.kind === 'diplomacy-delta' ? 'green' : 'blue',
          title: effect.eventTitle || 'Событие мира',
          text: effect.eventText || 'Совет империи зафиксировал новое событие.',
        }),
      }
    : withLetter;

  return createNotice(withEvent, effect.eventTitle || 'Действие выполнено');
}
