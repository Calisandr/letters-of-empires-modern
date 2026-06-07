import { formatOrderDue } from './formatters';
import { mergeWorldEvents, simulateWorldTurn } from './world';
import type {
  ActionStatusKind,
  CompletedOrderReport,
  CountryIntelActionId,
  DiplomacyRelation,
  EngineEffect,
  GameState,
  Letter,
  NationDelta,
  NationProfile,
  Order,
  OrderDraft,
  OrderStatusClass,
  QuickActionId,
  ResourceDelta,
  ResourceId,
  ResourceState,
  SelectedCountry,
  StrategicResponse,
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

function mergeNationDelta(...deltas: Record<string, NationDelta>[]) {
  return deltas.reduce<Record<string, NationDelta>>((merged, delta) => {
    Object.entries(delta || {}).forEach(([name, nationDelta]) => {
      merged[name] = merged[name] || {};
      Object.entries(nationDelta || {}).forEach(([metric, value]) => {
        const metricKey = metric as keyof NationDelta;
        merged[name][metricKey] = (merged[name][metricKey] || 0) + value;
      });
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

function clampStat(value: number) {
  return Math.max(8, Math.min(96, Math.round(value)));
}

function clampRelation(value: number) {
  return Math.max(-100, Math.min(200, Math.round(value)));
}

function hashCountryName(name: string) {
  return [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);
}

function fallbackRelationForStatus(status: string) {
  if (status === 'russia') return 200;
  if (status === 'ally') return 115;
  if (status === 'friendly') return 64;
  if (status === 'neutral') return 0;
  if (status === 'risk') return -34;
  if (status === 'hostile') return -78;
  return -6;
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

function applyNationDeltaToNations(nations: NationProfile[], delta: Record<string, NationDelta> = {}) {
  if (!Object.keys(delta).length) return nations;

  return nations.map((nation) => {
    const nationDelta = delta[nation.name];
    if (!nationDelta) return nation;

    const relation = nationDelta.relation ? clampRelation(nation.relation + nationDelta.relation) : nation.relation;
    const pressure = nationDelta.pressure ? clampStat(nation.pressure + nationDelta.pressure) : nation.pressure;
    const threat = nationDelta.threat ? clampStat(nation.threat + nationDelta.threat) : nation.threat;
    const economy = nationDelta.economy ? clampStat(nation.economy + nationDelta.economy) : nation.economy;
    const army = nationDelta.army ? clampStat(nation.army + nationDelta.army) : nation.army;
    const stability = nationDelta.stability ? clampStat(nation.stability + nationDelta.stability) : nation.stability;
    const treasury = nationDelta.treasury ? clampStat(nation.treasury + nationDelta.treasury) : nation.treasury;
    const grain = nationDelta.grain ? clampStat(nation.grain + nationDelta.grain) : nation.grain;

    return {
      ...nation,
      relation,
      pressure,
      threat,
      economy,
      army,
      stability,
      treasury,
      grain,
    };
  });
}

function upsertDiplomacyTarget(relations: DiplomacyRelation[], country: SelectedCountry, delta = 0) {
  const existing = relations.find((relation) => relation.name === country.name);
  const baseScore = existing?.score ?? fallbackRelationForStatus(country.status);
  const score = Math.max(-100, Math.min(200, baseScore + delta));
  const nextRelation: DiplomacyRelation = {
    flag: existing?.flag || country.key || 'neutral',
    name: country.name,
    score,
    status: relationStatus(score),
    tone: relationTone(score),
  };

  if (!existing) return [nextRelation, ...relations];

  return relations.map((relation) => (relation.name === country.name ? { ...relation, ...nextRelation } : relation));
}

function buildFallbackNationProfile(country: SelectedCountry, relation: number): NationProfile {
  const hash = hashCountryName(country.name);
  const focusOptions: NationProfile['focus'][] = ['trade', 'military', 'industry', 'diplomacy', 'defense'];
  const focus = focusOptions[hash % focusOptions.length];
  const isSmall = country.status === 'common';

  return {
    id: country.key || country.name,
    name: country.name,
    flag: country.key || 'neutral',
    focus,
    economy: clampStat((isSmall ? 34 : 44) + (hash % 39)),
    army: clampStat((isSmall ? 24 : 36) + ((hash >> 2) % 42)),
    stability: clampStat(42 + ((hash >> 3) % 44)),
    treasury: clampStat(30 + ((hash >> 4) % 45)),
    grain: clampStat(34 + ((hash >> 5) % 46)),
    relation,
    threat: clampStat((relation < -50 ? 58 : relation < -20 ? 42 : 20) + (hash % 20)),
    pressure: clampStat((relation < -50 ? 54 : relation < -20 ? 38 : 18) + ((hash >> 6) % 22)),
    goals: [
      focus === 'trade' ? 'Ищет выгодный торговый путь' : 'Оценивает соседей и угрозы',
      focus === 'military' ? 'Укрепляет войска' : 'Сохраняет внутренний порядок',
      relation < -40 ? 'Скрывает реальные резервы' : 'Готова к осторожным переговорам',
    ],
    lastAction: 'Открытых донесений пока мало: нужна дипломатия, торговля или разведка.',
  };
}

function upsertNationTarget(
  nations: NationProfile[],
  country: SelectedCountry,
  patch: Partial<NationProfile> & { lastAction: string },
) {
  const existing = nations.find((nation) => nation.name === country.name);
  const relation = patch.relation ?? existing?.relation ?? fallbackRelationForStatus(country.status);
  const base = existing || buildFallbackNationProfile(country, relation);
  const nextNation: NationProfile = {
    ...base,
    ...patch,
    id: base.id || country.key || country.name,
    name: country.name,
    flag: base.flag || country.key || 'neutral',
    relation,
    pressure: clampStat(patch.pressure ?? base.pressure),
    threat: clampStat(patch.threat ?? base.threat),
  };

  if (!existing) return [nextNation, ...nations];

  return nations.map((nation) => (nation.name === country.name ? nextNation : nation));
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

export function runCountryIntelAction(state: GameState, id: CountryIntelActionId, country: SelectedCountry): GameState {
  const isOwnCountry = country.status === 'russia';
  const existingRelation = state.diplomacy.find((relation) => relation.name === country.name);
  const relation = existingRelation?.score ?? fallbackRelationForStatus(country.status);
  const existingNation = state.nations.find((nation) => nation.name === country.name);
  const baseNation = existingNation || buildFallbackNationProfile(country, relation);

  if (id === 'send-envoy') {
    const cost: ResourceDelta = { gold: isOwnCountry ? 90 : 220 };
    if (!canPay(state.resources, cost)) {
      return createNotice(state, `Не хватает ресурсов для посольства: ${describeResourceCost(state.resources, cost)}`, 'error');
    }

    const relationDelta = isOwnCountry ? 0 : relation < -60 ? 3 : 6;
    const nextRelation = Math.max(-100, Math.min(200, relation + relationDelta));
    return createNotice(
      {
        ...state,
        resources: applyResourceDelta(state.resources, { gold: -(cost.gold || 0) }),
        diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, relationDelta),
        nations: upsertNationTarget(state.nations, country, {
          relation: nextRelation,
          pressure: baseNation.pressure - (isOwnCountry ? 1 : 4),
          threat: baseNation.threat - (relationDelta > 0 ? 2 : 0),
          lastAction: isOwnCountry
            ? 'Внутренний совет обновил повестку державы и снизил давление на центр.'
            : `Российское посольство открыло осторожный канал с державой "${country.name}".`,
        }),
        letters: isOwnCountry
          ? state.letters
          : pushLetter(state.letters, {
              tone: relation < -40 ? 'red' : 'gold',
              from: country.name,
              subject: relation < -40 ? 'Осторожный ответ на посольство' : 'Ответ на дипломатическую миссию',
              time: 'только что',
            }),
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '◊',
          tone: relation < -40 ? 'bronze' : 'green',
          title: isOwnCountry ? 'Внутренний совет собран' : `Посольство направлено: ${country.name}`,
          text: isOwnCountry
            ? 'Совет сверил внутреннюю повестку, снизив управленческое давление на державу.'
            : `Дипломаты потратили золото на миссию и улучшили отношения с целью "${country.name}" на ${relationDelta}.`,
        }),
      },
      isOwnCountry ? 'Внутренний совет собран' : `Посольство отправлено: ${country.name}`,
    );
  }

  if (id === 'gather-intel') {
    const cost: ResourceDelta = { gold: 120 };
    if (!canPay(state.resources, cost)) {
      return createNotice(state, `Не хватает ресурсов для разведки: ${describeResourceCost(state.resources, cost)}`, 'error');
    }

    return createNotice(
      {
        ...state,
        resources: applyResourceDelta(state.resources, { gold: -120 }),
        diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, 0),
        nations: upsertNationTarget(state.nations, country, {
          relation,
          pressure: baseNation.pressure + (relation < -40 ? 2 : -2),
          threat: baseNation.threat,
          lastAction: `Разведка обновила досье по цели "${country.name}": фокус, давление и риски стали точнее.`,
        }),
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '◎',
          tone: relation < -40 ? 'bronze' : 'blue',
          title: `Досье обновлено: ${country.name}`,
          text: `Канцелярия потратила золото на разведданные. Оценки по цели "${country.name}" стали надежнее для следующих решений.`,
        }),
      },
      `Разведка обновила досье: ${country.name}`,
    );
  }

  if (id === 'trade-mission') {
    const preparedState = {
      ...state,
      diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, 0),
      nations: upsertNationTarget(state.nations, country, {
        relation,
        pressure: baseNation.pressure - (relation < -40 ? 0 : 2),
        lastAction: `Торговый совет готовит маршрут к цели "${country.name}".`,
      }),
    };

    return createStrategicOrder(preparedState, {
      iconKey: 'anchor',
      title: isOwnCountry ? 'Укрепить внутренние торговые линии' : `Открыть торговую миссию: ${country.name}`,
      owner: 'Торговый совет',
      target: country.name,
      remainingTurns: relation < -40 ? 3 : 2,
      totalTurns: relation < -40 ? 3 : 2,
      cost: { gold: relation < -40 ? 520 : 360, grain: 180 },
      reward: { gold: relation < -40 ? 950 : 1250, grain: 420 },
      diplomacyDelta: isOwnCountry ? undefined : { [country.name]: relation < -40 ? 2 : 5 },
      completeText: isOwnCountry
        ? 'Внутренние торговые линии укреплены: сбор пошлин и движение зерна стали устойчивее.'
        : `Торговая миссия к цели "${country.name}" принесла прибыль и укрепила дипломатический канал.`,
      riskLevel: relation < -40 ? 'medium' : 'low',
      successChance: relation < -40 ? 68 : 92,
      failureCost: { gold: -180, grain: -120 },
      failureDiplomacyDelta: isOwnCountry ? undefined : { [country.name]: relation < -40 ? -4 : -1 },
      failureText: `Торговая миссия к цели "${country.name}" сорвалась: часть товаров потеряна, доверие к маршруту снизилось.`,
    });
  }

  const preparedState = {
    ...state,
    diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, 0),
    nations: upsertNationTarget(state.nations, country, {
      relation,
      pressure: baseNation.pressure + (relation < -20 ? 4 : 1),
      threat: baseNation.threat + (relation < -20 ? 5 : 2),
      lastAction: `Военный совет подготовил ограниченную операцию по цели "${country.name}".`,
    }),
  };

  return createStrategicOrder(preparedState, {
    iconKey: relation < -20 ? 'swords' : 'shield',
    title: isOwnCountry ? 'Подготовить резервную оборону державы' : `Подготовить ограниченную операцию: ${country.name}`,
    owner: 'Генеральный штаб',
    target: country.name,
    remainingTurns: relation < -20 ? 3 : 2,
    totalTurns: relation < -20 ? 3 : 2,
    cost: { gold: 640, iron: 360, grain: 240 },
    reward: { iron: 240 },
    diplomacyDelta: isOwnCountry ? undefined : { [country.name]: relation < -20 ? -4 : -1 },
    completeText: isOwnCountry
      ? 'Резервная оборона державы развернута: армия получила снабжение и новые маршруты переброски.'
      : `Ограниченная операция по цели "${country.name}" завершена. Штаб получил военное преимущество, но дипломатическое давление выросло.`,
    riskLevel: relation < -20 ? 'high' : 'medium',
    successChance: relation < -20 ? 58 : 78,
    failureCost: { gold: -360, iron: -260, grain: -180, population: -0.1 },
    failureDiplomacyDelta: isOwnCountry ? undefined : { [country.name]: relation < -20 ? -8 : -3 },
    failureText: `Операция по цели "${country.name}" провалилась: снабжение потеряно, часть войска выбыла, политическое положение ухудшилось.`,
  });
}

function countryFromStrategicTarget(state: GameState, target: string): SelectedCountry {
  if (target === 'Россия') return { key: 'Russia', name: target, status: 'russia' };

  const relation = state.diplomacy.find((item) => item.name === target);
  const nation = state.nations.find((item) => item.name === target);
  const score = relation?.score ?? nation?.relation ?? 0;

  return {
    key: nation?.flag || relation?.flag || target,
    name: target,
    status: relationTone(score),
  };
}

function markStrategicResponseUsed(state: GameState, responseId: string): GameState {
  if (!state.lastTurnReport?.strategicResponses?.length) return state;

  return {
    ...state,
    lastTurnReport: {
      ...state.lastTurnReport,
      strategicResponses: state.lastTurnReport.strategicResponses.map((response) =>
        response.id === responseId ? { ...response, used: true } : response,
      ),
    },
  };
}

function findStrategicResponse(state: GameState, responseId: string): StrategicResponse | null {
  return state.lastTurnReport?.strategicResponses?.find((response) => response.id === responseId) || null;
}

export function runStrategicResponse(state: GameState, responseId: string): GameState {
  const response = findStrategicResponse(state, responseId);
  if (!response) return createNotice(state, 'Решение штаба больше недоступно', 'error');
  if (response.used) return createNotice(state, 'Это решение штаба уже принято', 'error');

  const country = countryFromStrategicTarget(state, response.target);
  const existingRelation = state.diplomacy.find((relation) => relation.name === country.name);
  const relation = existingRelation?.score ?? fallbackRelationForStatus(country.status);
  const baseNation =
    state.nations.find((nation) => nation.name === country.name) ||
    buildFallbackNationProfile(country, relation);

  if (response.kind === 'secure-trade') {
    const preparedState = {
      ...state,
      diplomacy: upsertDiplomacyTarget(state.diplomacy, country, 0),
      nations: upsertNationTarget(state.nations, country, {
        relation,
        pressure: baseNation.pressure - 2,
        threat: baseNation.threat - 1,
        lastAction: `Штаб закрепляет торговое окно с целью "${country.name}".`,
      }),
    };

    const nextState = createStrategicOrder(preparedState, {
      iconKey: 'anchor',
      title: `Закрепить торговый коридор: ${country.name}`,
      owner: 'Оперативный торговый штаб',
      target: country.name,
      remainingTurns: 2,
      totalTurns: 2,
      cost: { gold: 440, grain: 220 },
      reward: { gold: 1450, grain: 560 },
      diplomacyDelta: { [country.name]: relation < -20 ? 2 : 6 },
      nationDelta: { [country.name]: { economy: 3, pressure: -4, threat: -2 } },
      completeText: `Торговый коридор с целью "${country.name}" закреплен: купцы получили охрану, прибыль и устойчивый канал влияния.`,
      riskLevel: relation < -20 ? 'medium' : 'low',
      successChance: relation < -20 ? 70 : 92,
      failureCost: { gold: -220, grain: -140 },
      failureDiplomacyDelta: { [country.name]: relation < -20 ? -5 : -2 },
      failureNationDelta: { [country.name]: { pressure: 5, threat: 3 } },
      failureText: `Попытка закрепить торговый коридор с целью "${country.name}" сорвалась: часть товаров потеряна, доверие к маршруту снизилось.`,
    });

    return nextState.lastNotice?.kind === 'success' ? markStrategicResponseUsed(nextState, responseId) : nextState;
  }

  if (response.kind === 'counter-threat') {
    const preparedState = {
      ...state,
      diplomacy: upsertDiplomacyTarget(state.diplomacy, country, 0),
      nations: upsertNationTarget(state.nations, country, {
        relation,
        pressure: baseNation.pressure + 2,
        threat: baseNation.threat + 1,
        lastAction: `Российский штаб готовит контрмеры против давления цели "${country.name}".`,
      }),
    };

    const nextState = createStrategicOrder(preparedState, {
      iconKey: 'shield',
      title: `Контрмеры против давления: ${country.name}`,
      owner: 'Оперативный штаб',
      target: country.name,
      remainingTurns: 2,
      totalTurns: 2,
      cost: { gold: 520, iron: 260, grain: 180 },
      reward: { iron: 180 },
      diplomacyDelta: { [country.name]: relation < -40 ? -2 : -1 },
      nationDelta: { [country.name]: { threat: -8, pressure: -7, stability: -1 }, Россия: { stability: 2, pressure: -3 } },
      completeText: `Контрмеры против цели "${country.name}" сработали: разведка вскрыла подготовку, снабжение укреплено, риск внезапного удара снижен.`,
      riskLevel: relation < -50 ? 'high' : 'medium',
      successChance: relation < -50 ? 66 : 78,
      failureCost: { gold: -320, iron: -180, grain: -120 },
      failureDiplomacyDelta: { [country.name]: relation < -40 ? -7 : -3 },
      failureNationDelta: { [country.name]: { threat: 7, pressure: 6 }, Россия: { stability: -2, pressure: 4 } },
      failureText: `Контрмеры против цели "${country.name}" раскрыты слишком рано: противник усилил давление, часть снабжения потеряна.`,
    });

    return nextState.lastNotice?.kind === 'success' ? markStrategicResponseUsed(nextState, responseId) : nextState;
  }

  if (response.kind === 'recon-intent') {
    const consumedState = markStrategicResponseUsed(state, responseId);
    const cost: ResourceDelta = { gold: 180 };
    if (!canPay(consumedState.resources, cost)) {
      return createNotice(state, `Не хватает ресурсов для наблюдателей: ${describeResourceCost(state.resources, cost)}`, 'error');
    }

    return createNotice(
      {
        ...consumedState,
        resources: applyResourceDelta(consumedState.resources, { gold: -180 }),
        diplomacy: upsertDiplomacyTarget(consumedState.diplomacy, country, 0),
        nations: upsertNationTarget(consumedState.nations, country, {
          relation,
          pressure: baseNation.pressure - 2,
          threat: baseNation.threat - 1,
          lastAction: `Наблюдатели уточнили оборонные намерения цели "${country.name}".`,
        }),
        timelineEvents: pushTimeline(consumedState.timelineEvents, {
          icon: '◎',
          tone: 'blue',
          title: `Наблюдатели отправлены: ${country.name}`,
          text: `Оперативный штаб потратил золото и уточнил оборонное досье цели "${country.name}".`,
        }),
      },
      `Наблюдатели отправлены: ${country.name}`,
    );
  }

  if (response.kind === 'industrial-contract') {
    const consumedState = markStrategicResponseUsed(state, responseId);
    const cost: ResourceDelta = { gold: 260, stone: 120 };
    if (!canPay(consumedState.resources, cost)) {
      return createNotice(state, `Не хватает ресурсов для договора: ${describeResourceCost(state.resources, cost)}`, 'error');
    }

    return createNotice(
      {
        ...consumedState,
        resources: applyResourceDelta(consumedState.resources, { gold: -260, stone: -120, iron: 340 }),
        diplomacy: upsertDiplomacyTarget(consumedState.diplomacy, country, relation < -20 ? 1 : 3),
        nations: upsertNationTarget(consumedState.nations, country, {
          relation: Math.min(200, relation + (relation < -20 ? 1 : 3)),
          economy: baseNation.economy + 2,
          pressure: baseNation.pressure - 2,
          lastAction: `Промышленный договор с Россией дал цели "${country.name}" устойчивый канал поставок.`,
        }),
        letters: pushLetter(consumedState.letters, {
          tone: 'gold',
          from: country.name,
          subject: 'Промышленный договор',
          time: 'только что',
        }),
        timelineEvents: pushTimeline(consumedState.timelineEvents, {
          icon: '♜',
          tone: 'green',
          title: `Промышленный договор: ${country.name}`,
          text: `Канцелярия обменяла золото и камень на железо и улучшила отношения с целью "${country.name}".`,
        }),
      },
      `Промышленный договор заключен: ${country.name}`,
    );
  }

  if (response.kind === 'open-diplomacy') {
    const consumedState = markStrategicResponseUsed(state, responseId);
    const cost: ResourceDelta = { gold: 160 };
    if (!canPay(consumedState.resources, cost)) {
      return createNotice(state, `Не хватает ресурсов для переговоров: ${describeResourceCost(state.resources, cost)}`, 'error');
    }

    return createNotice(
      {
        ...consumedState,
        resources: applyResourceDelta(consumedState.resources, { gold: -160 }),
        diplomacy: upsertDiplomacyTarget(consumedState.diplomacy, country, relation < -30 ? 3 : 5),
        nations: upsertNationTarget(consumedState.nations, country, {
          relation: Math.min(200, relation + (relation < -30 ? 3 : 5)),
          pressure: baseNation.pressure - 4,
          threat: baseNation.threat - 2,
          lastAction: `Открыт переговорный канал с целью "${country.name}".`,
        }),
        letters: pushLetter(consumedState.letters, {
          tone: relation < -30 ? 'red' : 'gold',
          from: country.name,
          subject: 'Переговорный канал открыт',
          time: 'только что',
        }),
        timelineEvents: pushTimeline(consumedState.timelineEvents, {
          icon: '◊',
          tone: 'green',
          title: `Канал переговоров: ${country.name}`,
          text: `Дипломаты быстро превратили мировое окно в рабочий канал с целью "${country.name}".`,
        }),
      },
      `Переговоры начаты: ${country.name}`,
    );
  }

  const consumedState = markStrategicResponseUsed(state, responseId);
  const cost: ResourceDelta = { gold: 220, grain: 160 };
  if (!canPay(consumedState.resources, cost)) {
    return createNotice(state, `Не хватает ресурсов для внутреннего штаба: ${describeResourceCost(state.resources, cost)}`, 'error');
  }

  return createNotice(
    {
      ...consumedState,
      resources: applyResourceDelta(consumedState.resources, { gold: -220, grain: -160 }),
      nations: applyNationDeltaToNations(consumedState.nations, { Россия: { stability: 5, pressure: -6, threat: -2 } }),
      timelineEvents: pushTimeline(consumedState.timelineEvents, {
        icon: '♜',
        tone: 'green',
        title: 'Внутренний штаб собран',
        text: 'Совет разгрузил снабжение, сверил казну и снизил внутреннее давление державы.',
      }),
    },
    'Внутренний штаб стабилизировал державу',
  );
}

type ResolvedOrderOutcome = {
  report: CompletedOrderReport;
  event: TimelineEvent;
  resourceDelta: ResourceDelta;
  diplomacyDelta: Record<string, number>;
  nationDelta: Record<string, NationDelta>;
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
      nationDelta: order.nationDelta || {},
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
    nationDelta:
      order.failureNationDelta ||
      (order.riskLevel === 'critical' || order.riskLevel === 'high'
        ? { [order.target]: { threat: 5, pressure: 6, stability: -2 } }
        : {}),
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
  const orderNationDelta = mergeNationDelta(...resolvedOrders.map((order) => order.nationDelta));
  const world = simulateWorldTurn(
    {
      ...state,
      resources: applyResourceDelta(state.resources, mergeResourceDelta(incomeDelta, orderResourceDelta)),
      diplomacy: applyDiplomacyDelta(state.diplomacy, orderDiplomacyDelta),
      nations: applyNationDeltaToNations(state.nations, orderNationDelta),
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
    ? Object.entries(effect.diplomacyDelta).reduce<GameState>((currentState, [countryName, delta]) => {
        if (currentState.selectedCountry?.name === countryName) {
          const diplomacy = upsertDiplomacyTarget(currentState.diplomacy, currentState.selectedCountry, delta);
          const relation = diplomacy.find((item) => item.name === countryName)?.score ?? fallbackRelationForStatus(currentState.selectedCountry.status);
          const baseNation = currentState.nations.find((nation) => nation.name === countryName) ||
            buildFallbackNationProfile(currentState.selectedCountry, relation);

          return {
            ...currentState,
            diplomacy,
            nations: upsertNationTarget(currentState.nations, currentState.selectedCountry, {
              relation,
              pressure: baseNation.pressure + (delta < 0 ? Math.abs(delta) : -Math.max(1, delta)),
              threat: baseNation.threat + (delta < 0 ? Math.ceil(Math.abs(delta) / 2) : -1),
              lastAction: `Дипломатический канал с целью "${countryName}" обновлен через совет правителя.`,
            }),
          };
        }

        return { ...currentState, diplomacy: applyDiplomacyDelta(currentState.diplomacy, { [countryName]: delta }) };
      }, withResources)
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
