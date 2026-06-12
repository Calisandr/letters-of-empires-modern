import type { ResourceState } from './types';

export function formatClock(value: number) {
  const h = String(Math.floor(value / 3600)).padStart(2, '0');
  const m = String(Math.floor((value % 3600) / 60)).padStart(2, '0');
  const s = String(value % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function formatOrderDue(turns: number) {
  if (turns <= 0) return 'готово';
  if (turns === 1) return '1 день';
  if (turns < 5) return `${turns} дня`;
  return `${turns} дней`;
}

export function formatResourceValue(resource: ResourceState) {
  if (resource.format === 'population') return `${resource.value.toFixed(1)}M`;
  return Math.round(resource.value).toLocaleString('ru-RU');
}

export function formatResourceTrend(resource: ResourceState) {
  const sign = resource.perTurn >= 0 ? '+' : '';
  if (resource.format === 'population') return `${sign}${resource.perTurn.toFixed(1)}%`;
  return `${sign}${Math.round(resource.perTurn).toLocaleString('ru-RU').replace(/\s/g, '')}/ход`;
}
