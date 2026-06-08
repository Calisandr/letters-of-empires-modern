import { GAME_STATE_VERSION, initialGameState } from './initialState';
import type { GameState } from './types';

const SAVE_KEY = 'letters-of-empires:game:v1';

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function arrayOrDefault<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
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

export function loadGameState(): GameState {
  if (!isStorageAvailable()) return initialGameState;

  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return initialGameState;

    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.version !== GAME_STATE_VERSION) return initialGameState;

    return {
      ...initialGameState,
      ...parsed,
      resources: arrayOrDefault(parsed.resources, initialGameState.resources),
      orders: arrayOrDefault(parsed.orders, initialGameState.orders),
      operationPlans: arrayOrDefault(parsed.operationPlans, initialGameState.operationPlans),
      timelineEvents: arrayOrDefault(parsed.timelineEvents, initialGameState.timelineEvents),
      letters: arrayOrDefault(parsed.letters, initialGameState.letters),
      diplomacy: arrayOrDefault(parsed.diplomacy, initialGameState.diplomacy),
      nations: arrayOrDefault(parsed.nations, initialGameState.nations),
      worldEvents: arrayOrDefault(parsed.worldEvents, initialGameState.worldEvents),
      chatMessages: arrayOrDefault(parsed.chatMessages, initialGameState.chatMessages),
      quickActionTurns: objectOrDefault(parsed.quickActionTurns, initialGameState.quickActionTurns),
      selectedCountry: nullableObjectOrDefault(parsed.selectedCountry, initialGameState.selectedCountry),
      turnNumber: numberOrDefault(parsed.turnNumber, initialGameState.turnNumber),
      nextActionId: numberOrDefault(parsed.nextActionId, initialGameState.nextActionId),
      worldTension: numberOrDefault(parsed.worldTension, initialGameState.worldTension),
      lastTurnReport: nullableObjectOrDefault(parsed.lastTurnReport, initialGameState.lastTurnReport),
      actionStatus: { kind: 'idle', message: '' },
      lastNotice: null,
    };
  } catch {
    return initialGameState;
  }
}

export function saveGameState(state: GameState) {
  if (!isStorageAvailable()) return;

  try {
    const serializableState: GameState = {
      ...state,
      actionStatus: { kind: 'idle', message: '' },
      lastNotice: null,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializableState));
  } catch {
    // localStorage can be unavailable in private mode; the game still works in memory.
  }
}

export function clearGameState() {
  if (!isStorageAvailable()) return;
  window.localStorage.removeItem(SAVE_KEY);
}
