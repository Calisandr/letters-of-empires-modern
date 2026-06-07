import { formatOrderDue } from './formatters';
import { mergeWorldEvents, simulateWorldTurn } from './world';
import type {
  ActionStatusKind,
  CompletedOrderReport,
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
export const MAX_TIMELINE_EVENTS = 7;
export const MAX_LETTERS = 5;
export const MAX_CHAT_MESSAGES = 80;
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

function mergeResourceDelta(...deltas: ResourceDelta[]) {
  return deltas.reduce<ResourceDelta>((merged, delta) => {
    Object.entries(delta || {}).forEach(([key, value]) => {
      const resourceKey = key as ResourceId;
      merged[resourceKey] = (merged[resourceKey] || 0) + value;
    });
    return merged;
  }, {});
}

function mergeDiplomacyDelta(...deltas: Record<string, number>[]) {
  return deltas.reduce<Record<string, number>>((merged, delta) => {
    Object.entries(delta || {}).forEach(([name, value]) => {
      merged[name] = (merged[name] || 0) + value;
    });
    return merged;
  }, {});
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

type ResolvedOrderOutcome = {
  report: CompletedOrderReport;
  event: TimelineEvent;
  resourceDelta: ResourceDelta;
  diplomacyDelta: Record<string, number>;
  letter?: Letter;
};

function defaultSuccessChance(order: Order) {
  if (typeof order.successChance === 'number') return Math.max(0, Math.min(100, order.successChance));
  if (order.riskLevel === 'critical') return 38;
  if (order.riskLevel === 'high') return 62;
  if (order.riskLevel === 'medium') return 82;
  return 95;
}

function deterministicOrderRoll(order: Order, nextTurn: number) {
  return (nextTurn * 37 + order.id.length * 17 + order.title.length * 11 + order.target.length * 5) % 100;
}

function resolveCompletedOrder(order: Order, nextTurn: number): ResolvedOrderOutcome {
  const chance = defaultSuccessChance(order);
  const succeeded = deterministicOrderRoll(order, nextTurn) < chance;

  if (succeeded) {
    return {
      report: {
        title: order.title,
        target: order.target,
        succeeded: true,
        text: order.completeText,
      },
      event: {
        icon: '✓',
        tone: order.diplomacyDelta?.Украина ? 'bronze' : 'green',
        title: 'Приказ выполнен',
        text: order.completeText,
        time: `Ход ${nextTurn}`,
      },
      resourceDelta: order.reward || {},
      diplomacyDelta: order.diplomacyDelta || {},
    };
  }

  const failureCost =
    order.failureCost ||
    (order.riskLevel === 'critical' || order.riskLevel === 'high'
      ? { gold: -360, grain: -220, population: -0.1 }
      : { gold: -180, grain: -90 });
  const fallbackDiplomacy =
    order.riskLevel === 'critical' || order.riskLevel === 'high' ? { [order.target]: -4 } : {};
  const failureDiplomacyDelta = order.failureDiplomacyDelta || fallbackDiplomacy;
  const text =
    order.failureText ||
    `Приказ "${order.title}" сорвался: исполнители недооценили риск, часть ресурсов потеряна, а положение у цели "${order.target}" ухудшилось.`;

  return {
    report: {
      title: order.title,
      target: order.target,
      succeeded: false,
      text,
    },
    event: {
      icon: '×',
      tone: 'red',
      title: 'Приказ провален',
      text,
      time: `Ход ${nextTurn}`,
    },
    resourceDelta: failureCost,
    diplomacyDelta: failureDiplomacyDelta,
    letter: {
      tone: 'red',
      from: 'Военный совет',
      subject: `Провал приказа: ${order.target}`,
      time: 'только что',
    },
  };
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
  const resolvedOrders = completedOrders.map((order) => resolveCompletedOrder(order, nextTurn));
  const orderResourceDelta = mergeResourceDelta(...resolvedOrders.map((order) => order.resourceDelta));
  const orderDiplomacyDelta = mergeDiplomacyDelta(...resolvedOrders.map((order) => order.diplomacyDelta));
  const world = simulateWorldTurn(
    {
      ...state,
      resources: applyResourceDelta(state.resources, mergeResourceDelta(incomeDelta, orderResourceDelta)),
      diplomacy: applyDiplomacyDelta(state.diplomacy, orderDiplomacyDelta),
    },
    nextTurn,
    resolvedOrders.map((order) => order.report),
  );
  const totalResourceDelta = mergeResourceDelta(incomeDelta, orderResourceDelta, world.resourceDelta);
  const totalDiplomacyDelta = mergeDiplomacyDelta(orderDiplomacyDelta, world.diplomacyDelta);
  const completedEvents = resolvedOrders.map((order) => order.event);
  const worldTimelineEvents = world.events.slice(0, 2).map<TimelineEvent>((event) => ({
    icon: event.tone === 'red' ? '!' : event.tone === 'green' ? '✓' : '•',
    tone: event.tone,
    title: event.title,
    text: event.text,
    time: `Ход ${nextTurn}`,
  }));
  const turnEvent: TimelineEvent = {
    icon: '⌛',
    tone: 'blue',
    title: `Ход ${nextTurn} начался`,
    text: completedOrders.length
      ? `Завершено приказов: ${completedOrders.length}. Доход начислен, державы мира сделали ответные ходы.`
      : 'Доход начислен, текущие приказы продвинулись, державы мира сделали ответные ходы.',
    time: 'только что',
  };
  let nextLetters = state.letters;
  resolvedOrders.forEach((order) => {
    if (order.letter) nextLetters = pushLetter(nextLetters, order.letter);
  });
  world.letters.forEach((letter) => {
    nextLetters = pushLetter(nextLetters, letter);
  });
  if (completedOrders.length || world.events.length) {
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
      resources: applyResourceDelta(state.resources, totalResourceDelta),
      diplomacy: applyDiplomacyDelta(state.diplomacy, totalDiplomacyDelta),
      nations: world.nations,
      worldEvents: mergeWorldEvents(state.worldEvents, world.events),
      worldTension: world.worldTension,
      lastTurnReport: {
        ...world.report,
        resourceDelta: totalResourceDelta,
        diplomacyDelta: totalDiplomacyDelta,
      },
      timelineEvents: [...completedEvents, ...worldTimelineEvents, turnEvent, ...state.timelineEvents].slice(0, MAX_TIMELINE_EVENTS),
      letters: nextLetters,
      chatMessages: [...state.chatMessages, ...world.chatMessages].slice(-MAX_CHAT_MESSAGES),
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
          icon: effect.kind === 'diplomacy-delta' ? '◌' : '⚑',
          tone: effect.kind === 'diplomacy-delta' ? 'green' : 'blue',
          title: effect.eventTitle || 'Событие мира',
          text: effect.eventText || 'Совет империи зафиксировал новое событие.',
        }),
      }
    : withLetter;

  return createNotice(withEvent, effect.eventTitle || 'Действие выполнено');
}
