import type {
  ChatMessage,
  CompletedOrderReport,
  GameState,
  Letter,
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

function strongestHostile(nations: NationProfile[]) {
  return [...nations]
    .filter((nation) => nation.relation < -20 || nation.threat >= 55)
    .sort((a, b) => b.threat + b.pressure - (a.threat + a.pressure))[0];
}

function strongestFriendly(nations: NationProfile[]) {
  return [...nations]
    .filter((nation) => nation.relation >= 50 && nation.id !== 'russia')
    .sort((a, b) => b.economy + b.relation - (a.economy + a.relation))[0];
}

function mostUsefulNeutral(nations: NationProfile[]) {
  return [...nations]
    .filter((nation) => nation.relation > -20 && nation.relation < 50)
    .sort((a, b) => b.economy + b.stability - (a.economy + a.stability))[0];
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
  let nations = state.nations.map((nation) => updateNationBase(state, nation));
  const events: WorldEvent[] = [];
  const letters: Letter[] = [];
  const chatMessages: ChatMessage[] = [];
  const resourceDelta: ResourceDelta = {};
  const diplomacyDelta: Record<string, number> = {};
  const warnings: string[] = [];
  const opportunities: string[] = [];
  let tensionDelta = completedOrders.some((order) => !order.succeeded) ? 5 : -1;

  const hostile = strongestHostile(nations);
  if (hostile && (hostile.threat >= 65 || nextTurn % 2 === 0)) {
    const action = `${hostile.name} усиливает давление и проверяет слабые места границы.`;
    events.push({
      id: eventId(nextTurn, hostile.id, 'pressure'),
      turn: nextTurn,
      actor: hostile.name,
      flag: hostile.flag,
      title: `${hostile.name}: рост напряжения`,
      text: action,
      tone: 'red',
      impact: 'threat',
    });
    addDiplomacy(diplomacyDelta, hostile.name, hostile.relation < -60 ? -4 : -2);
    tensionDelta += hostile.relation < -60 ? 7 : 4;
    warnings.push(`${hostile.name} может сорвать слабый приказ или втянуть регион в кризис.`);
    chatMessages.push(makeChatMessage(nextTurn, 1, hostile, 'Наши войска приведены в готовность. Любая провокация получит ответ.'));
    letters.push({
      tone: 'red',
      from: hostile.name,
      subject: 'Военное предупреждение',
      time: 'только что',
    });
    nations = patchNationAction(nations, hostile.name, action, 5, 4);
  }

  const friendly = strongestFriendly(nations);
  if (friendly && nextTurn % 3 !== 0) {
    const goldBonus = friendly.focus === 'trade' ? 260 : 180;
    const grainBonus = friendly.grain > 70 ? 180 : 90;
    const action = `${friendly.name} расширяет обмен с российской канцелярией.`;
    events.push({
      id: eventId(nextTurn, friendly.id, 'trade'),
      turn: nextTurn,
      actor: friendly.name,
      flag: friendly.flag,
      title: `${friendly.name}: торговый ответ`,
      text: `${action} Казна получает ${goldBonus} золота и ${grainBonus} зерна.`,
      tone: 'green',
      impact: 'trade',
    });
    addResource(resourceDelta, 'gold', goldBonus);
    addResource(resourceDelta, 'grain', grainBonus);
    addDiplomacy(diplomacyDelta, friendly.name, 2);
    tensionDelta -= 2;
    opportunities.push(`${friendly.name} готова принять новый торговый или союзный приказ.`);
    chatMessages.push(makeChatMessage(nextTurn, 2, friendly, 'Наши купцы подтверждают маршрут. Ждем ваших дальнейших распоряжений.'));
    nations = patchNationAction(nations, friendly.name, action, -2, -2);
  }

  const neutral = mostUsefulNeutral(nations);
  if (neutral && nextTurn % 3 === 0) {
    const action = `${neutral.name} предлагает осторожные переговоры без военных обязательств.`;
    events.push({
      id: eventId(nextTurn, neutral.id, 'talks'),
      turn: nextTurn,
      actor: neutral.name,
      flag: neutral.flag,
      title: `${neutral.name}: окно переговоров`,
      text: action,
      tone: 'blue',
      impact: 'diplomacy',
    });
    addDiplomacy(diplomacyDelta, neutral.name, 3);
    tensionDelta -= 1;
    opportunities.push(`${neutral.name} можно подтянуть к дружественному статусу дипломатическим письмом.`);
    letters.push({
      tone: 'gold',
      from: neutral.name,
      subject: 'Осторожные переговоры',
      time: 'только что',
    });
    nations = patchNationAction(nations, neutral.name, action, -1, -1);
  }

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

  const summary = `Ход ${nextTurn}: завершено приказов ${completedOrders.length}, событий мира ${events.length}, напряжение мира ${nextWorldTension}/100.`;
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
