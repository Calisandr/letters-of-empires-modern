import { GAME_STATE_VERSION, initialGameState } from './initialState';
import type { GameState } from './types';

const SAVE_KEY = 'letters-of-empires:game:v1';

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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
