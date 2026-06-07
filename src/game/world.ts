import type {
  ChatMessage,
  CompletedOrderReport,
  GameState,
  Letter,
  NationIntent,
  NationProfile,
  ResourceDelta,
  ResourceId,
  TurnReport,
  WorldEvent,
} from './types';

const MAX_WORLD_EVENTS = 10;
const MAX_REPORT_ITEMS = 4;

type WorldSimulationResult = {
  nations: NationProfile[];
  events: WorldEvent[];
  resourceDelta: ResourceDelta;
  diplomacyDelta: Record<string, number>;
  letters: Letter[];
  chatMessages: ChatMessage[];
  worldTension: number;
  report: TurnReport;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const addResource = (delta: ResourceDelta, resource: ResourceId, value: number) => {
  delta[resource] = (delta[resource] || 0) + value;
};

const addDiplomacy = (delta: Record<string, number>, nation: string, value: number) => {
  delta[nation] = Math.max(-12, Math.min(8, (delta[nation] || 0) + value));
};

function relationFor(state: GameState, nation: NationProfile) {
  return state.diplomacy.find((relation) => relation.name === nation.name)?.score ?? nation.relation;
}

function actionTime(turn: number, offset = 0) {
  const hour = String((turn * 3 + offset) % 24).padStart(2, '0');
  const minute = String((turn * 11 + offset * 7) % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function eventId(turn: number, actor: string, tag: string) {
  return `world-${turn}-${actor}-${tag}`.toLowerCase();
}

function makeChatMessage(turn: number, index: number, nation: NationProfile, text: string): ChatMessage {
  return {
    id: `world-chat-${turn}-${nation.id}-${index}`,
    time: actionTime(turn, index),
    flag: nation.flag,
    faction: nation.name,
    text,
  };
}

function intentLabel(type: NationIntent['type']) {
  if (type === 'trade') return 'торговое намерение';
  if (type === 'diplomacy') return 'дипломатическое намерение';
  if (type === 'military') return 'военное намерение';
  if (type === 'defense') return 'оборонное намерение';
  if (type === 'industry') return 'экономическое намерение';
  return 'скрытое намерение';
}

function orderTouchesNation(order: CompletedOrderReport, nation: NationProfile) {
  return (
    order.target === nation.name ||
    order.title.includes(nation.name) ||
    order.text.includes(nation.name)
  );
}

function intentTension(intent: NationIntent) {
  if (intent.type === 'military') return 6;
  if (intent.type === 'covert') return 4;
  if (intent.type === 'defense') return 2;
  if (intent.type === 'trade') return -2;
  if (intent.type === 'diplomacy') return -1;
  return 0;
}

function chooseNationIntent(
  state: GameState,
  nation: NationProfile,
  nextTurn: number,
  index: number,
  completedOrders: CompletedOrderReport[],
): NationIntent {
  const relation = relationFor(state, nation);
  const touchedOrder = completedOrders.find((order) => orderTouchesNation(order, nation));
  const orderPressure = touchedOrder ? (touchedOrder.succeeded ? -4 : 5) : 0;
  const pulse = (nextTurn + index + nation.id.length) % 6;
  const danger = nation.threat + nation.pressure + (relation < -40 ? 20 : 0) + orderPressure * 2;

  if (nation.id === 'russia') {
    const underPressure = state.worldTension >= 62 || nation.stability < 62 || completedOrders.some((order) => !order.succeeded);
    return {
      type: underPressure ? 'defense' : 'industry',
      target: underPressure ? 'внутренний порядок' : 'казна и снабжение',
      title: underPressure ? 'Стабилизировать державу' : 'Укрепить хозяйство державы',
      summary: underPressure
        ? 'Совет держит резервы ближе к столице и просит не перегружать фронтир рискованными приказами.'
        : 'Канцелярия готовит спокойный хозяйственный ход: налоги, зерно и снабжение должны идти ровнее.',
      confidence: underPressure ? 86 : 78,
      visibility: 'open',
      pressureDelta: underPressure ? -2 : -3,
      threatDelta: underPressure ? -1 : -2,
      diplomacyDelta: 0,
      eventTone: underPressure ? 'bronze' : 'green',
      eventImpact: underPressure ? 'stability' : 'economy',
    };
  }

  if (relation <= -65 || danger >= 150) {
    const covert = nation.focus !== 'military' && pulse >= 4;
    return {
      type: covert ? 'covert' : 'military',
      target: relation <= -65 ? 'российские рубежи' : 'спорный регион',
      title: covert ? `${nation.name}: скрытая подготовка` : `${nation.name}: военное давление`,
      summary: covert
        ? `${nation.name} собирает закрытые сведения и ищет место, где российский приказ можно сорвать без открытой войны.`
        : `${nation.name} стягивает силы, проверяет снабжение и показывает готовность ответить на слабый приказ.`,
      confidence: clamp(58 + Math.round(danger / 6), 55, 96),
      visibility: covert ? 'hidden' : 'guarded',
      pressureDelta: covert ? 4 : 6,
      threatDelta: covert ? 5 : 7,
      diplomacyDelta: relation <= -65 ? -4 : -2,
      eventTone: 'red',
      eventImpact: 'threat',
    };
  }

  if (relation < -20 || nation.focus === 'defense' || nation.stability < 52) {
    return {
      type: 'defense',
      target: 'границы и столица',
      title: `${nation.name}: оборонная стойка`,
      summary: `${nation.name} укрепляет внутренний порядок и осторожно закрывает часть военных данных от чужих посольств.`,
      confidence: clamp(54 + nation.pressure - Math.max(0, relation), 52, 88),
      visibility: relation < -20 ? 'guarded' : 'open',
      pressureDelta: relation < -20 ? 3 : 1,
      threatDelta: relation < -20 ? 2 : 0,
      diplomacyDelta: relation < -20 ? -1 : 0,
      eventTone: 'bronze',
      eventImpact: 'military',
    };
  }

  if ((nation.focus === 'trade' || nation.grain >= 72 || nation.economy >= 78) && relation >= 35) {
    const allyScale = relation >= 100 ? 1.25 : 1;
    return {
      type: 'trade',
      target: 'российский рынок',
      title: `${nation.name}: торговый коридор`,
      summary: `${nation.name} готовит обмен ресурсами и ждет, будет ли Россия развивать безопасный маршрут.`,
      confidence: clamp(56 + Math.round(nation.economy / 3) + (relation >= 100 ? 10 : 0), 55, 95),
      visibility: 'open',
      pressureDelta: -2,
      threatDelta: -2,
      diplomacyDelta: relation >= 100 ? 2 : 1,
      resourceDelta: {
        gold: Math.round((nation.focus === 'trade' ? 230 : 150) * allyScale),
        grain: Math.round((nation.grain >= 72 ? 160 : 80) * allyScale),
      },
      eventTone: 'green',
      eventImpact: 'trade',
    };
  }

  if (nation.focus === 'industry' && relation >= 0) {
    return {
      type: 'industry',
      target: 'промышленные поставки',
      title: `${nation.name}: промышленная заявка`,
      summary: `${nation.name} ищет железо, камень и стабильный договор, чтобы не зависеть от военных кризисов.`,
      confidence: clamp(54 + Math.round(nation.treasury / 3), 52, 90),
      visibility: relation >= 50 ? 'open' : 'guarded',
      pressureDelta: -1,
      threatDelta: 0,
      diplomacyDelta: relation >= 50 ? 1 : 0,
      resourceDelta: relation >= 50 ? { iron: 90 } : undefined,
      eventTone: 'blue',
      eventImpact: 'economy',
    };
  }

  return {
    type: 'diplomacy',
    target: 'канал переговоров',
    title: `${nation.name}: дипломатический зонд`,
    summary: `${nation.name} проверяет, можно ли улучшить отношения без немедленных военных или торговых обязательств.`,
    confidence: clamp(52 + Math.round(nation.stability / 4) + (pulse === 0 ? 8 : 0), 52, 88),
    visibility: relation >= 45 ? 'open' : 'guarded',
    pressureDelta: -1,
    threatDelta: -1,
    diplomacyDelta: relation >= 50 ? 1 : 2,
    eventTone: 'blue',
    eventImpact: 'diplomacy',
  };
}

function applyIntentToNation(nation: NationProfile, intent: NationIntent): NationProfile {
  const economyDelta = intent.type === 'trade' || intent.type === 'industry' ? 1 : 0;
  const armyDelta = intent.type === 'military' || intent.type === 'defense' ? 1 : 0;
  const stabilityDelta = intent.type === 'covert' || intent.type === 'military' ? -1 : intent.type === 'diplomacy' ? 1 : 0;

  return {
    ...nation,
    economy: clamp(nation.economy + economyDelta),
    army: clamp(nation.army + armyDelta),
    stability: clamp(nation.stability + stabilityDelta),
    pressure: clamp(nation.pressure + intent.pressureDelta),
    threat: clamp(nation.threat + intent.threatDelta),
    currentIntent: intent,
    lastAction: intent.summary,
  };
}

function createIntentEvent(turn: number, nation: NationProfile, intent: NationIntent): WorldEvent {
  return {
    id: eventId(turn, nation.id, intent.type),
    turn,
    actor: nation.name,
    flag: nation.flag,
    title: intent.title,
    text: intent.summary,
    tone: intent.eventTone,
    impact: intent.eventImpact,
  };
}

function intentChatText(intent: NationIntent) {
  if (intent.type === 'trade') return 'Наши купцы подтверждают маршрут. Ждем ваших дальнейших распоряжений.';
  if (intent.type === 'diplomacy') return 'Мы готовы к осторожному разговору, если условия будут ясными.';
  if (intent.type === 'military') return 'Наши войска приведены в готовность. Любая провокация получит ответ.';
  if (intent.type === 'defense') return 'Мы укрепляем порядок и не допустим давления на наши границы.';
  if (intent.type === 'industry') return 'Промышленные палаты готовы обсуждать поставки при стабильном договоре.';
  return 'Официальных заявлений нет. Канцелярии наблюдают за вашими шагами.';
}

function intentPriority(nation: NationProfile) {
  const intent = nation.currentIntent;
  if (!intent) return 0;
  const typeWeight =
    intent.type === 'military' ? 44 :
    intent.type === 'covert' ? 38 :
    intent.type === 'trade' ? 30 :
    intent.type === 'diplomacy' ? 24 :
    intent.type === 'defense' ? 22 :
    18;
  return typeWeight + intent.confidence + nation.threat + nation.pressure + (Math.abs(intent.diplomacyDelta) * 4);
}

function updateNationBase(state: GameState, nation: NationProfile): NationProfile {
  const relation = relationFor(state, nation);
  const hostilePressure = relation < -60 ? 7 : relation < -20 ? 4 : relation < 30 ? 2 : -2;
  const focusEconomy = nation.focus === 'trade' || nation.focus === 'industry' ? 2 : 0;
  const focusArmy = nation.focus === 'military' || nation.focus === 'defense' ? 2 : 0;
  const focusStability = nation.focus === 'diplomacy' ? 2 : relation < -40 ? -1 : 1;

  return {
    ...nation,
    relation,
    economy: clamp(nation.economy + focusEconomy + (relation > 80 ? 1 : 0)),
    army: clamp(nation.army + focusArmy + (relation < -50 ? 1 : 0)),
    stability: clamp(nation.stability + focusStability),
    treasury: clamp(nation.treasury + Math.round((nation.economy - 55) / 18)),
    grain: clamp(nation.grain + (nation.focus === 'trade' ? 1 : 0) - (nation.army > 76 ? 1 : 0)),
    threat: clamp(nation.threat + hostilePressure + focusArmy - (relation > 80 ? 2 : 0)),
    pressure: clamp(nation.pressure + hostilePressure + Math.round((70 - nation.stability) / 18)),
  };
}

function patchNationAction(nations: NationProfile[], name: string, action: string, pressureDelta = 0, threatDelta = 0) {
  return nations.map((nation) =>
    nation.name === name
      ? {
          ...nation,
          pressure: clamp(nation.pressure + pressureDelta),
          threat: clamp(nation.threat + threatDelta),
          lastAction: action,
        }
      : nation,
  );
}

function summarizeResourceDelta(delta: ResourceDelta) {
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([resource, value]) => `${value > 0 ? '+' : ''}${Math.round(value)} ${resource}`);

  return parts.length ? parts.join(', ') : 'без прямых изменений ресурсов';
}

export function simulateWorldTurn(
  state: GameState,
  nextTurn: number,
  completedOrders: CompletedOrderReport[],
): WorldSimulationResult {
  let nations = state.nations
    .map((nation) => updateNationBase(state, nation))
    .map((nation, index) =>
      applyIntentToNation(nation, chooseNationIntent(state, nation, nextTurn, index, completedOrders)),
    );
  const events: WorldEvent[] = [];
  const letters: Letter[] = [];
  const chatMessages: ChatMessage[] = [];
  const resourceDelta: ResourceDelta = {};
  const diplomacyDelta: Record<string, number> = {};
  const warnings: string[] = [];
  const opportunities: string[] = [];
  let tensionDelta = completedOrders.some((order) => !order.succeeded) ? 5 : -1;

  const visibleIntents = [...nations]
    .filter((nation) => nation.id !== 'russia' && nation.currentIntent)
    .sort((a, b) => intentPriority(b) - intentPriority(a))
    .slice(0, 3);

  visibleIntents.forEach((nation, index) => {
    const intent = nation.currentIntent;
    if (!intent) return;

    events.push(createIntentEvent(nextTurn, nation, intent));
    if (intent.diplomacyDelta) addDiplomacy(diplomacyDelta, nation.name, intent.diplomacyDelta);
    Object.entries(intent.resourceDelta || {}).forEach(([resource, value]) => {
      if (value) addResource(resourceDelta, resource as ResourceId, value);
    });
    tensionDelta += intentTension(intent);
    chatMessages.push(makeChatMessage(nextTurn, index + 1, nation, intentChatText(intent)));

    if (intent.type === 'military' || intent.type === 'covert') {
      warnings.push(`${nation.name}: ${intentLabel(intent.type)} может сорвать слабый приказ или поднять напряжение.`);
      letters.push({
        tone: 'red',
        from: nation.name,
        subject: intent.type === 'covert' ? 'Неясная активность у границ' : 'Военное предупреждение',
        time: 'только что',
      });
    } else if (intent.type === 'trade' || intent.type === 'diplomacy' || intent.type === 'industry') {
      opportunities.push(`${nation.name}: ${intentLabel(intent.type)} можно развить приказом, письмом или миссией.`);
      if (intent.visibility === 'open') {
        letters.push({
          tone: intent.type === 'trade' ? 'gold' : 'neutral',
          from: nation.name,
          subject: intent.type === 'trade' ? 'Окно торгового соглашения' : 'Осторожные переговоры',
          time: 'только что',
        });
      }
    }
  });

  const russia = nations.find((nation) => nation.id === 'russia');
  if (russia && (russia.stability < 58 || state.worldTension + tensionDelta > 70)) {
    const action = 'Внутренний совет требует снизить военное напряжение или поддержать экономику.';
    events.push({
      id: eventId(nextTurn, 'russia', 'stability'),
      turn: nextTurn,
      actor: russia.name,
      flag: russia.flag,
      title: 'Совет предупреждает о перегрузе',
      text: action,
      tone: 'bronze',
      impact: 'stability',
    });
    addResource(resourceDelta, 'gold', -160);
    addResource(resourceDelta, 'grain', -120);
    tensionDelta += 2;
    warnings.push('Высокое напряжение мира начинает давить на казну и снабжение.');
    nations = patchNationAction(nations, russia.name, action, 3, 0);
  }

  if (!events.length) {
    const action = 'Канцелярии держав заняты подготовкой следующего раунда переговоров.';
    events.push({
      id: eventId(nextTurn, 'council', 'quiet'),
      turn: nextTurn,
      actor: 'Совет империи',
      flag: 'russia',
      title: 'Мир затаил дыхание',
      text: action,
      tone: 'blue',
      impact: 'diplomacy',
    });
    opportunities.push('Тихий ход удобен для развития земель или дипломатического письма.');
  }

  const nextWorldTension = clamp(state.worldTension + tensionDelta);
  if (nextWorldTension >= 72) warnings.push('Напряжение мира высокое: риск провала военных приказов растет.');
  if (nextWorldTension <= 35) opportunities.push('Мир достаточно спокоен для торговли и инфраструктуры.');

  const summary = `Ход ${nextTurn}: завершено приказов ${completedOrders.length}, активных намерений держав ${nations.filter((nation) => nation.currentIntent).length}, событий мира ${events.length}, напряжение мира ${nextWorldTension}/100.`;
  const report: TurnReport = {
    turn: nextTurn,
    summary,
    completedOrders: completedOrders.slice(0, MAX_REPORT_ITEMS),
    worldEvents: events.slice(0, MAX_REPORT_ITEMS),
    resourceDelta,
    diplomacyDelta,
    warnings: warnings.slice(0, MAX_REPORT_ITEMS),
    opportunities: opportunities.slice(0, MAX_REPORT_ITEMS),
  };

  return {
    nations,
    events,
    resourceDelta,
    diplomacyDelta,
    letters,
    chatMessages,
    worldTension: nextWorldTension,
    report: {
      ...report,
      summary: `${summary} Итог ресурсов мира: ${summarizeResourceDelta(resourceDelta)}.`,
    },
  };
}

export function mergeWorldEvents(current: WorldEvent[], incoming: WorldEvent[]) {
  return [...incoming, ...current].slice(0, MAX_WORLD_EVENTS);
}
