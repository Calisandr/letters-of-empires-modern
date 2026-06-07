import type { ChatMessage, DiplomacyRelation, GameState, Letter, Order, ResourceState, TimelineEvent } from './types';

export const GAME_STATE_VERSION = 1;

export const playerCountry = {
  name: 'Россия',
  flag: 'russia',
};

export const initialResources: ResourceState[] = [
  { id: 'gold', label: 'Золото', value: 12540, perTurn: 1250, format: 'integer' },
  { id: 'wood', label: 'Дерево', value: 8760, perTurn: 720, format: 'integer' },
  { id: 'stone', label: 'Камень', value: 6410, perTurn: 610, format: 'integer' },
  { id: 'iron', label: 'Железо', value: 7230, perTurn: 560, format: 'integer' },
  { id: 'grain', label: 'Зерно', value: 9850, perTurn: 1100, format: 'integer' },
  { id: 'population', label: 'Население', value: 146.2, perTurn: 0.8, format: 'population' },
];

export const initialChatMessages: ChatMessage[] = [
  {
    id: 'chat-1',
    time: '12:45',
    flag: 'france',
    faction: 'Франция',
    text: 'Кто заинтересован в совместной торговле редкими ресурсами?',
  },
  {
    id: 'chat-2',
    time: '12:45',
    flag: 'turkey',
    faction: 'Турция',
    text: 'Мы открыты к переговорам по новому маршруту через Черное море.',
  },
  {
    id: 'chat-3',
    time: '12:46',
    flag: 'russia',
    faction: 'Россия',
    text: 'Нужно обсудить долгосрочные поставки железа и зерна.',
  },
  {
    id: 'chat-4',
    time: '12:47',
    flag: 'india',
    faction: 'Индия',
    text: 'Внимание всем! На наши земли совершено нападение пиратов.',
  },
  {
    id: 'chat-5',
    time: '12:47',
    flag: 'germany',
    faction: 'Германия',
    text: 'Предлагаю заключить пакт о ненападении между нашими странами.',
  },
];

export const initialOrders: Order[] = [
  {
    id: 'trade-india',
    iconKey: 'package',
    title: 'Отправить торговый караван в Индию',
    owner: 'Торговый совет',
    target: 'Дели',
    status: 'В пути',
    statusClass: 'moving',
    due: '2 дня',
    remainingTurns: 2,
    totalTurns: 2,
    cost: { gold: 420, grain: 260 },
    reward: { gold: 1500, grain: 650 },
    diplomacyDelta: { Индия: 8 },
    completeText: 'Караван достиг Дели: казна получила прибыль, а отношения с Индией укрепились.',
  },
  {
    id: 'ukraine-border',
    iconKey: 'swords',
    title: 'Укрепить границу с Украиной',
    owner: 'Генерал армии',
    target: 'Харьков',
    status: 'В работе',
    statusClass: 'progress',
    due: '3 дня',
    remainingTurns: 3,
    totalTurns: 3,
    cost: { gold: 650, iron: 360, grain: 220 },
    reward: { iron: 180 },
    diplomacyDelta: { Украина: -4 },
    completeText: 'Граница усилена: снабжение укреплено, но напряжение с Украиной выросло.',
    riskLevel: 'medium',
  },
  {
    id: 'kuzbass-mines',
    iconKey: 'pickaxe',
    title: 'Развивать шахты в Кузбассе',
    owner: 'Совет по развитию',
    target: 'Кузбасс',
    status: 'В работе',
    statusClass: 'progress',
    due: '5 дней',
    remainingTurns: 5,
    totalTurns: 5,
    cost: { gold: 900, wood: 520, stone: 400 },
    reward: { iron: 1900, stone: 850 },
    completeText: 'Шахты Кузбасса расширены: добыча железа и камня заметно выросла.',
  },
];

export const initialTimeline: TimelineEvent[] = [
  {
    icon: '⚑',
    tone: 'blue',
    title: 'Новый торговый договор',
    text: 'Франция и Испания подписали торговый договор.',
    time: '10 мин. назад',
  },
  {
    icon: '✦',
    tone: 'red',
    title: 'Военный альянс создан',
    text: 'Германия и Швейцария создали военный альянс.',
    time: '45 мин. назад',
  },
  {
    icon: '⚔',
    tone: 'red',
    title: 'Восстание подавлено',
    text: 'В провинции Синьцзян восстание было подавлено.',
    time: '2 часа назад',
  },
  {
    icon: '♜',
    tone: 'green',
    title: 'Новый правитель',
    text: 'В Аргентине новый правитель: Король Матиас I.',
    time: '3 часа назад',
  },
  {
    icon: '◎',
    tone: 'bronze',
    title: 'Торговый путь установлен',
    text: 'Турция и Индия установили новый торговый путь.',
    time: '5 часов назад',
  },
];

export const initialLetters: Letter[] = [
  { tone: 'neutral', from: 'Франция', subject: 'Торговое предложение', time: '5 мин. назад' },
  { tone: 'red', from: 'Турция', subject: 'Дипломатический запрос', time: '32 мин. назад' },
  { tone: 'burgundy', from: 'Германия', subject: 'Военный союз', time: '1 час назад' },
  { tone: 'gold', from: 'Китай', subject: 'Граница и торговля', time: '2 часа назад' },
  { tone: 'blue', from: 'Аргентина', subject: 'Обмен ресурсами', time: '3 часа назад' },
];

export const initialDiplomacy: DiplomacyRelation[] = [
  { flag: 'china', name: 'Китай', status: 'Союзники', tone: 'ally', score: 165 },
  { flag: 'india', name: 'Индия', status: 'Союзники', tone: 'ally', score: 120 },
  { flag: 'france', name: 'Франция', status: 'Дружественные', tone: 'friendly', score: 75 },
  { flag: 'turkey', name: 'Турция', status: 'Нейтральные', tone: 'neutral', score: 10 },
  { flag: 'germany', name: 'Германия', status: 'Нейтральные', tone: 'neutral', score: 5 },
  { flag: 'japan', name: 'Япония', status: 'Риск конфликта', tone: 'risk', score: -25 },
  { flag: 'ukraine', name: 'Украина', status: 'Враждебные', tone: 'hostile', score: -80 },
];

export const initialGameState: GameState = {
  version: GAME_STATE_VERSION,
  resources: initialResources,
  orders: initialOrders,
  timelineEvents: initialTimeline,
  letters: initialLetters,
  diplomacy: initialDiplomacy,
  chatMessages: initialChatMessages,
  quickActionTurns: {},
  turnNumber: 123,
  selectedCountry: null,
  nextActionId: 1000,
  lastNotice: null,
  actionStatus: { kind: 'idle', message: '' },
};
