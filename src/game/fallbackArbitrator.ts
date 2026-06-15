import { canPay, MAX_ACTIVE_ORDERS } from './engine';
import type { AiArbitrationDecision, EngineEffect, GameState, OrderDraft, ResourceDelta, ResourceId } from './types';

const resourceIds = new Set<ResourceId>(['gold', 'wood', 'stone', 'iron', 'grain', 'population']);

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function normalizeCouncilText(text: string) {
  return text.toLowerCase().replaceAll('ё', 'е');
}

function aliasesForCountry(name: string) {
  const normalized = normalizeCouncilText(name);
  const aliases = new Set([normalized]);

  if (normalized.endsWith('ия')) {
    const stem = normalized.slice(0, -2);
    aliases.add(`${stem}ию`);
    aliases.add(`${stem}ии`);
    aliases.add(`${stem}ией`);
  }

  if (normalized.endsWith('а')) {
    const stem = normalized.slice(0, -1);
    aliases.add(`${stem}у`);
    aliases.add(`${stem}е`);
    aliases.add(`${stem}ой`);
  }

  if (normalized.endsWith('й')) {
    const stem = normalized.slice(0, -1);
    aliases.add(`${stem}ю`);
    aliases.add(`${stem}я`);
    aliases.add(`${stem}ем`);
  }

  if (normalized === 'сша') {
    aliases.add('америка');
    aliases.add('соединенные штаты');
    aliases.add('штаты');
  }

  if (normalized === 'юар') {
    aliases.add('южная африка');
    aliases.add('претория');
  }

  if (normalized === 'великобритания') {
    aliases.add('британия');
    aliases.add('англия');
    aliases.add('лондон');
  }

  return [...aliases];
}

function resolveCouncilTarget(text: string, state: GameState) {
  const normalized = normalizeCouncilText(text);
  const candidates = [
    ...state.nations.map((nation) => nation.name),
    ...state.diplomacy.map((relation) => relation.name),
    state.selectedCountry?.name,
  ].filter((name): name is string => Boolean(name));
  const uniqueCandidates = [...new Set(candidates)];
  const explicitTarget = uniqueCandidates.find((name) =>
    aliasesForCountry(name).some((alias) => normalized.includes(alias)),
  );

  return explicitTarget || state.selectedCountry?.name || 'Москва';
}

function clampDiplomacyDelta(delta: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(delta).map(([name, value]) => [name, Math.max(-12, Math.min(8, Math.round(value)))]),
  );
}

function blocked(reason: string): AiArbitrationDecision {
  return {
    feasibility: 'blocked',
    judgement: 'impossible',
    riskLevel: 'critical',
    reasoningSummary: reason,
    playerFacingResult: reason,
    engineEffect: { kind: 'blocked', reason },
  };
}

function attemptable(
  playerFacingResult: string,
  engineEffect: EngineEffect,
  riskLevel: AiArbitrationDecision['riskLevel'] = 'medium',
): AiArbitrationDecision {
  return {
    feasibility: 'attemptable',
    judgement: riskLevel === 'high' || riskLevel === 'critical' ? 'possible_reckless' : 'possible_risky',
    riskLevel,
    reasoningSummary: playerFacingResult,
    playerFacingResult,
    engineEffect,
  };
}

function makeOrderFromText(text: string, target: string): OrderDraft {
  const lower = normalizeCouncilText(text);

  if (includesAny(lower, ['развед', 'шпион', 'досье', 'наблюд', 'оценить', 'проверить'])) {
    return {
      iconKey: 'mail',
      title: `Разведать намерения: ${target}`,
      owner: 'Разведывательная канцелярия',
      target,
      remainingTurns: 1,
      totalTurns: 1,
      cost: { gold: 240 },
      reward: { gold: 80 },
      nationDelta: target === 'Россия' ? { Россия: { pressure: -3 } } : { [target]: { pressure: -5, threat: -3 } },
      completeText: `Разведка собрала досье по цели "${target}": совет видит намерения, риски и окно для следующего приказа.`,
      failureText: `Разведка по цели "${target}" не дала полного результата: часть золота потрачена, а намерения остались неясными.`,
      riskLevel: target === 'Россия' ? 'low' : 'medium',
      successChance: target === 'Россия' ? 94 : 82,
    };
  }

  if (includesAny(lower, ['арм', 'войск', 'границ', 'защит', 'наступ', 'атака'])) {
    return {
      iconKey: 'shield',
      title: target === 'Москва' ? 'Сформировать резервную армию' : `Подготовить военную операцию: ${target}`,
      owner: 'Генеральный штаб',
      target,
      remainingTurns: 3,
      totalTurns: 3,
      cost: { gold: 760, iron: 440, grain: 320, population: 0.2 },
      reward: { iron: 120 },
      diplomacyDelta: target === 'Украина' ? { Украина: -8 } : undefined,
      completeText: `Военный приказ по цели "${target}" завершен. Армия получила снабжение, но совет требует осторожности.`,
      riskLevel: target === 'Украина' ? 'high' : 'medium',
    };
  }

  if (includesAny(lower, ['торг', 'караван', 'маршрут', 'порт'])) {
    return {
      iconKey: 'anchor',
      title: `Открыть торговый маршрут: ${target}`,
      owner: 'Торговый совет',
      target,
      remainingTurns: 2,
      totalTurns: 2,
      cost: { gold: 360, grain: 180 },
      reward: { gold: 1250, grain: 480 },
      diplomacyDelta: target === 'Москва' ? undefined : { [target]: 5 },
      completeText: `Торговый маршрут с целью "${target}" принес прибыль и укрепил дипломатический канал.`,
    };
  }

  return {
    iconKey: 'landmark',
    title: `Развить инфраструктуру: ${target}`,
    owner: 'Совет по развитию',
    target,
    remainingTurns: 2,
    totalTurns: 2,
    cost: { gold: 520, wood: 260, stone: 220 },
    reward: { stone: 620, gold: 260 },
    completeText: `Инфраструктура в цели "${target}" улучшена: логистика и сбор налогов стали эффективнее.`,
  };
}

export function fallbackJudgeCouncilCommand(text: string, state: GameState): AiArbitrationDecision {
  const normalized = normalizeCouncilText(text.trim());
  const target = resolveCouncilTarget(text, state);

  if (!normalized) return blocked('Сначала нужно написать приказ или сообщение совету.');

  if (includesAny(normalized, ['захватить мир', 'весь мир', 'луна', 'бесконеч', 'миллион арм', 'мгновенно'])) {
    return blocked('Совет отклонил приказ: действие нарушает масштаб мира и не может быть выполнено текущей державой.');
  }

  if (includesAny(normalized, ['диплом', 'отнош', 'союз', 'переговор'])) {
    return attemptable(
      `Дипломаты подготовили осторожное решение по цели "${target}".`,
      {
        kind: 'diplomacy-delta',
        diplomacyDelta: clampDiplomacyDelta({ [target]: 4 }),
        letter: { tone: 'gold', from: target, subject: 'Ответ на дипломатическое решение', time: 'только что' },
        eventTitle: 'Дипломатическое решение принято',
        eventText: `Канцелярия направила предложение державе "${target}". Отношения могут улучшиться, если решение не вызовет сопротивления.`,
      },
      'low',
    );
  }

  const hasOrderIntent = includesAny(normalized, [
    'постро',
    'разв',
    'созд',
    'отправ',
    'укреп',
    'сформ',
    'развед',
    'шпион',
    'досье',
    'провер',
    'наб',
    'торг',
    'караван',
    'маршрут',
    'арм',
    'войск',
    'дорог',
    'склад',
  ]);

  if (!hasOrderIntent) {
    return attemptable(
      'Совет принял сообщение к сведению. Для приказа укажи действие: построить, развить, отправить, укрепить или начать переговоры.',
      {
        kind: 'event-only',
        eventTitle: 'Совет получил сообщение',
        eventText: 'Канцелярия зафиксировала сообщение правителя без создания приказа.',
      },
      'low',
    );
  }

  const activeOrderCount = state.orders.filter((order) => order.statusClass !== 'cancelled').length;
  if (activeOrderCount >= MAX_ACTIVE_ORDERS) {
    return blocked('Совет отклонил приказ: лимит активных приказов уже заполнен.');
  }

  const order = makeOrderFromText(normalized, target);
  if (includesAny(normalized, ['атак', 'напасть', 'война', 'захват', 'наступ'])) {
    const relation = state.diplomacy.find((item) => item.name === target)?.score ?? 0;
    order.riskLevel = relation >= 50 ? 'critical' : 'high';
    order.successChance = relation >= 50 ? 28 : 54;
    order.failureCost = { gold: -520, iron: -360, grain: -260, population: -0.2 };
    order.failureDiplomacyDelta = target === 'Москва' ? undefined : { [target]: relation >= 50 ? -12 : -8 };
    order.failureText =
      relation >= 50
        ? `Необдуманная атака по цели "${target}" сорвала доверие союзников: войска потеряли снабжение, а дипломатическое положение резко ухудшилось.`
        : `Военная операция по цели "${target}" провалилась из-за высокого риска: часть войска и припасов потеряна.`;
  }
  return attemptable(`Совет подготовил приказ: ${order.title}.`, {
    kind: 'create-order',
    order,
  }, order.riskLevel || 'medium');
}

export function validateEngineEffect(decision: AiArbitrationDecision, state: GameState): EngineEffect {
  const effect = decision.engineEffect;
  if (decision.feasibility === 'blocked' || effect.kind === 'blocked') {
    return { kind: 'blocked', reason: effect.reason || decision.playerFacingResult };
  }
  const knownCountries = new Set(state.diplomacy.map((relation) => relation.name));
  state.nations.forEach((nation) => knownCountries.add(nation.name));
  if (state.selectedCountry) knownCountries.add(state.selectedCountry.name);
  const validateDiplomacyDelta = (delta: Record<string, number> | undefined, orderTarget?: string) => {
    if (!delta) return '';
    const allowedCountries = new Set(knownCountries);
    if (orderTarget && knownCountries.has(orderTarget)) allowedCountries.add(orderTarget);

    for (const [country, value] of Object.entries(delta)) {
      if (!allowedCountries.has(country)) return 'AI выбрал неизвестную дипломатическую цель.';
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'AI вернул некорректный дипломатический эффект.';
      if (value < -12 || value > 8) return 'AI вернул слишком сильный дипломатический эффект.';
    }

    return '';
  };

  const resourceDelta = effect.resourceDelta;
  if (resourceDelta) {
    for (const [resource, value] of Object.entries(resourceDelta)) {
      if (!resourceIds.has(resource as ResourceId)) return { kind: 'blocked', reason: 'AI вернул неизвестный ресурс.' };
      if (typeof value !== 'number' || !Number.isFinite(value)) return { kind: 'blocked', reason: 'AI вернул некорректный ресурсный эффект.' };
      if (Math.abs(value) > 2500) return { kind: 'blocked', reason: 'AI вернул слишком большой ресурсный эффект.' };
    }
    if (!validateResourceDeltaDoesNotBreakState(state, resourceDelta)) {
      return { kind: 'blocked', reason: 'AI попытался списать больше ресурсов, чем есть в казне.' };
    }
  }

  if (effect.diplomacyDelta) {
    const diplomacyError = validateDiplomacyDelta(effect.diplomacyDelta);
    if (diplomacyError) return { kind: 'blocked', reason: diplomacyError };
  }

  if (effect.kind === 'create-order') {
    const order = effect.order;
    if (!order) return { kind: 'blocked', reason: 'AI не вернул данные приказа.' };
    if (order.remainingTurns < 1 || order.remainingTurns > 5) return { kind: 'blocked', reason: 'Недопустимый срок приказа.' };

    for (const [resource, value] of Object.entries(order.cost || {})) {
      if (!resourceIds.has(resource as ResourceId) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return { kind: 'blocked', reason: 'Недопустимая стоимость приказа.' };
      }
    }

    if (!canPay(state.resources, order.cost)) return { kind: 'blocked', reason: 'Не хватает ресурсов для приказа.' };

    for (const [resource, value] of Object.entries(order.reward || {}) as [ResourceId, number][]) {
      if (!resourceIds.has(resource) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5000) {
        return { kind: 'blocked', reason: 'Недопустимая награда приказа.' };
      }
    }

    const diplomacyError =
      validateDiplomacyDelta(order.diplomacyDelta, order.target) ||
      validateDiplomacyDelta(order.failureDiplomacyDelta, order.target);
    if (diplomacyError) return { kind: 'blocked', reason: diplomacyError };
  }

  return effect;
}

export function validateResourceDeltaDoesNotBreakState(state: GameState, delta: ResourceDelta = {}) {
  return state.resources.every((resource) => (delta[resource.id] || 0) + resource.value >= 0);
}
