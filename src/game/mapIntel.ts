import type { DiplomacyTone, GameState, NationFocus, NationIntentType, Order, WorldEventImpact, WorldEventTone } from './types';

export type MapModeId = 'political' | 'trade' | 'strategy';
export type MapSignalMarker = 'capital' | 'diplomacy' | 'trade' | 'military' | 'threat' | 'event';
export type MapSignalTone = DiplomacyTone | 'own' | 'trade' | 'military' | 'event';

export type MapSignal = {
  countryKey: string;
  countryName: string;
  status: string;
  relation: number;
  threat: number;
  pressure: number;
  focus: NationFocus;
  marker: MapSignalMarker;
  tone: MapSignalTone;
  severity: number;
  activeOrders: number;
  tradeOrders: number;
  militaryOrders: number;
  hasEvent: boolean;
  intentType?: NationIntentType;
  eventImpact?: WorldEventImpact;
  eventTone?: WorldEventTone;
  title: string;
  summary: string;
  shortStatus: string;
};

const orderTargetAliases: Record<string, string> = {
  'Москва': 'Россия',
  'Санкт-Петербург': 'Россия',
  'Казань': 'Россия',
  'Новгород': 'Россия',
  'Кузбасс': 'Россия',
  'Харьков': 'Украина',
  'Киев': 'Украина',
  'Дели': 'Индия',
  'Пекин': 'Китай',
  'Токио': 'Япония',
  'Париж': 'Франция',
  'Берлин': 'Германия',
  'Анкара': 'Турция',
  'Бразилиа': 'Бразилия',
  'Буэнос-Айрес': 'Аргентина',
};

function relationTone(score: number): DiplomacyTone {
  if (score >= 100) return 'ally';
  if (score >= 50) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'risk';
  return 'hostile';
}

function statusFromRelation(score: number) {
  if (score >= 100) return 'ally';
  if (score >= 50) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'risk';
  return 'hostile';
}

function relationLabel(score: number) {
  if (score >= 100) return 'союз';
  if (score >= 50) return 'дружба';
  if (score > -20) return 'нейтралитет';
  if (score > -60) return 'риск';
  return 'вражда';
}

function focusLabel(focus: NationFocus) {
  if (focus === 'trade') return 'торговля';
  if (focus === 'military') return 'войска';
  if (focus === 'industry') return 'промышленность';
  if (focus === 'diplomacy') return 'дипломатия';
  return 'оборона';
}

function intentLabel(type: NationIntentType) {
  if (type === 'trade') return 'торговый замысел';
  if (type === 'diplomacy') return 'переговоры';
  if (type === 'military') return 'военное давление';
  if (type === 'defense') return 'оборона';
  if (type === 'industry') return 'промышленность';
  return 'скрытая активность';
}

function intentMarker(type?: NationIntentType): MapSignalMarker | null {
  if (type === 'trade' || type === 'industry') return 'trade';
  if (type === 'military' || type === 'covert') return 'military';
  if (type === 'defense') return 'threat';
  if (type === 'diplomacy') return 'diplomacy';
  return null;
}

function isActiveOrder(order: Order) {
  return order.statusClass !== 'cancelled' && order.statusClass !== 'completed' && order.statusClass !== 'failed';
}

function isTradeOrder(order: Order) {
  return order.iconKey === 'anchor' || order.iconKey === 'package';
}

function isMilitaryOrder(order: Order) {
  return order.iconKey === 'swords' || order.iconKey === 'shield' || order.riskLevel === 'high' || order.riskLevel === 'critical';
}

function resolveOrderCountries(order: Order, knownCountryNames: Set<string>) {
  const targets = new Set<string>();
  Object.keys(order.diplomacyDelta || {}).forEach((target) => targets.add(target));
  Object.keys(order.failureDiplomacyDelta || {}).forEach((target) => targets.add(target));
  Object.keys(order.nationDelta || {}).forEach((target) => targets.add(target));
  Object.keys(order.failureNationDelta || {}).forEach((target) => targets.add(target));

  if (knownCountryNames.has(order.target)) targets.add(order.target);
  else targets.add(orderTargetAliases[order.target] || order.target);

  return [...targets];
}

function eventSeverity(impact?: WorldEventImpact, tone?: WorldEventTone) {
  if (tone === 'red' || impact === 'threat' || impact === 'military') return 82;
  if (impact === 'trade') return 58;
  if (impact === 'diplomacy') return 54;
  return 46;
}

function markerForSignal({
  relation,
  focus,
  eventImpact,
  activeOrders,
  tradeOrders,
  militaryOrders,
  hasEvent,
  intentType,
}: {
  relation: number;
  focus: NationFocus;
  eventImpact?: WorldEventImpact;
  activeOrders: number;
  tradeOrders: number;
  militaryOrders: number;
  hasEvent: boolean;
  intentType?: NationIntentType;
}): MapSignalMarker {
  if (militaryOrders > 0 || eventImpact === 'military' || eventImpact === 'threat') return 'military';
  if (tradeOrders > 0 || eventImpact === 'trade' || focus === 'trade') return 'trade';
  if (relation <= -60) return 'threat';
  const fromIntent = intentMarker(intentType);
  if (fromIntent) return fromIntent;
  if (activeOrders > 0 || hasEvent) return 'event';
  if (relation >= 50 || focus === 'diplomacy') return 'diplomacy';
  return 'event';
}

function toneForSignal(marker: MapSignalMarker, relation: number): MapSignalTone {
  if (marker === 'trade') return 'trade';
  if (marker === 'military' || marker === 'threat') return relation <= -60 ? 'hostile' : 'military';
  if (marker === 'event') return 'event';
  return relationTone(relation);
}

export function buildMapSignals(
  state: GameState,
  countryNameToMapKey: Record<string, string>,
): MapSignal[] {
  const knownCountryNames = new Set<string>([
    ...Object.keys(countryNameToMapKey),
    ...state.diplomacy.map((relation) => relation.name),
    ...state.nations.map((nation) => nation.name),
  ]);
  const activeOrders = state.orders.filter(isActiveOrder);

  const countryNames = new Set<string>([
    'Россия',
    ...state.nations.map((nation) => nation.name),
    ...state.diplomacy.map((relation) => relation.name),
    ...state.worldEvents.map((event) => event.actor),
    ...activeOrders.flatMap((order) => resolveOrderCountries(order, knownCountryNames)),
  ]);

  if (state.selectedCountry) countryNames.add(state.selectedCountry.name);

  return [...countryNames]
    .map((countryName): MapSignal | null => {
      const countryKey = countryNameToMapKey[countryName];
      if (!countryKey) return null;

      const nation = state.nations.find((item) => item.name === countryName);
      const relation = state.diplomacy.find((item) => item.name === countryName);
      const relatedOrders = activeOrders.filter((order) => resolveOrderCountries(order, knownCountryNames).includes(countryName));
      const relatedEvent = state.worldEvents.find((event) => event.actor === countryName);
      const score = countryName === 'Россия' ? 200 : relation?.score ?? nation?.relation ?? 0;
      const focus = nation?.focus ?? (relatedOrders.some(isTradeOrder) ? 'trade' : relatedOrders.some(isMilitaryOrder) ? 'military' : 'diplomacy');
      const currentIntent = nation?.currentIntent;
      const threat = nation?.threat ?? (score <= -60 ? 82 : score <= -20 ? 58 : 24);
      const pressure = nation?.pressure ?? (score <= -60 ? 78 : score <= -20 ? 54 : 20);
      const tradeOrders = relatedOrders.filter(isTradeOrder).length;
      const militaryOrders = relatedOrders.filter(isMilitaryOrder).length;
      const marker = countryName === 'Россия'
        ? 'capital'
        : markerForSignal({
            relation: score,
            focus,
            eventImpact: relatedEvent?.impact,
            activeOrders: relatedOrders.length,
            tradeOrders,
            militaryOrders,
            hasEvent: Boolean(relatedEvent),
            intentType: currentIntent?.type,
          });
      const severity = Math.max(
        countryName === 'Россия' ? 64 : 0,
        threat,
        pressure,
        score <= -60 ? 92 : score <= -20 ? 70 : score >= 100 ? 64 : 0,
        relatedOrders.length ? 62 + relatedOrders.length * 8 : 0,
        currentIntent ? 42 + currentIntent.confidence * 0.52 : 0,
        eventSeverity(relatedEvent?.impact, relatedEvent?.tone),
      );
      const shortStatus = countryName === 'Россия'
        ? 'центр державы'
        : relatedOrders.length
          ? `${relatedOrders.length} приказ`
            : relatedEvent
            ? relatedEvent.impact === 'trade'
              ? 'торговое событие'
              : relatedEvent.impact === 'threat' || relatedEvent.impact === 'military'
                ? 'угроза'
                : 'мировое событие'
            : currentIntent
              ? intentLabel(currentIntent.type)
            : relationLabel(score);

      return {
        countryKey,
        countryName,
        status: countryName === 'Россия' ? 'russia' : statusFromRelation(score),
        relation: score,
        threat,
        pressure,
        focus,
        marker,
        tone: countryName === 'Россия' ? 'own' : toneForSignal(marker, score),
        severity: Math.min(100, Math.round(severity)),
        activeOrders: relatedOrders.length,
        tradeOrders,
        militaryOrders,
        hasEvent: Boolean(relatedEvent),
        intentType: currentIntent?.type,
        eventImpact: relatedEvent?.impact,
        eventTone: relatedEvent?.tone,
        title: relatedEvent?.title || relatedOrders[0]?.title || currentIntent?.title || nation?.lastAction || `${countryName}: ${focusLabel(focus)}`,
        summary: relatedOrders[0]?.title || relatedEvent?.text || currentIntent?.summary || nation?.lastAction || `${countryName}: ${relationLabel(score)}, фокус - ${focusLabel(focus)}.`,
        shortStatus,
      };
    })
    .filter((signal): signal is MapSignal => Boolean(signal))
    .sort((a, b) => b.severity - a.severity);
}

export function filterMapSignalsForMode(signals: MapSignal[], mode: MapModeId) {
  if (mode === 'trade') {
    return signals.filter((signal) =>
      signal.marker === 'capital' ||
      signal.marker === 'trade' ||
      signal.focus === 'trade' ||
      signal.tradeOrders > 0 ||
      signal.eventImpact === 'trade' ||
      signal.intentType === 'trade' ||
      signal.intentType === 'industry' ||
      signal.relation >= 100,
    );
  }

  if (mode === 'strategy') {
    return signals.filter((signal) =>
      signal.marker === 'capital' ||
      signal.activeOrders > 0 ||
      signal.marker === 'military' ||
      signal.marker === 'threat' ||
      signal.militaryOrders > 0 ||
      signal.eventImpact === 'threat' ||
      signal.eventImpact === 'military' ||
      signal.intentType === 'military' ||
      signal.intentType === 'covert' ||
      signal.intentType === 'defense' ||
      signal.threat >= 55 ||
      signal.pressure >= 55 ||
      signal.relation < -20,
    );
  }

  return signals.filter((signal) =>
    signal.marker === 'capital' ||
    signal.activeOrders > 0 ||
    signal.hasEvent ||
    Boolean(signal.intentType) ||
    signal.relation >= 50 ||
    signal.relation < -20,
  );
}
