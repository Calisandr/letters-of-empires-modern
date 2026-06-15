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
  LetterResponseOption,
  NationDelta,
  NationProfile,
  Order,
  OrderCounterMove,
  OrderDraft,
  OperationPlan,
  OrderStatusClass,
  ResourceDelta,
  ResourceId,
  ResourceState,
  SelectedCountry,
  StrategicResponse,
  TimelineEvent,
  TurnCause,
} from './types';

export const MAX_ACTIVE_ORDERS = 5;
export const MAX_OPERATION_PLANS = 4;
export const MAX_TIMELINE_EVENTS = 7;
export const MAX_LETTERS = 5;
export const MAX_CHAT_MESSAGES = 80;

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

const diplomacyFlagByName: Record<string, string> = {
  Аргентина: 'argentina',
  Бразилия: 'brazil',
  Великобритания: 'uk',
  Германия: 'germany',
  Индия: 'india',
  Испания: 'spain',
  Китай: 'china',
  Россия: 'russia',
  Турция: 'turkey',
  Украина: 'ukraine',
  Франция: 'france',
  Япония: 'japan',
};

function countryKeyForDiplomacyName(name: string) {
  return diplomacyFlagByName[name] || name.toLowerCase();
}

function statusKeyFromRelation(score: number) {
  const tone = relationTone(score);
  if (tone === 'ally') return 'ally';
  if (tone === 'friendly') return 'friendly';
  if (tone === 'risk') return 'risk';
  if (tone === 'hostile') return 'hostile';
  return 'neutral';
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

function applyDiplomacyDeltaWithUpserts(relations: DiplomacyRelation[], delta: Record<string, number> = {}) {
  return Object.entries(delta).reduce<DiplomacyRelation[]>((nextRelations, [name, change]) => {
    const existing = nextRelations.find((relation) => relation.name === name);
    const score = clampRelation((existing?.score ?? 0) + change);
    const nextRelation: DiplomacyRelation = {
      flag: existing?.flag || countryKeyForDiplomacyName(name),
      name,
      score,
      status: relationStatus(score),
      tone: relationTone(score),
    };

    if (!existing) return [nextRelation, ...nextRelations];
    return nextRelations.map((relation) => (relation.name === name ? { ...relation, ...nextRelation } : relation));
  }, relations);
}

function upsertNationsForDiplomacyDeltas(
  nations: NationProfile[],
  diplomacy: DiplomacyRelation[],
  delta: Record<string, number> = {},
) {
  return Object.keys(delta).reduce<NationProfile[]>((nextNations, name) => {
    if (nextNations.some((nation) => nation.name === name)) return nextNations;

    const relation = diplomacy.find((item) => item.name === name)?.score ?? 0;
    const country: SelectedCountry = {
      key: countryKeyForDiplomacyName(name),
      name,
      status: relation >= 50 ? 'friendly' : relation <= -50 ? 'hostile' : 'common',
    };

    return upsertNationTarget(nextNations, country, {
      relation,
      pressure: relation < 0 ? 52 : 30,
      threat: relation < 0 ? 54 : 28,
      lastAction: 'Досье открыто через дипломатическое решение России.',
    });
  }, nations);
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

function applyNationDeltaWithUpserts(
  nations: NationProfile[],
  delta: Record<string, NationDelta> = {},
  relations: DiplomacyRelation[],
) {
  const updated = applyNationDeltaToNations(nations, delta);

  return Object.entries(delta).reduce<NationProfile[]>((nextNations, [name, nationDelta]) => {
    if (nextNations.some((nation) => nation.name === name)) return nextNations;

    const relation = relations.find((item) => item.name === name)?.score ?? 0;
    const fallback = buildFallbackNationProfile(
      {
        key: countryKeyForDiplomacyName(name),
        name,
        status: statusKeyFromRelation(relation),
      },
      relation,
    );
    const [withDelta] = applyNationDeltaToNations([fallback], { [name]: nationDelta });

    return [withDelta, ...nextNations];
  }, updated);
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

function planKindLabel(kind: OperationPlan['kind']) {
  if (kind === 'trade') return 'торговый план';
  if (kind === 'diplomacy') return 'дипломатический план';
  if (kind === 'countermeasure') return 'план контрмер';
  if (kind === 'raid') return 'военный план';
  if (kind === 'military') return 'военный план';
  if (kind === 'infrastructure') return 'инфраструктурный план';
  return 'внутренний план';
}

function planId(turn: number, country: SelectedCountry, kind: OperationPlan['kind']) {
  const key = (country.key || country.name).toLowerCase().replace(/[^a-zа-я0-9-]+/gi, '-');
  return `plan-${turn}-${key}-${kind}`;
}

function upsertOperationPlan(plans: OperationPlan[], plan: OperationPlan) {
  const withoutSameReadyPlan = plans.filter(
    (item) => !(item.target === plan.target && item.kind === plan.kind),
  );

  return [plan, ...withoutSameReadyPlan]
    .filter((item) => item.expiresTurn >= plan.createdTurn)
    .slice(0, MAX_OPERATION_PLANS);
}

function operationPlanToOrder(plan: OperationPlan): OrderDraft {
  return {
    iconKey: plan.iconKey,
    title: plan.title,
    owner: plan.owner,
    target: plan.target,
    remainingTurns: plan.durationTurns,
    totalTurns: plan.durationTurns,
    cost: plan.cost,
    reward: plan.reward,
    diplomacyDelta: plan.diplomacyDelta,
    nationDelta: plan.nationDelta,
    completeText: plan.completeText,
    riskLevel: plan.riskLevel,
    successChance: plan.successChance,
    failureCost: plan.failureCost,
    failureDiplomacyDelta: plan.failureDiplomacyDelta,
    failureNationDelta: plan.failureNationDelta,
    failureText: plan.failureText,
    letter: plan.letter,
  };
}

function buildOperationPlan(
  state: GameState,
  country: SelectedCountry,
  mode: 'recon' | 'operation' = 'recon',
): OperationPlan {
  const existingRelation = state.diplomacy.find((relation) => relation.name === country.name);
  const relation = existingRelation?.score ?? fallbackRelationForStatus(country.status);
  const nation = state.nations.find((item) => item.name === country.name);
  const intent = nation?.currentIntent;
  const hostile = relation <= -45 || intent?.type === 'military' || intent?.type === 'covert';
  const tradeWindow = relation >= 45 && (nation?.focus === 'trade' || intent?.type === 'trade' || intent?.type === 'industry');
  const isOwnCountry = country.status === 'russia';

  if (isOwnCountry) {
    return {
      id: planId(state.turnNumber, country, 'stability'),
      kind: 'stability',
      target: country.name,
      title: 'Стабилизировать внутренний контур',
      summary: 'Совет готовит короткую внутреннюю операцию: снабжение, налоги и порядок должны выдержать следующий кризис.',
      advisor: 'Внутренний совет',
      iconKey: 'landmark',
      owner: 'Внутренний совет',
      durationTurns: 1,
      riskLevel: 'low',
      successChance: 96,
      createdTurn: state.turnNumber,
      expiresTurn: state.turnNumber + 2,
      cost: { gold: 280, grain: 180 },
      reward: { gold: 420, grain: 220 },
      nationDelta: { Россия: { stability: 5, pressure: -6, threat: -2 } },
      completeText: 'Внутренний контур стабилизирован: снабжение выровнено, управленческое давление снижено.',
      failureCost: { gold: -90, grain: -60 },
      failureNationDelta: { Россия: { pressure: 2 } },
      failureText: 'Внутренний штаб не успел сверить снабжение: часть ресурсов ушла на срочные исправления.',
    };
  }

  if (hostile || mode === 'operation') {
    const critical = relation <= -70 || intent?.type === 'covert';

    return {
      id: planId(state.turnNumber, country, critical ? 'countermeasure' : 'raid'),
      kind: critical ? 'countermeasure' : 'raid',
      target: country.name,
      title: critical ? `Сорвать давление: ${country.name}` : `Ограниченная операция: ${country.name}`,
      summary: critical
        ? `Разведка предлагает не атаковать в лоб, а вскрыть подготовку цели "${country.name}" и снизить угрозу до следующего кризиса.`
        : `Штаб подготовил ограниченную операцию против цели "${country.name}" с понятной ценой, шансом успеха и последствиями провала.`,
      advisor: 'Оперативный штаб',
      iconKey: critical ? 'shield' : 'swords',
      owner: 'Оперативный штаб',
      durationTurns: critical ? 2 : 3,
      riskLevel: critical ? 'high' : 'medium',
      successChance: critical ? 68 : 76,
      createdTurn: state.turnNumber,
      expiresTurn: state.turnNumber + 2,
      cost: critical ? { gold: 540, iron: 260, grain: 180 } : { gold: 620, iron: 360, grain: 240 },
      reward: { iron: critical ? 180 : 260 },
      diplomacyDelta: { [country.name]: critical ? -2 : -4 },
      nationDelta: { [country.name]: { threat: critical ? -8 : -5, pressure: critical ? -7 : -3 } },
      completeText: critical
        ? `Контрмеры по цели "${country.name}" сорвали часть подготовки: угроза и давление снижены.`
        : `Ограниченная операция по цели "${country.name}" дала военное преимущество, но дипломатическое давление выросло.`,
      failureCost: critical ? { gold: -260, iron: -160, grain: -120 } : { gold: -360, iron: -240, grain: -180, population: -0.1 },
      failureDiplomacyDelta: { [country.name]: critical ? -6 : -8 },
      failureNationDelta: { [country.name]: { threat: critical ? 6 : 8, pressure: critical ? 6 : 7 }, Россия: { pressure: 3, stability: -1 } },
      failureText: critical
        ? `Контрмеры по цели "${country.name}" раскрыты слишком рано: противник усилил давление.`
        : `Операция по цели "${country.name}" провалилась: снабжение потеряно, политическое положение ухудшилось.`,
    };
  }

  if (tradeWindow) {
    return {
      id: planId(state.turnNumber, country, 'trade'),
      kind: 'trade',
      target: country.name,
      title: `Торговый коридор: ${country.name}`,
      summary: `Разведка подтвердила окно сделки с целью "${country.name}". План закрепит маршрут и даст прибыль после исполнения.`,
      advisor: 'Торговый совет',
      iconKey: 'anchor',
      owner: 'Торговый совет',
      durationTurns: 2,
      riskLevel: relation >= 100 ? 'low' : 'medium',
      successChance: relation >= 100 ? 94 : 84,
      createdTurn: state.turnNumber,
      expiresTurn: state.turnNumber + 3,
      cost: { gold: 420, grain: 210 },
      reward: { gold: 1500, grain: 620 },
      diplomacyDelta: { [country.name]: relation >= 100 ? 5 : 3 },
      nationDelta: { [country.name]: { economy: 3, pressure: -3, threat: -1 } },
      completeText: `Торговый коридор с целью "${country.name}" закреплен: казна получила прибыль, отношения стали устойчивее.`,
      failureCost: { gold: -180, grain: -100 },
      failureDiplomacyDelta: { [country.name]: -2 },
      failureNationDelta: { [country.name]: { pressure: 3 } },
      failureText: `Торговый коридор с целью "${country.name}" сорвался: товары задержаны, доверие к маршруту снизилось.`,
    };
  }

  return {
    id: planId(state.turnNumber, country, 'diplomacy'),
    kind: 'diplomacy',
    target: country.name,
    title: `Переговорная миссия: ${country.name}`,
    summary: `Канцелярия подготовила безопасное дипломатическое решение по цели "${country.name}" без резкого военного риска.`,
    advisor: 'Канцелярия',
    iconKey: 'mail',
    owner: 'Канцелярия',
    durationTurns: 1,
    riskLevel: relation < -20 ? 'medium' : 'low',
    successChance: relation < -20 ? 72 : 90,
    createdTurn: state.turnNumber,
    expiresTurn: state.turnNumber + 2,
    cost: { gold: relation < -20 ? 260 : 180 },
    reward: { gold: relation >= 50 ? 240 : 80 },
    diplomacyDelta: { [country.name]: relation < -20 ? 4 : 6 },
    nationDelta: { [country.name]: { pressure: -5, threat: -2 } },
    completeText: `Переговорная миссия по цели "${country.name}" открыла рабочий канал и снизила давление.`,
    failureCost: { gold: -90 },
    failureDiplomacyDelta: { [country.name]: relation < -20 ? -3 : -1 },
    failureNationDelta: { [country.name]: { pressure: 3 } },
    failureText: `Переговорная миссия по цели "${country.name}" не дала результата: канцелярия потеряла время и часть золота.`,
  };
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
  const existingIndex = letters.findIndex((item) => item.from === letter.from && item.subject === letter.subject);
  const existingLetter = existingIndex >= 0 ? letters[existingIndex] : null;

  if (existingLetter) {
    const status = letter.status ?? 'open';
    const mergedLetter: Letter = {
      ...existingLetter,
      ...letter,
      time: letter.time,
      status,
      answeredBy: status === 'answered' ? letter.answeredBy ?? existingLetter.answeredBy : undefined,
      responses: letter.responses ?? (status === 'answered' ? existingLetter.responses : undefined),
    };

    return [
      mergedLetter,
      ...letters.slice(0, existingIndex),
      ...letters.slice(existingIndex + 1),
    ].slice(0, MAX_LETTERS);
  }

  return [letter, ...letters].slice(0, MAX_LETTERS);
}

export function getLetterRuntimeId(letter: Letter, index = 0) {
  return letter.id || `legacy-letter-${index}-${letter.from}-${letter.subject}`;
}

function isInternalLetter(letter: Letter) {
  return ['Военный совет', 'Совет', 'Совет империи', 'Канцелярия'].includes(letter.from);
}

function defaultLetterResponses(letter: Letter): LetterResponseOption[] {
  if (isInternalLetter(letter)) {
    return [
      {
        id: 'acknowledge',
        label: 'Принять к сведению',
        summary: 'Закрыть внутреннее донесение без изменения ресурсов и дипломатии.',
        tone: 'neutral',
        timelineTitle: 'Донесение принято',
        timelineText: `Правитель принял к сведению письмо "${letter.subject}".`,
      },
    ];
  }

  const tense = letter.tone === 'red' || letter.tone === 'burgundy';

  return [
    {
      id: 'cooperate',
      label: tense ? 'Смягчить ответ' : 'Поддержать предложение',
      summary: tense
        ? `Потратить золото на осторожный ответ и снизить напряжение с державой "${letter.from}".`
        : `Открыть рабочий канал с державой "${letter.from}" и улучшить отношения.`,
      tone: 'support',
      resourceDelta: tense ? { gold: -120 } : { gold: -80 },
      diplomacyDelta: { [letter.from]: tense ? 3 : 5 },
      nationDelta: { [letter.from]: { pressure: tense ? -3 : -4, threat: tense ? -1 : -2 } },
      timelineTitle: `Ответ отправлен: ${letter.from}`,
      timelineText: `Канцелярия поддержала письмо "${letter.subject}" и открыла рабочий канал с державой "${letter.from}".`,
    },
    {
      id: 'cautious',
      label: 'Запросить условия',
      summary: 'Ответить осторожно без крупных обязательств: отношения немного растут, но вопрос остается открытым.',
      tone: 'neutral',
      diplomacyDelta: { [letter.from]: 2 },
      nationDelta: { [letter.from]: { pressure: 1 } },
      timelineTitle: `Условия запрошены: ${letter.from}`,
      timelineText: `Россия запросила дополнительные условия по письму "${letter.subject}" от державы "${letter.from}".`,
    },
    {
      id: 'refuse',
      label: 'Отказать',
      summary: 'Сохранить ресурсы, но ухудшить отношения и поднять давление у отправителя.',
      tone: 'warning',
      diplomacyDelta: { [letter.from]: tense ? -3 : -5 },
      nationDelta: { [letter.from]: { pressure: 4, threat: tense ? 3 : 1 } },
      timelineTitle: `Письмо отклонено: ${letter.from}`,
      timelineText: `Канцелярия отказала по письму "${letter.subject}". Держава "${letter.from}" восприняла ответ холодно.`,
    },
  ];
}

export function getLetterResponseOptions(letter: Letter) {
  return letter.responses?.length ? letter.responses : defaultLetterResponses(letter);
}

function resourceCostFromDelta(delta: ResourceDelta = {}) {
  return Object.fromEntries(
    Object.entries(delta)
      .filter(([, value]) => value < 0)
      .map(([key, value]) => [key, Math.abs(value)]),
  ) as ResourceDelta;
}

export function respondToLetter(state: GameState, letterId: string, responseId: string): GameState {
  const letterIndex = state.letters.findIndex((letter, index) => getLetterRuntimeId(letter, index) === letterId);
  const letter = letterIndex >= 0 ? state.letters[letterIndex] : null;

  if (!letter) return createNotice(state, 'Письмо не найдено', 'error');
  if (letter.status === 'answered') return createNotice(state, 'На это письмо уже ответили', 'error');

  const response = getLetterResponseOptions(letter).find((item) => item.id === responseId);
  if (!response) return createNotice(state, 'Вариант ответа не найден', 'error');

  const cost = resourceCostFromDelta(response.resourceDelta);
  if (!canPay(state.resources, cost)) {
    return createNotice(state, `Не хватает ресурсов для ответа: ${describeResourceCost(state.resources, cost)}`, 'error');
  }

  const diplomacy = applyDiplomacyDeltaWithUpserts(state.diplomacy, response.diplomacyDelta);
  const nations = applyNationDeltaWithUpserts(state.nations, response.nationDelta, diplomacy).map((nation) => {
    if (!response.nationDelta?.[nation.name]) return nation;
    return {
      ...nation,
      lastAction: `Канцелярия ответила на письмо "${letter.subject}": ${response.label}.`,
    };
  });

  return createNotice(
    {
      ...state,
      resources: applyResourceDelta(state.resources, response.resourceDelta),
      diplomacy,
      nations,
      letters: state.letters.map((item, index) =>
        index === letterIndex
          ? {
              ...item,
              id: getLetterRuntimeId(item, index),
              status: 'answered',
              answeredBy: response.label,
              responses: getLetterResponseOptions(item),
              time: 'решено',
            }
          : item,
      ),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '✉',
        tone: response.tone === 'danger' ? 'red' : response.tone === 'support' ? 'green' : 'bronze',
        title: response.timelineTitle,
        text: response.timelineText,
      }),
    },
    `Ответ отправлен: ${letter.from}`,
  );
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
          id: `player-order-${state.turnNumber}-${nextId}`,
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
      orders: state.orders.filter((item) => item.id !== id),
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

    const operationPlan = buildOperationPlan(state, country, 'recon');

    return createNotice(
      {
        ...state,
        resources: applyResourceDelta(state.resources, { gold: -120 }),
        diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, 0),
        nations: upsertNationTarget(state.nations, country, {
          relation,
          pressure: baseNation.pressure + (relation < -40 ? 2 : -2),
          threat: baseNation.threat,
          lastAction: `Разведка обновила досье по цели "${country.name}" и подготовила ${planKindLabel(operationPlan.kind)}.`,
        }),
        operationPlans: upsertOperationPlan(state.operationPlans, operationPlan),
        timelineEvents: pushTimeline(state.timelineEvents, {
          icon: '◎',
          tone: relation < -40 ? 'bronze' : 'blue',
          title: `Досье обновлено: ${country.name}`,
          text: `Канцелярия потратила золото на разведданные. Оценки по цели "${country.name}" стали надежнее, штаб подготовил план "${operationPlan.title}".`,
        }),
      },
      `Разведка подготовила план: ${country.name}`,
    );
  }

  if (id === 'trade-mission') {
    const nextState = createStrategicOrder(state, {
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

    if (nextState.lastNotice?.kind !== 'success') return nextState;

    return {
      ...nextState,
      diplomacy: isOwnCountry ? nextState.diplomacy : upsertDiplomacyTarget(nextState.diplomacy, country, 0),
      nations: upsertNationTarget(nextState.nations, country, {
        relation,
        pressure: baseNation.pressure - (relation < -40 ? 0 : 2),
        lastAction: `Торговый совет готовит маршрут к цели "${country.name}".`,
      }),
    };
  }

  const planningCost: ResourceDelta = { gold: isOwnCountry ? 120 : 180 };
  if (!canPay(state.resources, planningCost)) {
    return createNotice(state, `Не хватает ресурсов для подготовки операции: ${describeResourceCost(state.resources, planningCost)}`, 'error');
  }

  const operationPlan = buildOperationPlan(state, country, 'operation');

  return createNotice(
    {
      ...state,
      resources: applyResourceDelta(state.resources, { gold: -(planningCost.gold || 0) }),
      diplomacy: isOwnCountry ? state.diplomacy : upsertDiplomacyTarget(state.diplomacy, country, 0),
      nations: upsertNationTarget(state.nations, country, {
        relation,
        pressure: baseNation.pressure + (relation < -20 ? 3 : 1),
        threat: baseNation.threat + (relation < -20 ? 3 : 1),
        lastAction: `Военный совет подготовил план "${operationPlan.title}".`,
      }),
      operationPlans: upsertOperationPlan(state.operationPlans, operationPlan),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '⚑',
        tone: operationPlan.riskLevel === 'high' || operationPlan.riskLevel === 'critical' ? 'bronze' : 'blue',
        title: `План готов: ${country.name}`,
        text: `Штаб потратил золото на подготовку. План "${operationPlan.title}" можно запустить из панели приказов.`,
      }),
    },
    `План операции готов: ${country.name}`,
  );
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

function prepareDiplomacyTargetsForOrder(state: GameState, order: OrderDraft): GameState {
  return Object.keys(order.diplomacyDelta || {}).reduce<GameState>((nextState, name) => {
    if (nextState.diplomacy.some((relation) => relation.name === name)) return nextState;

    const country = nextState.selectedCountry?.name === name
      ? nextState.selectedCountry
      : countryFromStrategicTarget(nextState, name);
    const relation = fallbackRelationForStatus(country.status);
    const baseNation = nextState.nations.find((nation) => nation.name === name) ||
      buildFallbackNationProfile(country, relation);

    return {
      ...nextState,
      diplomacy: upsertDiplomacyTarget(nextState.diplomacy, country, 0),
      nations: upsertNationTarget(nextState.nations, country, {
        relation,
        pressure: baseNation.pressure,
        threat: baseNation.threat,
        lastAction: 'Досье открыто через утвержденный приказ Совета.',
      }),
    };
  }, state);
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
    const nextState = createStrategicOrder(state, {
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

    if (nextState.lastNotice?.kind !== 'success') return nextState;

    const preparedNextState = {
      ...nextState,
      diplomacy: upsertDiplomacyTarget(nextState.diplomacy, country, 0),
      nations: upsertNationTarget(nextState.nations, country, {
        relation,
        pressure: baseNation.pressure - 2,
        threat: baseNation.threat - 1,
        lastAction: `Штаб закрепляет торговое окно с целью "${country.name}".`,
      }),
    };

    return markStrategicResponseUsed(preparedNextState, responseId);
  }

  if (response.kind === 'counter-threat') {
    const nextState = createStrategicOrder(state, {
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

    if (nextState.lastNotice?.kind !== 'success') return nextState;

    const preparedNextState = {
      ...nextState,
      diplomacy: upsertDiplomacyTarget(nextState.diplomacy, country, 0),
      nations: upsertNationTarget(nextState.nations, country, {
        relation,
        pressure: baseNation.pressure + 2,
        threat: baseNation.threat + 1,
        lastAction: `Российский штаб готовит контрмеры против давления цели "${country.name}".`,
      }),
    };

    return markStrategicResponseUsed(preparedNextState, responseId);
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

export function runOperationPlan(state: GameState, planIdToRun: string): GameState {
  const plan = state.operationPlans.find((item) => item.id === planIdToRun);

  if (!plan) return createNotice(state, 'Оперативный план не найден', 'error');

  if (plan.expiresTurn < state.turnNumber) {
    return createNotice(
      {
        ...state,
        operationPlans: state.operationPlans.filter((item) => item.id !== planIdToRun),
      },
      'Оперативный план устарел',
      'error',
    );
  }

  const order = operationPlanToOrder(plan);
  const nextState = createStrategicOrder(state, order);
  if (nextState.lastNotice?.kind !== 'success') return nextState;
  const preparedNextState = prepareDiplomacyTargetsForOrder(nextState, order);

  return {
    ...preparedNextState,
    operationPlans: preparedNextState.operationPlans.filter((item) => item.id !== planIdToRun),
  };
}

function lowerPlanRisk(risk: NonNullable<Order['riskLevel']>): NonNullable<Order['riskLevel']> {
  if (risk === 'critical') return 'high';
  if (risk === 'high') return 'medium';
  if (risk === 'medium') return 'low';
  return 'low';
}

function riskText(risk: NonNullable<Order['riskLevel']>) {
  if (risk === 'critical') return 'критический';
  if (risk === 'high') return 'высокий';
  if (risk === 'medium') return 'средний';
  return 'низкий';
}

export function refineOperationPlan(state: GameState, planIdToRefine: string): GameState {
  const plan = state.operationPlans.find((item) => item.id === planIdToRefine);
  if (!plan) return createNotice(state, 'Предложение совета не найдено', 'error');

  const refinements = plan.refinements || 0;
  if (refinements >= 2) {
    return createNotice(state, 'Совет уже уточнил этот план до предела текущих данных', 'error');
  }

  const cost: ResourceDelta = { gold: plan.riskLevel === 'critical' || plan.riskLevel === 'high' ? 140 : 90 };
  if (!canPay(state.resources, cost)) {
    return createNotice(state, `Не хватает ресурсов для уточнения: ${describeResourceCost(state.resources, cost)}`, 'error');
  }

  const refinedPlan: OperationPlan = {
    ...plan,
    summary: `${plan.summary} Совет уточнил маршрут исполнения: риск понятнее, шанс выше, окно решения шире.`,
    successChance: Math.min(96, plan.successChance + (plan.riskLevel === 'critical' || plan.riskLevel === 'high' ? 10 : 7)),
    riskLevel: refinements === 0 ? lowerPlanRisk(plan.riskLevel) : plan.riskLevel,
    expiresTurn: Math.max(plan.expiresTurn, state.turnNumber + 2),
    refinements: refinements + 1,
  };

  return createNotice(
    {
      ...state,
      resources: applyResourceDelta(state.resources, { gold: -(cost.gold || 0) }),
      operationPlans: state.operationPlans.map((item) => (item.id === planIdToRefine ? refinedPlan : item)),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '◎',
        tone: refinedPlan.riskLevel === 'high' || refinedPlan.riskLevel === 'critical' ? 'bronze' : 'blue',
        title: 'План Совета уточнен',
        text: `Совет уточнил "${plan.title}": шанс повышен до ${refinedPlan.successChance}%, риск теперь ${riskText(refinedPlan.riskLevel)}.`,
      }),
    },
    'Совет уточнил предложение',
  );
}

export function dismissOperationPlan(state: GameState, planIdToDismiss: string): GameState {
  const plan = state.operationPlans.find((item) => item.id === planIdToDismiss);
  if (!plan) return createNotice(state, 'Оперативный план не найден', 'error');

  return createNotice(
    {
      ...state,
      operationPlans: state.operationPlans.filter((item) => item.id !== planIdToDismiss),
      timelineEvents: pushTimeline(state.timelineEvents, {
        icon: '×',
        tone: 'bronze',
        title: 'Оперативный план снят',
        text: `Штаб снял план "${plan.title}", чтобы освободить внимание для других решений.`,
      }),
    },
    'Оперативный план снят',
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

function clampOrderChance(value: number) {
  return Math.max(15, Math.min(96, Math.round(value)));
}

function clampCounterPressure(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function orderCounterSeverity(chanceDelta: number): OrderCounterMove['severity'] {
  const weight = Math.abs(chanceDelta);
  if (weight >= 9) return 'high';
  if (weight >= 5) return 'medium';
  return 'low';
}

function explicitOrderNationNames(order: Order) {
  return [
    ...Object.keys(order.diplomacyDelta || {}),
    ...Object.keys(order.failureDiplomacyDelta || {}),
    ...Object.keys(order.nationDelta || {}),
    ...Object.keys(order.failureNationDelta || {}),
  ];
}

function findOrderTargetNation(state: GameState, order: Order) {
  const explicitNames = explicitOrderNationNames(order);
  const explicit = explicitNames
    .map((name) => state.nations.find((nation) => nation.name === name))
    .find(Boolean);
  if (explicit) return explicit;

  return state.nations.find(
    (nation) =>
      order.target === nation.name ||
      order.title.includes(nation.name) ||
      order.completeText.includes(nation.name),
  );
}

function relationForOrderTarget(state: GameState, nation: NationProfile) {
  return state.diplomacy.find((relation) => relation.name === nation.name)?.score ?? nation.relation;
}

type BuiltOrderCounterMove = {
  move: OrderCounterMove;
  resourceDelta: ResourceDelta;
  diplomacyDelta: Record<string, number>;
  nationDelta: Record<string, NationDelta>;
  warning?: string;
  opportunity?: string;
  event: TimelineEvent;
};

function buildOrderCounterMove(state: GameState, order: Order, nextTurn: number): BuiltOrderCounterMove | null {
  if (order.remainingTurns <= 1) return null;

  const targetNation = findOrderTargetNation(state, order);
  const seed = (nextTurn * 13 + order.id.length * 7 + order.target.length * 3) % 3;

  if (!targetNation || targetNation.id === 'russia') {
    const pressure = state.worldTension >= 68 || order.riskLevel === 'critical';
    const chanceDelta = pressure ? -(3 + seed) : 3 + seed;
    const pressureDelta = pressure ? 2 + seed : -(2 + seed);
    const move: OrderCounterMove = {
      actor: 'Россия',
      title: pressure ? 'Внутренний штаб перегружен' : 'Внутренний штаб ускоряет приказ',
      text: pressure
        ? `Канцелярия фиксирует перегрузку снабжения по приказу "${order.title}": шанс исполнения снижен на ${Math.abs(chanceDelta)}%.`
        : `Штаб сверил снабжение по приказу "${order.title}" и поднял шанс исполнения на ${chanceDelta}%.`,
      severity: orderCounterSeverity(chanceDelta),
      chanceDelta,
      pressureDelta,
    };

    return {
      move,
      resourceDelta: pressure ? { gold: -70, grain: -40 } : {},
      diplomacyDelta: {},
      nationDelta: { Россия: { pressure: pressureDelta, stability: pressure ? -1 : 1 } },
      warning: pressure ? move.text : undefined,
      opportunity: pressure ? undefined : move.text,
      event: {
        icon: pressure ? '!' : '✓',
        tone: pressure ? 'bronze' : 'green',
        title: move.title,
        text: move.text,
        time: `Событие ${nextTurn}`,
      },
    };
  }

  const relation = relationForOrderTarget(state, targetNation);
  const intent = targetNation.currentIntent;
  const hostileIntent = intent?.type === 'military' || intent?.type === 'covert' || intent?.type === 'defense';
  const hostile = relation <= -45 || hostileIntent || targetNation.threat + targetNation.pressure >= 130;
  const supportive =
    relation >= 100 ||
    (relation >= 70 && (intent?.type === 'trade' || intent?.type === 'diplomacy' || intent?.type === 'industry'));

  if (hostile) {
    const intentPenalty = intent?.type === 'covert' ? 4 : intent?.type === 'military' ? 3 : intent?.type === 'defense' ? 2 : 0;
    const relationPenalty = relation <= -75 ? 4 : relation <= -45 ? 2 : 0;
    const chanceDelta = -(5 + intentPenalty + relationPenalty + seed);
    const pressureDelta = 4 + intentPenalty + seed;
    const move: OrderCounterMove = {
      actor: targetNation.name,
      title: `${targetNation.name} мешает приказу`,
      text: `${targetNation.name} отвечает на приказ "${order.title}": усиливает охрану, давит на снабжение и снижает шанс успеха на ${Math.abs(chanceDelta)}%.`,
      severity: orderCounterSeverity(chanceDelta),
      chanceDelta,
      pressureDelta,
    };

    return {
      move,
      resourceDelta: move.severity === 'high' ? { gold: -110, grain: -70 } : { gold: -70 },
      diplomacyDelta: relation <= -45 ? { [targetNation.name]: -1 } : {},
      nationDelta: { [targetNation.name]: { pressure: pressureDelta, threat: Math.ceil(pressureDelta / 2) } },
      warning: move.text,
      event: {
        icon: '!',
        tone: move.severity === 'high' ? 'red' : 'bronze',
        title: move.title,
        text: move.text,
        time: `Событие ${nextTurn}`,
      },
    };
  }

  if (supportive) {
    const chanceDelta = 4 + (relation >= 100 ? 2 : 0) + (seed > 1 ? 1 : 0);
    const pressureDelta = -(3 + seed);
    const move: OrderCounterMove = {
      actor: targetNation.name,
      title: `${targetNation.name} поддерживает приказ`,
      text: `${targetNation.name} открывает каналы для приказа "${order.title}": шанс успеха вырос на ${chanceDelta}%.`,
      severity: orderCounterSeverity(chanceDelta),
      chanceDelta,
      pressureDelta,
    };

    return {
      move,
      resourceDelta: relation >= 100 ? { grain: 60 } : {},
      diplomacyDelta: relation >= 100 ? { [targetNation.name]: 1 } : {},
      nationDelta: { [targetNation.name]: { pressure: pressureDelta, threat: -1 } },
      opportunity: move.text,
      event: {
        icon: '✓',
        tone: 'green',
        title: move.title,
        text: move.text,
        time: `Событие ${nextTurn}`,
      },
    };
  }

  if (relation < 20 || order.riskLevel === 'medium' || order.riskLevel === 'high') {
    const chanceDelta = -(2 + seed);
    const pressureDelta = 1 + seed;
    const move: OrderCounterMove = {
      actor: targetNation.name,
      title: `${targetNation.name} требует гарантий`,
      text: `${targetNation.name} не срывает приказ "${order.title}" напрямую, но затягивает согласования: шанс снижен на ${Math.abs(chanceDelta)}%.`,
      severity: orderCounterSeverity(chanceDelta),
      chanceDelta,
      pressureDelta,
    };

    return {
      move,
      resourceDelta: {},
      diplomacyDelta: {},
      nationDelta: { [targetNation.name]: { pressure: pressureDelta } },
      warning: move.text,
      event: {
        icon: '•',
        tone: 'bronze',
        title: move.title,
        text: move.text,
        time: `Событие ${nextTurn}`,
      },
    };
  }

  return null;
}

function applyOrderCounterMoves(state: GameState, orders: Order[], nextTurn: number) {
  const timelineEvents: TimelineEvent[] = [];
  const warnings: string[] = [];
  const opportunities: string[] = [];
  let resourceDelta: ResourceDelta = {};
  let diplomacyDelta: Record<string, number> = {};
  let nationDelta: Record<string, NationDelta> = {};

  const nextOrders = orders.map((order) => {
    const counter = buildOrderCounterMove(state, order, nextTurn);
    if (!counter) return order;

    const nextChance = clampOrderChance(defaultSuccessChance(order) + counter.move.chanceDelta);
    const nextPressure = clampCounterPressure((order.counterPressure || 0) + counter.move.pressureDelta);

    resourceDelta = mergeResourceDelta(resourceDelta, counter.resourceDelta);
    diplomacyDelta = mergeDiplomacyDelta(diplomacyDelta, counter.diplomacyDelta);
    nationDelta = mergeNationDelta(nationDelta, counter.nationDelta);
    if (counter.warning) warnings.push(counter.warning);
    if (counter.opportunity) opportunities.push(counter.opportunity);
    if (timelineEvents.length < 2) timelineEvents.push(counter.event);

    return {
      ...order,
      successChance: nextChance,
      counterPressure: nextPressure,
      lastCounterMove: counter.move,
    };
  });

  return {
    orders: nextOrders,
    resourceDelta,
    diplomacyDelta,
    nationDelta,
    timelineEvents,
    warnings,
    opportunities,
  };
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
        time: `Событие ${nextTurn}`,
      },
      resourceDelta: order.reward || {},
      diplomacyDelta: order.diplomacyDelta || {},
      nationDelta: order.nationDelta || {},
      letter: order.letter,
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
      time: `Событие ${nextTurn}`,
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

const reportResourceLabels: Record<ResourceId, string> = {
  gold: 'золото',
  wood: 'дерево',
  stone: 'камень',
  iron: 'железо',
  grain: 'зерно',
  population: 'население',
};

function describeReportResourceDelta(delta: ResourceDelta = {}) {
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const resourceKey = key as ResourceId;
      const formatted =
        resourceKey === 'population' ? Number(value).toFixed(1) : Math.round(Number(value)).toLocaleString('ru-RU');

      return `${Number(value) > 0 ? '+' : ''}${formatted} ${reportResourceLabels[resourceKey] || key}`;
    });

  return parts.length ? parts.join(', ') : 'без прямых изменений';
}

function reportRiskLabel(risk: Order['riskLevel']) {
  if (risk === 'critical') return 'критический';
  if (risk === 'high') return 'высокий';
  if (risk === 'medium') return 'средний';
  return 'низкий';
}

function buildTurnCauseLog({
  completedOrders,
  counterMoves,
  expiredOperationPlans,
  nextTurn,
  resolvedOrders,
  totalResourceDelta,
  world,
}: {
  completedOrders: Order[];
  counterMoves: ReturnType<typeof applyOrderCounterMoves>;
  expiredOperationPlans: OperationPlan[];
  nextTurn: number;
  resolvedOrders: ResolvedOrderOutcome[];
  totalResourceDelta: ResourceDelta;
  world: ReturnType<typeof simulateWorldTurn>;
}) {
  const causeLog: TurnCause[] = [
    {
      title: 'Казна и снабжение',
      cause: `Событие ${nextTurn}: держава получила доход, а затем были применены расходы, награды и внешнее давление.`,
      effect: `Итог ресурсов: ${describeReportResourceDelta(totalResourceDelta)}.`,
      tone: Object.values(totalResourceDelta).some((value) => Number(value) < 0) ? 'warning' : 'success',
    },
  ];

  resolvedOrders.slice(0, 2).forEach((outcome, index) => {
    const order = completedOrders[index];
    if (!order) return;

    causeLog.push({
      title: outcome.report.succeeded ? 'Приказ сработал' : 'Приказ сорвался',
      cause: `${order.title}: срок приказа истек, шанс штаба ${defaultSuccessChance(order)}%, риск ${reportRiskLabel(order.riskLevel)}.`,
      effect: outcome.report.text,
      tone: outcome.report.succeeded ? 'success' : 'danger',
    });
  });

  if (counterMoves.warnings.length || counterMoves.opportunities.length) {
    const pressureText = counterMoves.warnings[0] || counterMoves.opportunities[0];

    causeLog.push({
      title: 'Ответы держав',
      cause: 'Соперники и союзники проверили активные российские приказы по давлению, отношениям и текущим намерениям.',
      effect: pressureText,
      tone: counterMoves.warnings.length ? 'warning' : 'success',
    });
  }

  world.report.causeLog.slice(0, 2).forEach((item) => causeLog.push(item));

  if (expiredOperationPlans.length) {
    causeLog.push({
      title: 'Окно плана закрылось',
      cause: `Оперативные планы живут ограниченный срок, а разведданные устарели к событию ${nextTurn}.`,
      effect: `Снято планов: ${expiredOperationPlans.length}. Подготовьте новое досье, если цель всё ещё важна.`,
      tone: 'warning',
    });
  }

  return causeLog.slice(0, 6);
}

export function endTurn(state: GameState): GameState {
  const nextTurn = state.turnNumber + 1;
  const completedOrders: Order[] = [];
  const activeOperationPlans = state.operationPlans.filter((plan) => plan.expiresTurn >= nextTurn);
  const expiredOperationPlans = state.operationPlans.filter((plan) => plan.expiresTurn < nextTurn);
  const counterMoves = applyOrderCounterMoves(
    state,
    state.orders.filter((order) => order.statusClass !== 'cancelled'),
    nextTurn,
  );
  const activeOrders = counterMoves.orders
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
  const preWorldResourceDelta = mergeResourceDelta(incomeDelta, counterMoves.resourceDelta, orderResourceDelta);
  const preWorldDiplomacyDelta = mergeDiplomacyDelta(counterMoves.diplomacyDelta, orderDiplomacyDelta);
  const preWorldNationDelta = mergeNationDelta(counterMoves.nationDelta, orderNationDelta);
  const world = simulateWorldTurn(
    {
      ...state,
      resources: applyResourceDelta(state.resources, preWorldResourceDelta),
      diplomacy: applyDiplomacyDeltaWithUpserts(state.diplomacy, preWorldDiplomacyDelta),
      nations: applyNationDeltaToNations(state.nations, preWorldNationDelta),
    },
    nextTurn,
    resolvedOrders.map((order) => order.report),
  );
  const totalResourceDelta = mergeResourceDelta(preWorldResourceDelta, world.resourceDelta);
  const totalDiplomacyDelta = mergeDiplomacyDelta(preWorldDiplomacyDelta, world.diplomacyDelta);
  const completedEvents = resolvedOrders.map((order) => order.event);
  const worldTimelineEvents = world.events.slice(0, 2).map<TimelineEvent>((event) => ({
    icon: event.tone === 'red' ? '!' : event.tone === 'green' ? '✓' : '•',
    tone: event.tone,
    title: event.title,
    text: event.text,
    time: `Событие ${nextTurn}`,
  }));
  const turnEvent: TimelineEvent = {
    icon: '⌛',
    tone: 'blue',
    title: `Событие ${nextTurn} началось`,
    text: completedOrders.length
      ? `Завершено приказов: ${completedOrders.length}. Доход начислен, державы мира отреагировали.`
      : 'Доход начислен, текущие приказы продвинулись, державы мира отреагировали.',
    time: 'только что',
  };
  const expiredPlanEvent: TimelineEvent | null = expiredOperationPlans.length
    ? {
        icon: '⌛',
        tone: 'bronze',
        title: 'Оперативные планы устарели',
        text: `Устарело планов: ${expiredOperationPlans.length}. Разведданные нужно обновлять перед запуском рискованных действий.`,
        time: `Событие ${nextTurn}`,
      }
    : null;
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
      subject: `Сводка события ${nextTurn}`,
      time: 'только что',
    });
  }

  const finalDiplomacy = applyDiplomacyDeltaWithUpserts(state.diplomacy, totalDiplomacyDelta);
  const finalNations = upsertNationsForDiplomacyDeltas(world.nations, finalDiplomacy, totalDiplomacyDelta);

  return createNotice(
    {
      ...state,
      turnNumber: nextTurn,
      orders: activeOrders,
      operationPlans: activeOperationPlans,
      resources: applyResourceDelta(state.resources, totalResourceDelta),
      diplomacy: finalDiplomacy,
      nations: finalNations,
      worldEvents: mergeWorldEvents(state.worldEvents, world.events),
      worldTension: world.worldTension,
      lastTurnReport: {
        ...world.report,
        resourceDelta: totalResourceDelta,
        diplomacyDelta: totalDiplomacyDelta,
        warnings: [...counterMoves.warnings, ...world.report.warnings].slice(0, 6),
        opportunities: [...counterMoves.opportunities, ...world.report.opportunities].slice(0, 6),
        causeLog: buildTurnCauseLog({
          completedOrders,
          counterMoves,
          expiredOperationPlans,
          nextTurn,
          resolvedOrders,
          totalResourceDelta,
          world,
        }),
      },
      timelineEvents: [
        ...completedEvents,
        ...counterMoves.timelineEvents,
        ...worldTimelineEvents,
        ...(expiredPlanEvent ? [expiredPlanEvent] : []),
        turnEvent,
        ...state.timelineEvents,
      ].slice(0, MAX_TIMELINE_EVENTS),
      letters: nextLetters,
      chatMessages: [...state.chatMessages, ...world.chatMessages].slice(-MAX_CHAT_MESSAGES),
      quickActionTurns: {},
    },
    `Событие ${nextTurn} началось`,
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

        return { ...currentState, diplomacy: applyDiplomacyDeltaWithUpserts(currentState.diplomacy, { [countryName]: delta }) };
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
