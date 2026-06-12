import { GAME_STATE_VERSION, initialGameState } from './initialState';
import type {
  ChatChannel,
  ChatMessage,
  DiplomacyRelation,
  GameState,
  Letter,
  NationProfile,
  OperationPlan,
  Order,
  PlayerProfile,
  ResourceState,
  TimelineEvent,
  WorldEvent,
} from './types';

const PROFILE_NAME_MAX_LENGTH = 15;
const PROFILE_STATUS_MAX_LENGTH = 80;

const SAVE_KEY = 'letters-of-empires:game:v1';

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordArrayOrDefault<T extends object>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback;
  const records = value.filter(isRecord) as T[];
  return records.length === 0 && value.length > 0 && fallback.length > 0 ? fallback : records;
}

function objectOrDefault<T extends object>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableObjectOrDefault<T extends object>(value: unknown, fallback: T | null): T | null {
  if (value === null || value === undefined) return fallback;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function isChatChannel(value: unknown): value is ChatChannel {
  return value === 'council' || value === 'world' || value === 'alliance';
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function limitText(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join('');
}

function normalizeProfile(value: unknown): PlayerProfile {
  const profile = objectOrDefault<Partial<PlayerProfile>>(value, initialGameState.profile);
  const name = limitText(stringOrDefault(profile.name, initialGameState.profile.name).trim(), PROFILE_NAME_MAX_LENGTH) || initialGameState.profile.name;
  const status = limitText(stringOrDefault(profile.status, initialGameState.profile.status).trim(), PROFILE_STATUS_MAX_LENGTH);
  const avatarDataUrl = stringOrDefault(profile.avatarDataUrl, '');

  return {
    name,
    title: 'Правитель',
    status,
    avatarDataUrl: avatarDataUrl.startsWith('data:image/') ? avatarDataUrl : '',
  };
}

function inferChatChannel(message: Partial<ChatMessage>): ChatChannel {
  if (isChatChannel(message.channel)) return message.channel;
  if (message.id?.startsWith('world-chat-') || message.id?.startsWith('world-')) return 'world';
  if (message.id?.startsWith('alliance-')) return 'alliance';
  if (message.faction === 'Совет' || message.faction === 'Канцлер') return 'council';
  return 'world';
}

function normalizeChatMessages(value: unknown) {
  return recordArrayOrDefault<Partial<ChatMessage>>(value, initialGameState.chatMessages).map((message, index) => ({
    id: stringOrDefault(message.id, `chat-repaired-${index}`),
    channel: inferChatChannel(message),
    time: stringOrDefault(message.time, '--:--'),
    faction: stringOrDefault(message.faction, 'Неизвестно'),
    flag: stringOrDefault(message.flag, 'neutral'),
    text: stringOrDefault(
      initialGameState.chatMessages.find((initialMessage) => initialMessage.id === message.id && message.id?.startsWith('council-'))?.text ||
        message.text,
      '',
    ),
  }));
}

export function loadGameState(): GameState {
  const storage = getLocalStorage();
  if (!storage) return initialGameState;

  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return initialGameState;

    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.version !== GAME_STATE_VERSION) return initialGameState;

    return {
      ...initialGameState,
      ...parsed,
      resources: recordArrayOrDefault<ResourceState>(parsed.resources, initialGameState.resources),
      orders: recordArrayOrDefault<Order>(parsed.orders, initialGameState.orders),
      operationPlans: recordArrayOrDefault<OperationPlan>(parsed.operationPlans, initialGameState.operationPlans),
      timelineEvents: recordArrayOrDefault<TimelineEvent>(parsed.timelineEvents, initialGameState.timelineEvents),
      letters: recordArrayOrDefault<Letter>(parsed.letters, initialGameState.letters),
      diplomacy: recordArrayOrDefault<DiplomacyRelation>(parsed.diplomacy, initialGameState.diplomacy),
      nations: recordArrayOrDefault<NationProfile>(parsed.nations, initialGameState.nations),
      worldEvents: recordArrayOrDefault<WorldEvent>(parsed.worldEvents, initialGameState.worldEvents),
      chatMessages: normalizeChatMessages(parsed.chatMessages),
      quickActionTurns: objectOrDefault(parsed.quickActionTurns, initialGameState.quickActionTurns),
      selectedCountry: nullableObjectOrDefault(parsed.selectedCountry, initialGameState.selectedCountry),
      turnNumber: numberOrDefault(parsed.turnNumber, initialGameState.turnNumber),
      nextActionId: numberOrDefault(parsed.nextActionId, initialGameState.nextActionId),
      worldTension: numberOrDefault(parsed.worldTension, initialGameState.worldTension),
      lastTurnReport: nullableObjectOrDefault(parsed.lastTurnReport, initialGameState.lastTurnReport),
      profile: normalizeProfile(parsed.profile),
      actionStatus: { kind: 'idle', message: '' },
      lastNotice: null,
    };
  } catch {
    return initialGameState;
  }
}

export function saveGameState(state: GameState) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    const serializableState: GameState = {
      ...state,
      actionStatus: { kind: 'idle', message: '' },
      lastNotice: null,
    };
    storage.setItem(SAVE_KEY, JSON.stringify(serializableState));
  } catch {
    // localStorage can be unavailable in private mode; the game still works in memory.
  }
}

export function clearGameState() {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // localStorage can be unavailable in private mode; the game still works in memory.
  }
}
