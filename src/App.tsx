import {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import {
  Anchor,
  Bell,
  ChevronDown,
  CircleHelp,
  Crown,
  Crosshair,
  Eye,
  Flag,
  Handshake,
  Landmark,
  Layers,
  Mail,
  Map as MapIcon,
  Maximize2,
  MessageSquare,
  Package,
  Pickaxe,
  Plus,
  Route,
  Search,
  Send,
  Shield,
  Smile,
  Swords,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import worldMapSvg from './assets/world-map.svg?raw';
import { getLetterResponseOptions, getLetterRuntimeId, oncePerTurnQuickActions } from './game/engine';
import { formatClock, formatResourceTrend, formatResourceValue } from './game/formatters';
import { playerCountry } from './game/initialState';
import { buildMapSignals, filterMapSignalsForMode, type MapModeId, type MapSignal } from './game/mapIntel';
import { gameReducer } from './game/reducer';
import { loadGameState, saveGameState } from './game/storage';
import type {
  ChatMessage,
  CountryIntelActionId,
  DiplomacyRelation,
  Letter,
  NationProfile,
  OperationPlan,
  Order,
  OrderIconKey,
  QuickActionId,
  ResourceDelta,
  ResourceState,
  SelectedCountry,
  TimelineEvent,
  TurnReport,
  WorldEvent,
} from './game/types';

type ToastState = {
  message: string;
};

type MapLayerId = 'borders' | 'labels' | 'capitals' | 'ports' | 'regions' | 'routes' | 'intel';

type MapLayersState = Record<MapLayerId, boolean>;

type CountryAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const initialMapLayers: MapLayersState = {
  borders: true,
  labels: true,
  capitals: true,
  ports: true,
  regions: true,
  routes: true,
  intel: true,
};

const mapLayerOptions: Array<{ id: MapLayerId; label: string; description: string }> = [
  { id: 'borders', label: 'Границы', description: 'Контуры стран и зон влияния' },
  { id: 'labels', label: 'Подписи', description: 'Названия стран и океанов' },
  { id: 'capitals', label: 'Столицы', description: 'Столицы и ключевые центры' },
  { id: 'ports', label: 'Порты', description: 'Морские узлы и гавани' },
  { id: 'regions', label: 'Регионы', description: 'Стратегические области' },
  { id: 'routes', label: 'Маршруты', description: 'Торговые и рискованные пути' },
  { id: 'intel', label: 'Разведка', description: 'Карточка выбранной страны' },
];

const navItems = [
  { label: 'Карта мира', icon: MapIcon },
  { label: 'Письма', icon: Mail, badge: 6 },
  { label: 'Приказы', icon: Flag },
  { label: 'Хроника', icon: MessageSquare },
  { label: 'Договоры', icon: Landmark },
  { label: 'Фракции', icon: Shield },
  { label: 'Настройки', icon: CircleHelp },
];

const mapModes: Array<{ id: MapModeId; title: string; className: string }> = [
  { id: 'political', title: 'Политическая карта', className: '' },
  { id: 'trade', title: 'Торговая карта', className: 'trade-mode' },
  { id: 'strategy', title: 'Стратегическая карта', className: 'strategy-mode' },
];

const statusText: Record<string, string> = {
  russia: 'Ваша держава',
  ally: 'Союзники',
  friendly: 'Дружественные отношения',
  neutral: 'Нейтральный статус',
  risk: 'Риск конфликта',
  hostile: 'Враждебная держава',
  common: 'Неизвестный статус',
};

const countryNames: Record<string, string> = {
  Russia: 'Россия',
  'United States of America': 'США',
  Canada: 'Канада',
  Brazil: 'Бразилия',
  Argentina: 'Аргентина',
  France: 'Франция',
  Germany: 'Германия',
  Italy: 'Италия',
  Spain: 'Испания',
  Ukraine: 'Украина',
  China: 'Китай',
  India: 'Индия',
  Japan: 'Япония',
  Turkey: 'Турция',
  Kazakhstan: 'Казахстан',
  Egypt: 'Египет',
  Australia: 'Австралия',
  'South Africa': 'ЮАР',
  'United Kingdom': 'Великобритания',
  Mexico: 'Мексика',
  Greenland: 'Гренландия',
  Mongolia: 'Монголия',
  Iran: 'Иран',
  Iraq: 'Ирак',
  Afghanistan: 'Афганистан',
  Pakistan: 'Пакистан',
  Indonesia: 'Индонезия',
  Norway: 'Норвегия',
  Sweden: 'Швеция',
  Finland: 'Финляндия',
  Poland: 'Польша',
  Belarus: 'Беларусь',
  Romania: 'Румыния',
  Greece: 'Греция',
  Portugal: 'Португалия',
  Morocco: 'Марокко',
  Algeria: 'Алжир',
  Libya: 'Ливия',
  Sudan: 'Судан',
  Ethiopia: 'Эфиопия',
  Kenya: 'Кения',
  Nigeria: 'Нигерия',
  Peru: 'Перу',
  Chile: 'Чили',
  Colombia: 'Колумбия',
  Venezuela: 'Венесуэла',
  Tanzania: 'Танзания',
  'W. Sahara': 'Западная Сахара',
};

const countryKeyByLocalizedName = Object.fromEntries(
  Object.entries(countryNames).map(([key, name]) => [name, key]),
) as Record<string, string>;

const countryFlagCodes: Record<string, string> = {
  Afghanistan: 'AF',
  Albania: 'AL',
  Algeria: 'DZ',
  Angola: 'AO',
  Argentina: 'AR',
  Armenia: 'AM',
  Australia: 'AU',
  Austria: 'AT',
  Azerbaijan: 'AZ',
  Bahamas: 'BS',
  Bangladesh: 'BD',
  Belarus: 'BY',
  Belgium: 'BE',
  Belize: 'BZ',
  Benin: 'BJ',
  Bhutan: 'BT',
  Bolivia: 'BO',
  'Bosnia and Herz.': 'BA',
  Botswana: 'BW',
  Brazil: 'BR',
  Brunei: 'BN',
  Bulgaria: 'BG',
  'Burkina Faso': 'BF',
  Burundi: 'BI',
  Cambodia: 'KH',
  Cameroon: 'CM',
  Canada: 'CA',
  'Central African Rep.': 'CF',
  Chad: 'TD',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  Congo: 'CG',
  'Costa Rica': 'CR',
  "Côte d'Ivoire": 'CI',
  Croatia: 'HR',
  Cuba: 'CU',
  Cyprus: 'CY',
  Czechia: 'CZ',
  'Dem. Rep. Congo': 'CD',
  Denmark: 'DK',
  Djibouti: 'DJ',
  'Dominican Rep.': 'DO',
  Ecuador: 'EC',
  Egypt: 'EG',
  'El Salvador': 'SV',
  'Eq. Guinea': 'GQ',
  Eritrea: 'ER',
  Estonia: 'EE',
  eSwatini: 'SZ',
  Ethiopia: 'ET',
  'Falkland Is.': 'FK',
  Fiji: 'FJ',
  Finland: 'FI',
  'Fr. S. Antarctic Lands': 'TF',
  France: 'FR',
  Gabon: 'GA',
  Gambia: 'GM',
  Georgia: 'GE',
  Germany: 'DE',
  Ghana: 'GH',
  Greece: 'GR',
  Greenland: 'GL',
  Guatemala: 'GT',
  Guinea: 'GN',
  'Guinea-Bissau': 'GW',
  Guyana: 'GY',
  Haiti: 'HT',
  Honduras: 'HN',
  Hungary: 'HU',
  Iceland: 'IS',
  India: 'IN',
  Indonesia: 'ID',
  Iran: 'IR',
  Iraq: 'IQ',
  Ireland: 'IE',
  Israel: 'IL',
  Italy: 'IT',
  Jamaica: 'JM',
  Japan: 'JP',
  Jordan: 'JO',
  Kazakhstan: 'KZ',
  Kenya: 'KE',
  Kosovo: 'XK',
  Kuwait: 'KW',
  Kyrgyzstan: 'KG',
  Laos: 'LA',
  Latvia: 'LV',
  Lebanon: 'LB',
  Lesotho: 'LS',
  Liberia: 'LR',
  Libya: 'LY',
  Lithuania: 'LT',
  Luxembourg: 'LU',
  Macedonia: 'MK',
  Madagascar: 'MG',
  Malawi: 'MW',
  Malaysia: 'MY',
  Mali: 'ML',
  Mauritania: 'MR',
  Mexico: 'MX',
  Moldova: 'MD',
  Mongolia: 'MN',
  Montenegro: 'ME',
  Morocco: 'MA',
  Mozambique: 'MZ',
  Myanmar: 'MM',
  'N. Cyprus': 'CY',
  Namibia: 'NA',
  Nepal: 'NP',
  Netherlands: 'NL',
  'New Caledonia': 'NC',
  'New Zealand': 'NZ',
  Nicaragua: 'NI',
  Niger: 'NE',
  Nigeria: 'NG',
  'North Korea': 'KP',
  Norway: 'NO',
  Oman: 'OM',
  Pakistan: 'PK',
  Palestine: 'PS',
  Panama: 'PA',
  'Papua New Guinea': 'PG',
  Paraguay: 'PY',
  Peru: 'PE',
  Philippines: 'PH',
  Poland: 'PL',
  Portugal: 'PT',
  'Puerto Rico': 'PR',
  Qatar: 'QA',
  Romania: 'RO',
  Russia: 'RU',
  Rwanda: 'RW',
  'S. Sudan': 'SS',
  'Saudi Arabia': 'SA',
  Senegal: 'SN',
  Serbia: 'RS',
  'Sierra Leone': 'SL',
  Slovakia: 'SK',
  Slovenia: 'SI',
  'Solomon Is.': 'SB',
  Somalia: 'SO',
  Somaliland: 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  'Sri Lanka': 'LK',
  Sudan: 'SD',
  Suriname: 'SR',
  Sweden: 'SE',
  Switzerland: 'CH',
  Syria: 'SY',
  Taiwan: 'TW',
  Tajikistan: 'TJ',
  Tanzania: 'TZ',
  Thailand: 'TH',
  'Timor-Leste': 'TL',
  Togo: 'TG',
  'Trinidad and Tobago': 'TT',
  Tunisia: 'TN',
  Turkey: 'TR',
  Turkmenistan: 'TM',
  Uganda: 'UG',
  Ukraine: 'UA',
  'United Arab Emirates': 'AE',
  'United Kingdom': 'GB',
  'United States of America': 'US',
  Uruguay: 'UY',
  Uzbekistan: 'UZ',
  Vanuatu: 'VU',
  Venezuela: 'VE',
  Vietnam: 'VN',
  'W. Sahara': 'EH',
  Yemen: 'YE',
  Zambia: 'ZM',
  Zimbabwe: 'ZW',
};

const flagClassByCode: Record<string, string> = {
  CN: 'china',
  DE: 'germany',
  FR: 'france',
  IN: 'india',
  JP: 'japan',
  RU: 'russia',
  TR: 'turkey',
  UA: 'ukraine',
};

const codeByFlagClass = Object.fromEntries(
  Object.entries(flagClassByCode).map(([code, className]) => [className, code]),
) as Record<string, string>;

const quickActions: Array<{ id: QuickActionId; label: string; icon: LucideIcon; toast?: string }> = [
  { id: 'compose-letter', label: 'Написать письмо', icon: Mail },
  { id: 'create-order', label: 'Создать приказ', icon: Flag },
  { id: 'manage-lands', label: 'Управление землями', icon: Landmark },
  { id: 'trade-routes', label: 'Торговые маршруты', icon: Anchor },
  { id: 'recruit-army', label: 'Набор войск', icon: Shield },
  { id: 'diplomacy', label: 'Дипломатия', icon: Handshake, toast: 'Дипломатические переговоры' },
];

const countryIntelActions: Array<{ id: CountryIntelActionId; label: string; icon: LucideIcon; tone: string }> = [
  { id: 'send-envoy', label: 'Посол', icon: Handshake, tone: 'diplomacy' },
  { id: 'trade-mission', label: 'Торговля', icon: Anchor, tone: 'trade' },
  { id: 'gather-intel', label: 'Разведка', icon: Search, tone: 'intel' },
  { id: 'prepare-operation', label: 'Операция', icon: Swords, tone: 'military' },
];

const orderIcons: Record<OrderIconKey, LucideIcon> = {
  package: Package,
  swords: Swords,
  pickaxe: Pickaxe,
  anchor: Anchor,
  shield: Shield,
  landmark: Landmark,
  mail: Mail,
};

const miniWorldMapSvg = worldMapSvg
  .replaceAll('capitalGlow', 'miniCapitalGlow')
  .replace('class="world-svg"', 'class="world-svg mini-world-svg"')
  .replaceAll('class="country ', 'class="mini-country ');

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderWorldMapSvg(selectedCountryKey?: string | null) {
  return worldMapSvg.replace(
    /<path class="country([^"]*)" data-name="([^"]+)" data-status="([^"]+)"/g,
    (_match, classNames: string, countryKey: string, status: string) => {
      const selectedClass = selectedCountryKey && countryKey === selectedCountryKey ? ' selected' : '';
      const label = escapeHtmlAttribute(`Выбрать страну: ${countryNames[countryKey] || countryKey}`);

      return `<path class="country${classNames}${selectedClass}" data-name="${countryKey}" data-status="${status}" role="button" tabindex="0" aria-label="${label}"`;
    },
  );
}

const getCountryElement = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  return target.closest('.country') as SVGElement | null;
};

const WorldMapLayer = memo(function WorldMapLayer({
  zoom,
  mapSvgRef,
  selectedCountryKey,
  children,
}: {
  zoom: number;
  mapSvgRef: React.RefObject<HTMLDivElement | null>;
  selectedCountryKey?: string | null;
  children?: ReactNode;
}) {
  const renderedMapSvg = useMemo(() => renderWorldMapSvg(selectedCountryKey), [selectedCountryKey]);

  return (
    <div
      id="mapZoomLayer"
      className="map-zoom-layer"
      style={{ transform: `scale(${zoom.toFixed(2)})` }}
    >
      <div className="world-map-svg-frame" ref={mapSvgRef} dangerouslySetInnerHTML={{ __html: renderedMapSvg }} />
      {children}
    </div>
  );
});

const MiniMap = memo(function MiniMap({ zoom }: { zoom: number }) {
  const viewportSize = `${Math.min(90, Math.max(48, 90 / zoom))}%`;
  const viewportStyle = { '--mini-viewport-size': viewportSize } as CSSProperties;

  return (
    <div className="mini-map" aria-hidden="true">
      <div className="mini-map-frame" dangerouslySetInnerHTML={{ __html: miniWorldMapSvg }} />
      <span className="mini-map-window" style={viewportStyle} />
    </div>
  );
});

function formatMarkerName(name: string) {
  if (name.length <= 12) return name;
  const firstWord = name.split(/\s+/)[0];
  return firstWord.length <= 12 ? firstWord : `${firstWord.slice(0, 11)}…`;
}

function signalIcon(marker: MapSignal['marker']) {
  if (marker === 'capital') return '◆';
  if (marker === 'trade') return '↔';
  if (marker === 'military') return '⚔';
  if (marker === 'threat') return '!';
  if (marker === 'diplomacy') return '◇';
  return '•';
}

function linkPath(from: CountryAnchor, to: CountryAnchor) {
  const dx = to.x - from.x;
  const controlLift = Math.max(22, Math.min(84, Math.abs(dx) * 0.14));
  const c1x = from.x + dx * 0.34;
  const c2x = from.x + dx * 0.66;
  const c1y = Math.min(from.y, to.y) - controlLift;
  const c2y = Math.min(from.y, to.y) - controlLift * 0.72;

  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

function MapLiveOverlay({
  signals,
  anchors,
  mode,
  onSelectCountry,
}: {
  signals: MapSignal[];
  anchors: Record<string, CountryAnchor>;
  mode: MapModeId;
  onSelectCountry: (countryKey: string) => void;
}) {
  const visibleSignals = signals.filter((signal) => anchors[signal.countryKey]).slice(0, 14);
  const origin = anchors.Russia || visibleSignals.map((signal) => anchors[signal.countryKey]).find(Boolean);
  const linkedSignals = origin
    ? visibleSignals
        .filter((signal) => signal.countryKey !== 'Russia' && (signal.activeOrders > 0 || signal.hasEvent || signal.marker === 'trade' || signal.marker === 'military' || signal.marker === 'threat'))
        .slice(0, 8)
    : [];

  return (
    <div className="map-live-overlay" data-mode={mode} aria-label="Стратегическая обстановка на карте">
      <svg className="map-live-link-layer" viewBox="0 0 1000 520" aria-hidden="true" focusable="false">
        {origin ? (
          <g className="map-live-links">
            {linkedSignals.map((signal) => {
              const anchor = anchors[signal.countryKey];

              return (
                <path
                  key={`link-${signal.countryKey}`}
                  className={`map-live-link ${signal.marker} ${signal.tone}`}
                  d={linkPath(origin, anchor)}
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      <div className="map-live-marker-layer">
        {visibleSignals.map((signal, index) => {
          const anchor = anchors[signal.countryKey];
          const markerStyle: CSSProperties = {
            left: `${(anchor.x / 1000) * 100}%`,
            top: `${(anchor.y / 520) * 100}%`,
            zIndex: 40 - index,
          };

          return (
            <button
              key={signal.countryKey}
              type="button"
              className={`map-signal-marker ${signal.marker} ${signal.tone}`}
              style={markerStyle}
              title={`${signal.countryName}: ${signal.summary}`}
              aria-label={`Открыть цель на карте: ${signal.countryName}. ${signal.shortStatus}. ${signal.summary}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectCountry(signal.countryKey);
              }}
            >
              <span className="signal-icon" aria-hidden="true">{signalIcon(signal.marker)}</span>
              <span className="signal-copy">
                <b>{formatMarkerName(signal.countryName)}</b>
                <small>{signal.shortStatus}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const focusLabels: Record<NationProfile['focus'], string> = {
  trade: 'Торговля',
  military: 'Военное давление',
  industry: 'Промышленность',
  diplomacy: 'Дипломатия',
  defense: 'Оборона',
};

const resourceDeltaLabels: Record<keyof ResourceDelta, string> = {
  gold: 'золото',
  wood: 'дерево',
  stone: 'камень',
  iron: 'железо',
  grain: 'зерно',
  population: 'население',
};

function hashCountryName(name: string) {
  return [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);
}

function clampStat(value: number) {
  return Math.max(8, Math.min(96, Math.round(value)));
}

function getCountryFlagView(countryKey?: string, countryName?: string, fallbackFlag?: string) {
  const legacyCode = fallbackFlag ? codeByFlagClass[fallbackFlag] : undefined;
  const fallbackCode = fallbackFlag ? countryFlagCodes[fallbackFlag] : undefined;
  const code = countryFlagCodes[countryKey || ''] || countryFlagCodes[countryName || ''] || fallbackCode || legacyCode;
  if (code) return { className: `flag-svg fi fi-${code.toLowerCase()}`, code };
  if (fallbackFlag && fallbackFlag !== 'neutral') return { className: fallbackFlag, code: '' };

  return { className: 'neutral', code: '' };
}

function CountryFlagMark({
  countryKey,
  countryName,
  fallbackFlag,
}: {
  countryKey?: string;
  countryName?: string;
  fallbackFlag?: string;
}) {
  const flagView = getCountryFlagView(countryKey, countryName, fallbackFlag);

  return (
    <span
      className={`flag ${flagView.className}`}
      title={flagView.code ? `Флаг: ${flagView.code}` : undefined}
      aria-hidden="true"
    />
  );
}

function fallbackRelation(status: string) {
  if (status === 'russia') return 200;
  if (status === 'ally') return 115;
  if (status === 'friendly') return 64;
  if (status === 'neutral') return 0;
  if (status === 'risk') return -34;
  if (status === 'hostile') return -78;
  return -6;
}

function relationVisibility(relation: number, status: string) {
  if (status === 'russia' || relation >= 150) return 'Полные данные';
  if (relation >= 100) return 'Союзная разведка';
  if (relation >= 45) return 'Достоверная оценка';
  if (relation > -25) return 'Неполная оценка';
  if (relation > -65) return 'Пограничные слухи';
  return 'Данные скрыты';
}

function statBand(value: number) {
  if (value >= 76) return 'высоко';
  if (value >= 56) return 'средне';
  if (value >= 36) return 'низко';
  return 'слабо';
}

function visibleStat(value: number, relation: number, status: string, hiddenForEnemy = false) {
  if (status === 'russia' || relation >= 100) return `${value}/100`;
  if (relation >= 45) return `≈${Math.round(value / 5) * 5}/100`;
  if (relation > -25) return statBand(value);
  if (hiddenForEnemy) return 'скрыто';
  return statBand(value);
}

function intentTypeLabel(intent: NonNullable<NationProfile['currentIntent']>['type']) {
  if (intent === 'trade') return 'Торговля';
  if (intent === 'diplomacy') return 'Дипломатия';
  if (intent === 'military') return 'Военное давление';
  if (intent === 'defense') return 'Оборона';
  if (intent === 'industry') return 'Промышленность';
  return 'Скрытая активность';
}

function intentAccessLabel(visibility: NonNullable<NationProfile['currentIntent']>['visibility']) {
  if (visibility === 'open') return 'открыто';
  if (visibility === 'guarded') return 'частично';
  return 'скрыто';
}

function getVisibleIntent(
  intent: NationProfile['currentIntent'],
  relation: number,
  status: string,
) {
  if (!intent) {
    return {
      tone: 'unknown',
      label: 'Намерение',
      title: 'Оценка не готова',
      summary: 'Нужны разведка, дипломатия или следующий ход, чтобы понять ближайший замысел страны.',
      meta: 'нет донесения',
    };
  }

  const exact = status === 'russia' || relation >= 100;
  const reliable = relation >= 45;
  const partial = relation > -25;
  const hidden = intent.visibility === 'hidden' && !exact;

  if (hidden || (!partial && intent.visibility !== 'open')) {
    return {
      tone: 'hidden',
      label: 'Намерение',
      title: 'Замысел скрыт',
      summary: 'Канцелярия видит движение и давление, но цель намерения пока не подтверждена.',
      meta: 'нужна разведка',
    };
  }

  if (!reliable && !exact) {
    return {
      tone: intent.type,
      label: 'Слухи',
      title: intentTypeLabel(intent.type),
      summary: intent.summary,
      meta: `уверенность ≈${Math.round(intent.confidence / 10) * 10}% · доступ ${intentAccessLabel(intent.visibility)}`,
    };
  }

  return {
    tone: intent.type,
    label: intentTypeLabel(intent.type),
    title: intent.title,
    summary: intent.summary,
    meta: `уверенность ${intent.confidence}% · цель: ${intent.target}`,
  };
}

function buildFallbackNation(selected: SelectedCountry): NationProfile {
  const hash = hashCountryName(selected.name);
  const relation = fallbackRelation(selected.status);
  const focusOptions: NationProfile['focus'][] = ['trade', 'military', 'industry', 'diplomacy', 'defense'];
  const focus = focusOptions[hash % focusOptions.length];
  const isSmall = selected.status === 'common';

  return {
    id: selected.key || selected.name,
    name: selected.name,
    flag: 'neutral',
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

function getCountryIntel(
  selectedCountry: SelectedCountry | null,
  nations: NationProfile[],
  diplomacy: DiplomacyRelation[],
  worldEvents: WorldEvent[],
) {
  const selected = selectedCountry || { key: 'Russia', name: playerCountry.name, status: 'russia' };
  const detailedNation = nations.find((nation) => nation.name === selected.name);
  const diplomaticRelation = diplomacy.find((relation) => relation.name === selected.name);
  const baseNation = detailedNation || buildFallbackNation(selected);
  const relation = diplomaticRelation?.score ?? baseNation.relation;
  const flag = diplomaticRelation?.flag || baseNation.flag;
  const relatedEvent = worldEvents.find((event) => event.actor === selected.name);

  return {
    ...baseNation,
    relation,
    flag,
    visibility: relationVisibility(relation, selected.status),
    statusLabel: statusText[selected.status] || statusText.common,
    relatedEvent,
    isDetailed: Boolean(detailedNation),
  };
}

function formatResourceDelta(delta: ResourceDelta) {
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const label = resourceDeltaLabels[key as keyof ResourceDelta] || key;
      const formatted = key === 'population' ? Number(value).toFixed(1) : Math.round(Number(value)).toLocaleString('ru-RU');
      return `${Number(value) > 0 ? '+' : ''}${formatted} ${label}`;
    });

  return parts.length ? parts.join(', ') : 'без прямых изменений';
}

function formatResourceCost(delta: ResourceDelta) {
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const label = resourceDeltaLabels[key as keyof ResourceDelta] || key;
      const formatted = key === 'population' ? Number(value).toFixed(1) : Math.round(Number(value)).toLocaleString('ru-RU');
      return `${formatted} ${label}`;
    });

  return parts.length ? parts.join(', ') : 'без затрат';
}

function planRiskLabel(risk: OperationPlan['riskLevel']) {
  if (risk === 'critical') return 'критический риск';
  if (risk === 'high') return 'высокий риск';
  if (risk === 'medium') return 'средний риск';
  return 'низкий риск';
}

function CountryIntelPanel({
  selectedCountry,
  nations,
  diplomacy,
  worldEvents,
  onClose,
  onCountryAction,
}: {
  selectedCountry: SelectedCountry | null;
  nations: NationProfile[];
  diplomacy: DiplomacyRelation[];
  worldEvents: WorldEvent[];
  onClose: () => void;
  onCountryAction: (id: CountryIntelActionId, country: SelectedCountry) => void;
}) {
  const selected = selectedCountry || { key: 'Russia', name: playerCountry.name, status: 'russia' };
  const intel = getCountryIntel(selectedCountry, nations, diplomacy, worldEvents);
  const relationText = intel.relation > 0 ? `+${intel.relation}` : String(intel.relation);
  const flagView = getCountryFlagView(selected.key || intel.id, intel.name, intel.flag);
  const intentView = getVisibleIntent(intel.currentIntent, intel.relation, selected.status);

  return (
    <aside className="country-intel" aria-label="Разведка выбранной страны">
      <header>
        <span
          className={`flag ${flagView.className}`}
          title={flagView.code ? `Флаг: ${flagView.code}` : undefined}
          aria-hidden="true"
        />
        <div>
          <strong>{intel.name}</strong>
          <small>{intel.statusLabel}</small>
        </div>
        <button
          type="button"
          className="country-intel-close"
          aria-label="Закрыть разведку страны"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <dl>
        <div>
          <dt>Доступ</dt>
          <dd>{intel.visibility}</dd>
        </div>
        <div>
          <dt>Фокус</dt>
          <dd>{focusLabels[intel.focus]}</dd>
        </div>
        <div>
          <dt>Отношения</dt>
          <dd>{relationText}</dd>
        </div>
        <div>
          <dt>Угроза</dt>
          <dd>{visibleStat(intel.threat, intel.relation, selectedCountry?.status || 'russia')}</dd>
        </div>
        <div>
          <dt>Экономика</dt>
          <dd>{visibleStat(intel.economy, intel.relation, selectedCountry?.status || 'russia')}</dd>
        </div>
        <div>
          <dt>Армия</dt>
          <dd>{visibleStat(intel.army, intel.relation, selectedCountry?.status || 'russia', true)}</dd>
        </div>
      </dl>
      <section className={`country-intent ${intentView.tone}`} aria-label={`Намерение страны: ${intel.name}`}>
        <span>{intentView.label}</span>
        <b>{intentView.title}</b>
        <p>{intentView.summary}</p>
        <small>{intentView.meta}</small>
      </section>
      <div className="country-intel-actions" aria-label={`Действия по стране: ${intel.name}`}>
        {countryIntelActions.map((action) => {
          const ActionIcon = action.icon;

          return (
            <button
              key={action.id}
              type="button"
              className={`country-intel-action ${action.tone}`}
              aria-label={`${action.label}: ${intel.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onCountryAction(action.id, selected);
              }}
            >
              <ActionIcon aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
      {intel.relatedEvent || !intel.currentIntent ? (
        <p className="country-intel-activity">{intel.relatedEvent?.text || intel.lastAction}</p>
      ) : null}
      <small>{intel.isDetailed ? 'Досье обновляется каждый ход.' : 'Базовое досье: точность растет через дипломатию и разведку.'}</small>
    </aside>
  );
}

function responseToneLabel(tone: NonNullable<TurnReport['strategicResponses']>[number]['tone']) {
  if (tone === 'danger') return 'Угроза';
  if (tone === 'warning') return 'Осторожно';
  if (tone === 'stability') return 'Стабильность';
  return 'Возможность';
}

function TurnReportDialog({
  report,
  onClose,
  onRunResponse,
}: {
  report: TurnReport;
  onClose: () => void;
  onRunResponse: (id: string) => void;
}) {
  const responses = report.strategicResponses || [];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="turn-report framed-panel" role="dialog" aria-modal="true" aria-labelledby="turnReportTitle">
        <div className="panel-heading">
          <h2 id="turnReportTitle">Отчет хода {report.turn}</h2>
          <button type="button" aria-label="Закрыть отчет хода" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="report-summary">{report.summary}</p>
        <div className="report-grid">
          <section>
            <h3>Приказы</h3>
            {report.completedOrders.length ? (
              report.completedOrders.map((order) => (
                <article key={`${order.title}-${order.target}`} className={order.succeeded ? 'success' : 'danger'}>
                  <b>{order.succeeded ? 'Выполнен' : 'Провален'}</b>
                  <span>{order.title}</span>
                  <small>{order.text}</small>
                </article>
              ))
            ) : (
              <p>Приказы продвинулись, но ничего не завершилось.</p>
            )}
          </section>
          <section>
            <h3>Мир</h3>
            {report.worldEvents.map((event) => (
              <article key={event.id} className={event.tone}>
                <b>{event.actor}</b>
                <span>{event.title}</span>
                <small>{event.text}</small>
              </article>
            ))}
          </section>
          <section>
            <h3>Предупреждения</h3>
            {(report.warnings.length ? report.warnings : ['Критических предупреждений нет.']).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
          <section>
            <h3>Возможности</h3>
            {(report.opportunities.length ? report.opportunities : ['Новых возможностей не обнаружено.']).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
        </div>
        {responses.length ? (
          <section className="strategic-responses" aria-label="Решения штаба по итогам хода">
            <div>
              <h3>Решения штаба</h3>
              <small>Выберите реакцию на текущий ход. Каждое решение сразу меняет состояние партии или создает приказ.</small>
            </div>
            <div className="strategic-response-list">
              {responses.map((response) => (
                <article key={response.id} className={`strategic-response ${response.tone} ${response.used ? 'used' : ''}`}>
                  <span>{responseToneLabel(response.tone)}</span>
                  <b>{response.title}</b>
                  <p>{response.description}</p>
                  <button
                    type="button"
                    onClick={() => onRunResponse(response.id)}
                    disabled={response.used}
                    aria-label={`${response.actionLabel}: ${response.target}`}
                  >
                    {response.used ? 'Принято' : response.actionLabel}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <footer>
          <span>Ресурсы: {formatResourceDelta(report.resourceDelta)}</span>
          <button type="button" className="primary" onClick={onClose}>
            Принять отчет
          </button>
        </footer>
      </section>
    </div>
  );
}

function MapToolbarMenu({
  activeMenu,
  mapLayers,
  activeModeIndex,
  onToggleLayer,
  onSelectMode,
}: {
  activeMenu: 'layers' | 'mode' | null;
  mapLayers: MapLayersState;
  activeModeIndex: number;
  onToggleLayer: (id: MapLayerId) => void;
  onSelectMode: (index: number) => void;
}) {
  if (!activeMenu) return null;

  if (activeMenu === 'mode') {
    return (
      <div className="map-menu map-mode-menu" role="menu" aria-label="Режим карты">
        {mapModes.map((mode, index) => (
          <button
            key={mode.title}
            type="button"
            role="menuitemradio"
            aria-checked={activeModeIndex === index}
            className={activeModeIndex === index ? 'active' : ''}
            onClick={() => onSelectMode(index)}
          >
            <span>{mode.title}</span>
            <small>
              {index === 0
                ? 'Границы, столицы и дипломатический статус.'
                : index === 1
                  ? 'Маршруты, порты и торговые возможности.'
                  : 'Риски, регионы и военное давление.'}
            </small>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="map-menu map-layer-menu" role="menu" aria-label="Слои карты">
      {mapLayerOptions.map((layer) => (
        <button
          key={layer.id}
          type="button"
          role="menuitemcheckbox"
          aria-checked={mapLayers[layer.id]}
          className={mapLayers[layer.id] ? 'active' : ''}
          onClick={() => onToggleLayer(layer.id)}
        >
          <span className="layer-check" aria-hidden="true">
            {mapLayers[layer.id] ? '✓' : ''}
          </span>
          <span>
            <b>{layer.label}</b>
            <small>{layer.description}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function App() {
  const [gameState, dispatchGame] = useReducer(gameReducer, undefined, loadGameState);
  const [activeNav, setActiveNav] = useState('Карта мира');
  const [mapLayers, setMapLayers] = useState<MapLayersState>(initialMapLayers);
  const [activeMapMenu, setActiveMapMenu] = useState<'layers' | 'mode' | null>(null);
  const [mapModeIndex, setMapModeIndex] = useState(0);
  const [countryAnchors, setCountryAnchors] = useState<Record<string, CountryAnchor>>({});
  const [closedIntelKey, setClosedIntelKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [chatInput, setChatInput] = useState('');
  const [activeChatTab, setActiveChatTab] = useState('Мировой чат');
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<string | null>(null);
  const [pendingQuickAction, setPendingQuickAction] = useState<QuickActionId | null>(null);
  const [turnReportOpen, setTurnReportOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(18 * 3600 + 42 * 60 + 31);
  const [toast, setToast] = useState<ToastState | null>(null);
  const {
    resources,
    orders,
    operationPlans,
    timelineEvents,
    letters,
    diplomacy,
    nations,
    worldEvents,
    worldTension,
    lastTurnReport,
    chatMessages,
    quickActionTurns,
    turnNumber,
  } = gameState;

  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapSvgRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const selectedCountryRef = useRef<SVGElement | null>(null);
  const activeTooltipCountryRef = useRef<string | null>(null);
  const tooltipFrameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastToastRef = useRef<{ message: string; time: number } | null>(null);
  const latestTooltipRef = useRef<{
    country: SVGElement;
    clientX: number;
    clientY: number;
  } | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const turnLockRef = useRef(false);
  const seenTurnReportRef = useRef(lastTurnReport?.turn ?? null);

  const showToast = useCallback((message: string) => {
    const now = window.performance.now();
    const lastToast = lastToastRef.current;
    const isDuplicateToast = lastToast?.message === message && now - lastToast.time < 900;

    lastToastRef.current = { message, time: now };

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    if (!isDuplicateToast) {
      setToast({ message });
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1700);
  }, []);

  const appClassName = useMemo(() => {
    return ['app-shell', mapModes[mapModeIndex].className].filter(Boolean).join(' ');
  }, [mapModeIndex]);

  const mapLayerAttributes = useMemo(() => {
    return Object.fromEntries(
      Object.entries(mapLayers).map(([key, value]) => [`data-layer-${key}`, value ? 'on' : 'off']),
    ) as Record<`data-layer-${MapLayerId}`, string>;
  }, [mapLayers]);

  const activeMapMode = mapModes[mapModeIndex];
  const mapSignals = useMemo(() => buildMapSignals(gameState, countryKeyByLocalizedName), [gameState]);
  const visibleMapSignals = useMemo(
    () => filterMapSignalsForMode(mapSignals, activeMapMode.id),
    [activeMapMode.id, mapSignals],
  );
  const mapSignalByKey = useMemo(() => {
    return new Map(mapSignals.map((signal) => [signal.countryKey, signal]));
  }, [mapSignals]);

  const activeIntelKey = gameState.selectedCountry?.key || 'Russia';

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  useEffect(() => {
    if (gameState.lastNotice) showToast(gameState.lastNotice.message);
  }, [gameState.lastNotice, showToast]);

  useEffect(() => {
    if (!lastTurnReport || lastTurnReport.turn === seenTurnReportRef.current) return;
    seenTurnReportRef.current = lastTurnReport.turn;
    setTurnReportOpen(true);
  }, [lastTurnReport]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipFrameRef.current !== null) {
        window.cancelAnimationFrame(tooltipFrameRef.current);
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const messages = chatMessagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [chatMessages]);

  const handleNavClick = (label: string) => {
    setActiveNav(label);
    setActiveUtilityPanel(label);
    showToast(`Раздел "${label}" открыт`);
  };

  const openUtilityPanel = (label: string) => {
    setActiveUtilityPanel(label);
    showToast(`${label}: панель открыта`);
  };

  const handleMapModeClick = () => {
    setActiveMapMenu((current) => (current === 'mode' ? null : 'mode'));
  };

  const selectMapMode = (index: number) => {
    setMapModeIndex(index);
    setActiveMapMenu(null);
    showToast(`Включен режим: ${mapModes[index].title}`);
  };

  const toggleMapLayer = (id: MapLayerId) => {
    if (id === 'intel') setClosedIntelKey(null);

    setMapLayers((current) => {
      const next = { ...current, [id]: !current[id] };
      showToast(`${mapLayerOptions.find((item) => item.id === id)?.label}: ${next[id] ? 'показано' : 'скрыто'}`);
      return next;
    });
  };

  const hideMapTooltip = () => {
    latestTooltipRef.current = null;
    activeTooltipCountryRef.current = null;

    if (tooltipFrameRef.current !== null) {
      window.cancelAnimationFrame(tooltipFrameRef.current);
      tooltipFrameRef.current = null;
    }

    tooltipRef.current?.classList.remove('visible');
  };

  const renderMapTooltip = () => {
    tooltipFrameRef.current = null;

    const latest = latestTooltipRef.current;
    const tooltipNode = tooltipRef.current;
    const mapCanvas = mapCanvasRef.current;

    if (!latest || !tooltipNode || !mapCanvas) return;

    const { country, clientX, clientY } = latest;
    const sourceName = country.dataset.name || '';
    const status = country.dataset.status || 'common';
    const signal = mapSignalByKey.get(sourceName);
    const tooltipKey = `${sourceName}:${signal?.shortStatus || status}:${signal?.severity || 0}`;

    if (activeTooltipCountryRef.current !== tooltipKey) {
      const title = tooltipNode.querySelector('strong');
      const subtitle = tooltipNode.querySelector('small');

      if (title) title.textContent = countryNames[sourceName] || sourceName;
      if (subtitle) subtitle.textContent = signal
        ? `${statusText[status] || statusText.common} · ${signal.shortStatus}`
        : statusText[status] || statusText.common;

      activeTooltipCountryRef.current = tooltipKey;
    }

    const rect = mapCanvas.getBoundingClientRect();
    const tooltipWidth = tooltipNode.offsetWidth || 160;
    const tooltipHeight = tooltipNode.offsetHeight || 52;
    const margin = 8;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let left = x - tooltipWidth / 2;
    let top = y - tooltipHeight - 14;

    if (top < margin) top = y + 16;

    left = Math.max(margin, Math.min(left, rect.width - tooltipWidth - margin));
    top = Math.max(margin, Math.min(top, rect.height - tooltipHeight - margin));

    tooltipNode.style.left = `${left}px`;
    tooltipNode.style.top = `${top}px`;
    tooltipNode.classList.add('visible');
  };

  const handleMapPointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const country = getCountryElement(event.target);

    if (!country) {
      hideMapTooltip();
      return;
    }

    latestTooltipRef.current = {
      country,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    if (tooltipFrameRef.current === null) {
      tooltipFrameRef.current = window.requestAnimationFrame(renderMapTooltip);
    }
  };

  const applySelectedCountryClass = useCallback((countryKey: string) => {
    const mapRoot = mapSvgRef.current;
    if (!mapRoot) return null;

    let selectedCountry: SVGElement | null = null;

    [...mapRoot.querySelectorAll<SVGElement>('.country')].forEach((country) => {
      const isSelected = Boolean(countryKey) && country.dataset.name === countryKey;
      country.classList.toggle('selected', isSelected);
      if (isSelected) selectedCountry = country;
    });

    selectedCountryRef.current = selectedCountry;
    return selectedCountry;
  }, []);

  const selectCountry = useCallback((country: SVGElement) => {
    const sourceName = country.dataset.name || '';
    const name = countryNames[sourceName] || sourceName;
    const status = country.dataset.status || 'common';

    applySelectedCountryClass(sourceName);
    setClosedIntelKey(null);
    setActiveMapMenu(null);

    dispatchGame({
      type: 'SELECT_COUNTRY',
      country: {
        key: sourceName,
        name,
        status,
      },
    });

    window.requestAnimationFrame(() => applySelectedCountryClass(sourceName));
  }, [applySelectedCountryClass]);

  const closeCountryIntel = useCallback(() => {
    applySelectedCountryClass('');
    setClosedIntelKey(null);
    dispatchGame({ type: 'CLEAR_SELECTED_COUNTRY' });
  }, [applySelectedCountryClass]);

  useEffect(() => {
    const mapRoot = mapSvgRef.current;
    if (!mapRoot) return;

    const handleCountryKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const country = getCountryElement(event.target);
      if (!country) return;

      event.preventDefault();
      selectCountry(country);
    };

    const countries = [...mapRoot.querySelectorAll<SVGElement>('.country')];
    const nextAnchors = countries.reduce<Record<string, CountryAnchor>>((anchors, country) => {
      const sourceName = country.dataset.name || '';
      const graphicsCountry = country as SVGGraphicsElement;
      if (!sourceName || typeof graphicsCountry.getBBox !== 'function') return anchors;

      const box = graphicsCountry.getBBox();
      anchors[sourceName] = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        width: box.width,
        height: box.height,
      };
      return anchors;
    }, {});

    setCountryAnchors(nextAnchors);

    countries.forEach((country) => {
      const sourceName = country.dataset.name || '';
      const name = countryNames[sourceName] || sourceName;
      country.setAttribute('role', 'button');
      country.setAttribute('tabindex', '0');
      country.setAttribute('aria-label', `Выбрать страну: ${name}`);
      country.addEventListener('keydown', handleCountryKeyDown);
    });

    return () => {
      countries.forEach((country) => {
        country.removeEventListener('keydown', handleCountryKeyDown);
      });
    };
  }, [gameState.selectedCountry?.key, selectCountry, zoom]);

  useEffect(() => {
    const mapRoot = mapSvgRef.current;
    if (!mapRoot) return;

    applySelectedCountryClass(gameState.selectedCountry?.key || '');
  }, [applySelectedCountryClass, gameState.selectedCountry?.key, countryAnchors]);

  useEffect(() => {
    const mapRoot = mapSvgRef.current;
    if (!mapRoot) return;

    const liveClasses = [
      'live-signal',
      'live-capital',
      'live-diplomacy',
      'live-trade',
      'live-military',
      'live-threat',
      'live-event',
      'live-ally',
      'live-friendly',
      'live-risk',
      'live-hostile',
    ];
    const visibleSignalKeys = new Set(visibleMapSignals.map((signal) => signal.countryKey));
    const countries = [...mapRoot.querySelectorAll<SVGElement>('.country')];

    countries.forEach((country) => {
      const sourceName = country.dataset.name || '';
      const signal = mapSignalByKey.get(sourceName);
      country.classList.remove(...liveClasses);
      delete country.dataset.liveTone;
      delete country.dataset.liveMarker;
      delete country.dataset.liveSeverity;

      if (!signal || !visibleSignalKeys.has(sourceName)) return;

      country.classList.add('live-signal', `live-${signal.marker}`);
      if (signal.tone === 'ally' || signal.tone === 'friendly' || signal.tone === 'risk' || signal.tone === 'hostile') {
        country.classList.add(`live-${signal.tone}`);
      }
      country.dataset.liveTone = signal.tone;
      country.dataset.liveMarker = signal.marker;
      country.dataset.liveSeverity = String(signal.severity);
    });
  }, [mapSignalByKey, visibleMapSignals, mapModeIndex]);

  const selectCountryByKey = useCallback((countryKey: string) => {
    const mapRoot = mapSvgRef.current;
    if (!mapRoot) return;

    const country = [...mapRoot.querySelectorAll<SVGElement>('.country')].find(
      (item) => item.dataset.name === countryKey,
    );
    if (country) selectCountry(country);
  }, [selectCountry]);

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const country = getCountryElement(event.target);
    if (!country) return;

    selectCountry(country);
  };

  const handleMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const country = getCountryElement(event.target);
    if (!country) return;

    event.preventDefault();
    selectCountry(country);
  };

  const handleMapLeave = () => {
    hideMapTooltip();
  };

  const centerMap = () => {
    setZoom(1);
    showToast('Карта центрирована');
  };

  const toggleFullscreen = async () => {
    const mapSection = mapSectionRef.current;
    if (!document.fullscreenElement && mapSection?.requestFullscreen) {
      await mapSection.requestFullscreen().catch(() => null);
      return;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen().catch(() => null);
    }
  };

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) {
      showToast('Введите сообщение совету');
      return;
    }

    const time = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    dispatchGame({ type: 'SUBMIT_COUNCIL_MESSAGE', text, time });
    setChatInput('');
  };

  const runQuickAction = (id: QuickActionId) => {
    dispatchGame({ type: 'RUN_QUICK_ACTION', id });
  };

  const handleQuickAction = (id: QuickActionId) => {
    if (id === 'create-order') {
      setPendingQuickAction(id);
      return;
    }

    runQuickAction(id);
  };

  const handleCountryIntelAction = (id: CountryIntelActionId, country: SelectedCountry) => {
    dispatchGame({ type: 'RUN_COUNTRY_INTEL_ACTION', id, country });
  };

  const handleStrategicResponse = (id: string) => {
    dispatchGame({ type: 'RUN_STRATEGIC_RESPONSE', id });
  };

  const confirmPendingQuickAction = () => {
    if (!pendingQuickAction) return;
    runQuickAction(pendingQuickAction);
    setPendingQuickAction(null);
  };

  const cancelOrder = (id: string) => {
    dispatchGame({ type: 'CANCEL_ORDER', id });
  };

  const runOperationPlan = (id: string) => {
    dispatchGame({ type: 'RUN_OPERATION_PLAN', id });
  };

  const dismissOperationPlan = (id: string) => {
    dispatchGame({ type: 'DISMISS_OPERATION_PLAN', id });
  };

  const handleEndTurn = () => {
    if (turnLockRef.current) return;
    turnLockRef.current = true;
    dispatchGame({ type: 'END_TURN' });
    setSecondsLeft(18 * 3600 + 42 * 60 + 31);

    window.setTimeout(() => {
      turnLockRef.current = false;
    }, 420);
  };

  return (
    <>
      <div className={appClassName} data-routes={mapLayers.routes ? 'on' : 'off'}>
        <Topbar
          activeNav={activeNav}
          mailCount={letters.length}
          onNavClick={handleNavClick}
          onUtilityAction={openUtilityPanel}
        />

        {activeUtilityPanel ? (
          <UtilityPanel
            title={activeUtilityPanel}
            mailCount={letters.length}
            orderCount={orders.filter((order) => order.statusClass !== 'cancelled').length}
            selectedCountryName={gameState.selectedCountry?.name || 'Россия'}
            onClose={() => setActiveUtilityPanel(null)}
          />
        ) : null}

        <EmpirePanel
          clock={formatClock(secondsLeft)}
          resources={resources}
          nations={nations}
          worldTension={worldTension}
          quickActionTurns={quickActionTurns}
          turnNumber={turnNumber}
          onEndTurn={handleEndTurn}
          onQuickAction={handleQuickAction}
        />

        <main className="main-area">
          <motion.section
            ref={mapSectionRef}
            className="map-section framed-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="map-toolbar">
              <button
                className="tool-select"
                type="button"
                aria-haspopup="menu"
                aria-expanded={activeMapMenu === 'layers'}
                onClick={() => setActiveMapMenu((current) => (current === 'layers' ? null : 'layers'))}
              >
                <Layers aria-hidden="true" />
                Слой карты
              </button>
              <button
                id="mapMode"
                className="tool-select wide"
                type="button"
                aria-haspopup="menu"
                aria-expanded={activeMapMenu === 'mode'}
                onClick={handleMapModeClick}
              >
                {mapModes[mapModeIndex].title}
                <ChevronDown aria-hidden="true" />
              </button>
              <label className="route-toggle">
                <input
                  id="routeToggle"
                  type="checkbox"
                  checked={mapLayers.routes}
                  onChange={() => toggleMapLayer('routes')}
                />
                <span>Показать маршруты</span>
              </label>
              <MapToolbarMenu
                activeMenu={activeMapMenu}
                mapLayers={mapLayers}
                activeModeIndex={mapModeIndex}
                onToggleLayer={toggleMapLayer}
                onSelectMode={selectMapMode}
              />
            </div>

            <div
              className="map-canvas"
              ref={mapCanvasRef}
              onMouseMove={handleMapPointerMove}
              onMouseLeave={handleMapLeave}
              onClick={handleMapClick}
              onKeyDown={handleMapKeyDown}
              {...mapLayerAttributes}
            >
              <div className="ocean-glow" aria-hidden="true" />
              <WorldMapLayer zoom={zoom} mapSvgRef={mapSvgRef} selectedCountryKey={gameState.selectedCountry?.key}>
                <MapLiveOverlay
                  signals={visibleMapSignals}
                  anchors={countryAnchors}
                  mode={activeMapMode.id}
                  onSelectCountry={selectCountryByKey}
                />
              </WorldMapLayer>
              {mapLayers.intel && gameState.selectedCountry && closedIntelKey !== activeIntelKey ? (
                <CountryIntelPanel
                  selectedCountry={gameState.selectedCountry}
                  nations={nations}
                  diplomacy={diplomacy}
                  worldEvents={worldEvents}
                  onClose={closeCountryIntel}
                  onCountryAction={handleCountryIntelAction}
                />
              ) : null}
              <div className="map-title-label">Северный Ледовитый океан</div>
              <div className="map-controls" aria-label="Управление картой">
                <button id="centerMap" type="button" aria-label="Центрировать" onClick={centerMap}>
                  <Crosshair aria-hidden="true" />
                </button>
                <button
                  id="zoomIn"
                  type="button"
                  aria-label="Увеличить"
                  onClick={() => setZoom((current) => Math.min(1.7, current + 0.12))}
                >
                  <ZoomIn aria-hidden="true" />
                </button>
                <button
                  id="zoomOut"
                  type="button"
                  aria-label="Уменьшить"
                  onClick={() => setZoom((current) => Math.max(0.78, current - 0.12))}
                >
                  <ZoomOut aria-hidden="true" />
                </button>
                <button id="fitMap" type="button" aria-label="Во весь экран" onClick={toggleFullscreen}>
                  <Maximize2 aria-hidden="true" />
                </button>
              </div>
              <div className="compass" aria-hidden="true">
                <span>N</span>
                <i />
              </div>
              <MiniMap zoom={zoom} />
              <MapLegend />
              <div
                ref={tooltipRef}
                id="mapTooltip"
                className="tooltip"
                role="status"
              >
                <strong />
                <small />
              </div>
            </div>
          </motion.section>

          <section className="bottom-dock">
            <ChatPanel
              messages={chatMessages}
              input={chatInput}
              activeTab={activeChatTab}
              onInputChange={setChatInput}
              onTabChange={(tab) => {
                setActiveChatTab(tab);
                showToast(`Канал "${tab}" открыт`);
              }}
              onSubmit={submitChat}
              messagesRef={chatMessagesRef}
            />
            <OrdersPanel
              orders={orders}
              operationPlans={operationPlans}
              currentTurn={turnNumber}
              onCancel={cancelOrder}
              onCreateOrder={() => handleQuickAction('create-order')}
              onRunPlan={runOperationPlan}
              onDismissPlan={dismissOperationPlan}
            />
          </section>
        </main>

        <RightPanel
          timeline={timelineEvents}
          letters={letters}
          diplomacy={diplomacy}
          nations={nations}
          worldEvents={worldEvents}
          onComposeLetter={() => handleQuickAction('compose-letter')}
          onRespondLetter={(letterId, responseId) => dispatchGame({ type: 'RESPOND_TO_LETTER', letterId, responseId })}
          showToast={showToast}
        />
      </div>

      {pendingQuickAction ? (
        <PendingActionDialog
          selectedCountryName={gameState.selectedCountry?.name || 'Москва'}
          onCancel={() => setPendingQuickAction(null)}
          onConfirm={confirmPendingQuickAction}
        />
      ) : null}

      {turnReportOpen && lastTurnReport ? (
        <TurnReportDialog
          report={lastTurnReport}
          onClose={() => setTurnReportOpen(false)}
          onRunResponse={handleStrategicResponse}
        />
      ) : null}

      <div
        className={`toast ${toast ? 'visible' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {toast?.message}
      </div>
    </>
  );
}

function Topbar({
  activeNav,
  mailCount,
  onNavClick,
  onUtilityAction,
}: {
  activeNav: string;
  mailCount: number;
  onNavClick: (label: string) => void;
  onUtilityAction: (label: string) => void;
}) {
  const topActions = [
    { label: 'Поиск', icon: Search },
    { label: 'Корона', icon: Crown, className: 'crown' },
    { label: 'Почта', icon: Mail, badge: mailCount },
    { label: 'Уведомления', icon: Bell },
    { label: 'Помощь', icon: CircleHelp },
  ];

  return (
    <motion.header
      className="topbar"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <a className="brand" href="#" aria-label="Письма Империй" onClick={(event) => event.preventDefault()}>
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 56 56">
            <path d="M28 4l20 8v14c0 13-8 22-20 27C16 48 8 39 8 26V12l20-8z" />
            <path d="M28 12v31M18 20l10-6 10 6M18 32h20" />
          </svg>
        </span>
        <span className="brand-text">Письма Империй</span>
      </a>

      <nav className="primary-nav" aria-label="Главные разделы">
        {navItems.map(({ label, badge, icon: Icon }) => {
          const badgeValue = label === 'Письма' ? mailCount : badge;

          return (
            <button
              key={label}
              className={`nav-link ${activeNav === label ? 'active' : ''}`}
              type="button"
              aria-current={activeNav === label ? 'page' : undefined}
              onClick={() => onNavClick(label)}
            >
              <Icon aria-hidden="true" size={14} />
              {label}
              {badgeValue ? <span className="pill">{badgeValue}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="top-actions" aria-label="Быстрые действия">
        {topActions.map(({ label, icon: Icon, badge, className }) => (
          <button
            key={label}
            className={`icon-button ${className || ''} ${badge ? 'has-badge' : ''}`}
            type="button"
            aria-label={label}
            onClick={() => onUtilityAction(label)}
          >
            <Icon aria-hidden="true" />
            {badge ? <b>{badge}</b> : null}
          </button>
        ))}
        <button className="profile-chip" type="button" aria-label="Профиль правителя" onClick={() => onUtilityAction('Профиль правителя')}>
          <span className="avatar-slot profile-avatar" aria-hidden="true" />
          <span className="profile-text">
            <strong>Родерик Правитель</strong>
            <small>Россия</small>
          </span>
          <ChevronDown className="chevron" aria-hidden="true" size={18} />
        </button>
      </div>
    </motion.header>
  );
}

function UtilityPanel({
  title,
  mailCount,
  orderCount,
  selectedCountryName,
  onClose,
}: {
  title: string;
  mailCount: number;
  orderCount: number;
  selectedCountryName: string;
  onClose: () => void;
}) {
  const panelCopy: Record<string, { text: string; action: string }> = {
    Поиск: {
      text: `Поиск будет работать по странам, письмам и приказам. Сейчас выбрана цель: ${selectedCountryName}.`,
      action: 'Введите запрос в чат совета, если хотите сразу создать приказ по найденной цели.',
    },
    Корона: {
      text: 'Корона показывает власть правителя, текущую державу и состояние партии.',
      action: `Активных приказов: ${orderCount}/5. Входящих писем: ${mailCount}.`,
    },
    Почта: {
      text: `Во входящих сейчас ${mailCount} писем. Каждое важное письмо можно открыть и выбрать дипломатический ответ с последствиями.`,
      action: 'Кнопка "Написать" справа отправляет исходящее письмо через канцелярию.',
    },
    Уведомления: {
      text: 'Здесь собираются важные игровые изменения: завершение хода, результаты приказов, дипломатические ответы.',
      action: 'Последние события уже отражаются в хронике мира справа.',
    },
    Помощь: {
      text: 'Совет понимает обычные сообщения и игровые команды: построить, развить, отправить, укрепить, начать переговоры.',
      action: 'Невозможные приказы отклоняются советом, чтобы партия не ломалась нелепыми решениями.',
    },
    'Профиль правителя': {
      text: `Правитель России управляет партией через приказы, письма, дипломатию и выбранную цель на карте: ${selectedCountryName}.`,
      action: 'Состояние партии сохраняется автоматически после игровых действий.',
    },
    Настройки: {
      text: 'Автосохранение партии включено. Карта, ходы, приказы, письма и ресурсы сохраняются на этом устройстве.',
      action: 'Расширенные настройки графики и малый экран будут добавлены отдельным разделом.',
    },
    'Карта мира': {
      text: `Карта выбирает цель для приказов и дипломатии. Текущая цель: ${selectedCountryName}.`,
      action: 'Страны можно выбирать мышью или клавиатурой через Enter.',
    },
    Письма: {
      text: `Канцелярия справа ведет входящую переписку. Входящих сейчас: ${mailCount}.`,
      action: 'Откройте письмо справа, чтобы принять сделку, запросить условия или отказать с реальными последствиями.',
    },
    Приказы: {
      text: `Активных приказов: ${orderCount}/5. Создание приказа открывает подтверждение и проверку казны.`,
      action: 'Сроки приказов двигаются при завершении хода.',
    },
    Хроника: {
      text: 'Хроника показывает важные игровые последствия: письма, приказы, управление землями и начало нового хода.',
      action: 'Повторяющиеся события не спамят верх списка.',
    },
    Договоры: {
      text: 'Договоры будут расти из дипломатических действий и отношений стран.',
      action: 'Сейчас дипломатия уже меняет отношения и может создавать письма-ответы.',
    },
    Фракции: {
      text: 'Фракции опираются на список стран, флаги и дипломатический статус справа.',
      action: 'Дальше здесь появятся цели, интересы и поведение каждой державы.',
    },
  };
  const content = panelCopy[title] || {
    text: 'Этот раздел подключен к интерфейсу и готов к расширению.',
    action: 'Следующий шаг: заменить справочный слой полноценным экраном.',
  };

  return (
    <section className="utility-panel framed-panel" aria-live="polite">
      <div>
        <strong>{title}</strong>
        <p>{content.text}</p>
        <small>{content.action}</small>
      </div>
      <button type="button" aria-label={`Закрыть панель: ${title}`} onClick={onClose}>
        <X aria-hidden="true" />
      </button>
    </section>
  );
}

function EmpirePanel({
  clock,
  resources,
  nations,
  worldTension,
  quickActionTurns,
  turnNumber,
  onEndTurn,
  onQuickAction,
}: {
  clock: string;
  resources: ResourceState[];
  nations: NationProfile[];
  worldTension: number;
  quickActionTurns: Partial<Record<QuickActionId, number>>;
  turnNumber: number;
  onEndTurn: () => void;
  onQuickAction: (id: QuickActionId) => void;
}) {
  const russia = nations.find((nation) => nation.id === 'russia');

  return (
    <motion.aside
      className="side-panel left-panel"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <section className="empire-card framed-panel">
        <h1>{playerCountry.name}</h1>
        <div className="state-flag" aria-label={`Флаг страны: ${playerCountry.name}`}>
          <span className={`flag ${playerCountry.flag}`} />
        </div>
        <div className="ruler-block">
          <span className="avatar-slot ruler-avatar" aria-hidden="true" />
          <div>
            <strong>Родерик</strong>
            <small>Правитель</small>
          </div>
        </div>
        <div className="meta-line">
          <span>Столица:</span>
          <b>✦ Москва</b>
        </div>
        <div className="section-title">Экономика</div>
        <ul className="resource-list">
          {resources.map((resource) => (
            <li key={resource.label}>
              <span>{resource.label}</span>
              <b>{formatResourceValue(resource)}</b>
              <em>{formatResourceTrend(resource)}</em>
            </li>
          ))}
        </ul>
        <div className="section-title">Пульс державы</div>
        <div className="empire-pulse">
          <div>
            <span>Стабильность</span>
            <b>{russia?.stability ?? 72}/100</b>
          </div>
          <div>
            <span>Армия</span>
            <b>{russia?.army ?? 78}/100</b>
          </div>
          <div>
            <span>Напряжение мира</span>
            <b className={worldTension >= 70 ? 'danger' : worldTension >= 50 ? 'warn' : ''}>{worldTension}/100</b>
          </div>
          <p>{russia?.lastAction || 'Совет ожидает распоряжений правителя.'}</p>
        </div>
        <div className="turn-info">
          <div>
            <small>Текущий ход</small>
            <strong>{turnNumber}</strong>
          </div>
          <div>
            <small>До конца хода</small>
            <strong id="turnClock">{clock}</strong>
          </div>
          <button className="end-turn-button" type="button" onClick={onEndTurn}>
            Завершить ход
          </button>
        </div>
        <div className="section-title">Быстрые действия</div>
        <div className="quick-actions">
          {quickActions.map(({ id, label, icon: Icon, toast }) => {
            const isLocked = oncePerTurnQuickActions.has(id) && quickActionTurns[id] === turnNumber;

            return (
              <button
                key={label}
                type="button"
                title={isLocked ? 'Действие уже выполнено в этом ходу' : toast || label}
                onClick={() => onQuickAction(id)}
                disabled={isLocked}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </section>
      <footer className="server-line">
        <span>Сервер: Европа 1</span>
        <i />
        <span>Онлайн: 1 248</span>
      </footer>
    </motion.aside>
  );
}

function MapLegend() {
  return (
    <div className="map-legend">
      <span>
        <i className="line country-border" />
        Границы стран
      </span>
      <span>
        <i className="dot capital" />
        Столицы
      </span>
      <span>
        <i className="dot city" />
        Крупные города
      </span>
      <span>
        <i className="anchor">⚓</i>
        Порты
      </span>
      <span>
        <i className="dot region" />
        Регионы
      </span>
      <span>
        <i className="route-sample" />
        Маршруты
      </span>
    </div>
  );
}

function ChatPanel({
  messages,
  input,
  activeTab,
  onInputChange,
  onTabChange,
  onSubmit,
  messagesRef,
}: {
  messages: ChatMessage[];
  input: string;
  activeTab: string;
  onInputChange: (value: string) => void;
  onTabChange: (tab: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  messagesRef: React.RefObject<HTMLDivElement | null>;
}) {
  const tabs = ['Мировой чат', 'Мировой', 'Альянс', 'Фракция', 'Личные'];

  return (
    <motion.section
      className="chat-panel framed-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="chat-tabs" role="tablist" aria-label="Каналы чата">
        <b>Чат империй</b>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div id="chatMessages" className="chat-messages" ref={messagesRef}>
        {messages.map((message) => (
          <p key={message.id}>
            <time>{message.time}</time>
            <span className={`flag ${message.flag}`} />
            <b>{message.faction}:</b>
            <span className="chat-text">{message.text}</span>
          </p>
        ))}
      </div>
      <form id="chatForm" className="chat-input" onSubmit={onSubmit}>
        <input
          id="chatInput"
          type="text"
          aria-label="Сообщение совету"
          placeholder="Введите сообщение..."
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
        />
        <button className="emoji" type="button" aria-label="Добавить эмодзи" onClick={() => onInputChange(`${input} ☺`.trimStart())}>
          <Smile aria-hidden="true" />
        </button>
        <button className="send" type="submit" aria-label="Отправить">
          <Send aria-hidden="true" />
        </button>
      </form>
    </motion.section>
  );
}

function OrdersPanel({
  orders,
  operationPlans,
  currentTurn,
  onCancel,
  onCreateOrder,
  onRunPlan,
  onDismissPlan,
}: {
  orders: Order[];
  operationPlans: OperationPlan[];
  currentTurn: number;
  onCancel: (id: string) => void;
  onCreateOrder: () => void;
  onRunPlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
}) {
  const activeOrderCount = orders.filter((order) => order.statusClass !== 'cancelled').length;
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  return (
    <motion.section
      className="orders-panel framed-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-heading">
        <h2>
          Текущие приказы <span>({activeOrderCount}/5)</span>
        </h2>
      </div>
      {operationPlans.length ? (
        <section className="operation-plans" aria-label="Оперативные планы">
          <header>
            <b>Оперативные планы</b>
            <small>{operationPlans.length}/4 подготовлено</small>
          </header>
          <div className="operation-plan-list">
            {operationPlans.map((plan) => {
              const Icon = orderIcons[plan.iconKey];
              const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);

              return (
                <article key={plan.id} className={`operation-plan ${plan.riskLevel}`}>
                  <span className="operation-plan-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{plan.title}</h3>
                    <p>{plan.summary}</p>
                    <small>
                      {plan.advisor} · шанс {plan.successChance}% · {planRiskLabel(plan.riskLevel)} · окно {expiresIn} ход.
                    </small>
                    <em>Стоимость: {formatResourceCost(plan.cost)}</em>
                  </div>
                  <button
                    type="button"
                    className="plan-run"
                    aria-label={`Запустить план: ${plan.title}`}
                    onClick={() => onRunPlan(plan.id)}
                  >
                    Запустить
                  </button>
                  <button
                    type="button"
                    className="plan-dismiss"
                    aria-label={`Снять план: ${plan.title}`}
                    onClick={() => onDismissPlan(plan.id)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      <div className="orders-list">
        {orders.map((order) => {
          const Icon = orderIcons[order.iconKey];
          const isCancelled = order.statusClass === 'cancelled';
          const isExpanded = expandedOrderId === order.id;
          const chance = typeof order.successChance === 'number' ? Math.round(order.successChance) : null;
          const counterMove = order.lastCounterMove;
          const counterPressure = order.counterPressure || 0;
          const hasCounterInfo = Boolean(counterMove || chance !== null || counterPressure > 0);

          return (
            <article
              key={order.id}
              className={`order-card${isExpanded ? ' expanded' : ''}`}
              style={isCancelled ? { opacity: 0.38, filter: 'grayscale(.55)' } : undefined}
            >
              <span className="order-icon">
                <Icon aria-hidden="true" />
              </span>
              <div className="order-main">
                <h3>{order.title}</h3>
                <p>Исполнитель: {order.owner}</p>
              </div>
              <dl>
                <dt>Цель</dt>
                <dd>{order.target}</dd>
                <dt>Статус</dt>
                <dd className={`status ${order.statusClass}`}>{order.status}</dd>
                <dt>Срок</dt>
                <dd>{order.due}</dd>
              </dl>
              {hasCounterInfo ? (
                <p
                  className={`order-countermove ${counterMove?.severity || 'low'}${
                    counterMove && counterMove.chanceDelta > 0 ? ' support' : ''
                  }`}
                >
                  <span>{counterMove ? counterMove.title : 'Оценка штаба обновлена'}</span>
                  {chance !== null ? <b>шанс {chance}%</b> : null}
                  {counterPressure > 0 ? <em>давление {counterPressure}/100</em> : null}
                </p>
              ) : null}
              {isExpanded ? (
                <section className="order-expanded" aria-label={`Досье приказа: ${order.title}`}>
                  <p>{counterMove?.text || order.completeText}</p>
                  <small>
                    Риск: {planRiskLabel(order.riskLevel || 'low')} · стоимость: {formatResourceCost(order.cost || {})} ·
                    награда: {formatResourceCost(order.reward || {})}
                  </small>
                  {order.failureText ? <small>Провал: {order.failureText}</small> : null}
                </section>
              ) : null}
              <button
                type="button"
                title={isExpanded ? 'Скрыть досье' : 'Посмотреть'}
                aria-label={`Посмотреть приказ: ${order.title}`}
                aria-expanded={isExpanded}
                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
              >
                <Eye aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Отменить"
                aria-label={`Отменить приказ: ${order.title}`}
                onClick={() => onCancel(order.id)}
                disabled={isCancelled}
              >
                <X aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      <button className="create-order" type="button" onClick={onCreateOrder}>
        <Plus aria-hidden="true" />
        Создать приказ
      </button>
    </motion.section>
  );
}

function PendingActionDialog({
  selectedCountryName,
  onCancel,
  onConfirm,
}: {
  selectedCountryName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="action-dialog framed-panel" role="dialog" aria-modal="true" aria-labelledby="orderDialogTitle">
        <div className="panel-heading">
          <h2 id="orderDialogTitle">Новый приказ</h2>
          <button type="button" aria-label="Закрыть создание приказа" onClick={onCancel}>
            <X aria-hidden="true" />
          </button>
        </div>
        <p>
          Совет подготовит инфраструктурный приказ для цели: <b>{selectedCountryName}</b>. Стоимость будет списана сразу,
          результат появится в хронике после завершения хода.
        </p>
        <dl>
          <dt>Тип</dt>
          <dd>Развитие земель</dd>
          <dt>Срок</dt>
          <dd>2 дня</dd>
          <dt>Проверка</dt>
          <dd>Казна и канцелярия проверят доступность приказа</dd>
        </dl>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            Подтвердить приказ
          </button>
        </div>
      </section>
    </div>
  );
}

function RightPanel({
  timeline,
  letters,
  diplomacy,
  nations,
  worldEvents,
  onComposeLetter,
  onRespondLetter,
  showToast,
}: {
  timeline: TimelineEvent[];
  letters: Letter[];
  diplomacy: DiplomacyRelation[];
  nations: NationProfile[];
  worldEvents: WorldEvent[];
  onComposeLetter: () => void;
  onRespondLetter: (letterId: string, responseId: string) => void;
  showToast: (message: string) => void;
}) {
  const latestWorldEvent = worldEvents[0];
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const selectedLetterEntry =
    letters
      .map((letter, index) => ({
        letter,
        index,
        id: getLetterRuntimeId(letter, index),
      }))
      .find((entry) => entry.id === selectedLetterId) ||
    (letters[0]
      ? {
          letter: letters[0],
          index: 0,
          id: getLetterRuntimeId(letters[0], 0),
        }
      : null);
  const selectedLetter = selectedLetterEntry?.letter || null;
  const selectedResponses = selectedLetter ? getLetterResponseOptions(selectedLetter) : [];
  const selectedLetterAnswered = selectedLetter?.status === 'answered';

  return (
    <motion.aside
      className="side-panel right-panel"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <section className="timeline-panel framed-panel compact">
        <div className="panel-heading">
          <h2>Хроника мира</h2>
          <button type="button" onClick={() => showToast('Смотреть все')}>
            Смотреть все
          </button>
        </div>
        <div className="timeline-list">
          {latestWorldEvent ? (
            <article className="world-pulse-row">
              <span className={`flag ${latestWorldEvent.flag}`} />
              <div>
                <h3>{latestWorldEvent.title}</h3>
                <p>{latestWorldEvent.text}</p>
              </div>
              <time>ход {latestWorldEvent.turn}</time>
            </article>
          ) : null}
          {timeline.slice(0, latestWorldEvent ? 6 : 7).map((event, index) => (
            <article key={`${event.title}-${event.time}-${index}`}>
              <span className={`event-icon ${event.tone}`}>{event.icon}</span>
              <div>
                <h3>{event.title}</h3>
                <p>{event.text}</p>
              </div>
              <time>{event.time}</time>
            </article>
          ))}
        </div>
      </section>

      <section className="mail-panel framed-panel compact">
        <div className="panel-heading">
          <h2>
            Входящие письма <span>{letters.length}</span>
          </h2>
          <button type="button" aria-label="Написать письмо" onClick={onComposeLetter}>
            Написать
          </button>
        </div>
        <div className="mail-list" aria-label="Список входящих писем">
          {letters.map((letter, index) => {
            const letterId = getLetterRuntimeId(letter, index);
            const isSelected = selectedLetterEntry?.id === letterId;
            const isAnswered = letter.status === 'answered';

            return (
              <article
                key={letterId}
                className={`mail-item${isSelected ? ' selected' : ''}${isAnswered ? ' answered' : ''}`}
              >
                <button
                  type="button"
                  className="mail-row-button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedLetterId(letterId)}
                >
                  <span className={`letter-seal ${letter.tone}`}>✉</span>
                  <div>
                    <h3>{letter.from}</h3>
                    <p>Тема: {letter.subject}</p>
                  </div>
                  <time>{isAnswered ? 'решено' : letter.time}</time>
                </button>
              </article>
            );
          })}
        </div>
        {selectedLetter ? (
          <section className={`letter-detail ${selectedLetterAnswered ? 'answered' : ''}`} aria-label={`Письмо: ${selectedLetter.subject}`}>
            <header>
              <CountryFlagMark
                countryKey={countryKeyByLocalizedName[selectedLetter.from]}
                countryName={selectedLetter.from}
                fallbackFlag={countryKeyByLocalizedName[selectedLetter.from]}
              />
              <div>
                <b>{selectedLetter.subject}</b>
                <small>{selectedLetter.from}</small>
              </div>
              <em>{selectedLetterAnswered ? selectedLetter.answeredBy || 'решено' : 'ожидает ответа'}</em>
            </header>
            <p>{selectedLetter.body || `Канцелярия ждёт решения по письму "${selectedLetter.subject}".`}</p>
            <div className="letter-response-list">
              {selectedResponses.map((response) => (
                <button
                  key={response.id}
                  type="button"
                  className={`letter-response ${response.tone}`}
                  disabled={selectedLetterAnswered}
                  aria-label={`Ответить на письмо: ${response.label}`}
                  onClick={() => selectedLetterEntry && onRespondLetter(selectedLetterEntry.id, response.id)}
                >
                  <span>{response.label}</span>
                  <small>{response.summary}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <button className="show-all" type="button" onClick={() => showToast('Показать все письма')}>
          Показать все письма
        </button>
      </section>

      <section className="diplomacy-panel framed-panel compact">
        <div className="panel-heading">
          <h2>Дипломатия</h2>
          <button type="button" onClick={() => showToast('Смотреть все')}>
            Смотреть все
          </button>
        </div>
        <ul>
          {diplomacy.map((item) => {
            const nation = nations.find((entry) => entry.name === item.name);

            return (
              <li key={item.name}>
                <CountryFlagMark countryName={item.name} fallbackFlag={item.flag} />
                <b>{item.name}</b>
                <em className={item.tone}>{item.status}</em>
                <strong>{item.score > 0 ? `+${item.score}` : item.score}</strong>
                <small>{nation ? `Давление ${nation.pressure}/100 · ${nation.lastAction}` : 'Досье ожидает разведданных'}</small>
              </li>
            );
          })}
        </ul>
      </section>
    </motion.aside>
  );
}

export default App;
