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
  Swords,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import worldMapSvg from './assets/world-map.svg?raw';
import { canPay, getLetterResponseOptions, getLetterRuntimeId, oncePerTurnQuickActions } from './game/engine';
import { formatClock, formatResourceTrend, formatResourceValue } from './game/formatters';
import { playerCountry } from './game/initialState';
import { buildMapSignals, filterMapSignalsForMode, type MapModeId, type MapSignal } from './game/mapIntel';
import { gameReducer } from './game/reducer';
import { loadGameState, saveGameState } from './game/storage';
import type {
  ChatChannel,
  ChatMessage,
  CountryIntelActionId,
  DiplomacyRelation,
  Letter,
  LetterResponseOption,
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

const chatChannelByTab = {
  Совет: 'council',
  Мир: 'world',
  Альянс: 'alliance',
} as const satisfies Record<string, ChatChannel>;

type ChatTabLabel = keyof typeof chatChannelByTab;

const chatTabs = Object.keys(chatChannelByTab) as ChatTabLabel[];

const emptyChatToastByChannel: Record<ChatChannel, string> = {
  council: 'Введите распоряжение совету',
  world: 'Введите публичное заявление',
  alliance: 'Введите сообщение союзникам',
};

function getCurrentChatTime() {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

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
  { label: 'Совет', icon: MessageSquare },
  { label: 'Письма', icon: Mail, badge: 6 },
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

const quickActions: Array<{
  id: QuickActionId;
  label: string;
  icon: LucideIcon;
  description: string;
  cadence: string;
}> = [
  {
    id: 'compose-letter',
    label: 'Письмо союзникам',
    icon: Mail,
    description: 'Совет подготовит письмо для закрытого союзного канала.',
    cadence: 'раз в ход',
  },
  {
    id: 'create-order',
    label: 'Черновик приказа',
    icon: Flag,
    description: 'Совет оформит приказ по выбранной стране или Москве.',
    cadence: 'шаблон',
  },
  {
    id: 'manage-lands',
    label: 'Хозяйственный ход',
    icon: Landmark,
    description: 'Внутренний совет предложит безопасный экономический приказ.',
    cadence: 'раз в ход',
  },
  {
    id: 'trade-routes',
    label: 'Торговый план',
    icon: Anchor,
    description: 'Торговый совет подготовит маршрут с ценой и шансом успеха.',
    cadence: 'шаблон',
  },
  {
    id: 'recruit-army',
    label: 'Военный набор',
    icon: Shield,
    description: 'Генеральный штаб оценит дорогой, но полезный набор армии.',
    cadence: 'шаблон',
  },
  {
    id: 'diplomacy',
    label: 'Дипломатический зонд',
    icon: Handshake,
    description: 'Канцелярия проверит окно для осторожных переговоров.',
    cadence: 'раз в ход',
  },
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

const nationDeltaLabels: Record<string, string> = {
  economy: 'экономика',
  army: 'армия',
  stability: 'стабильность',
  treasury: 'казна',
  grain: 'зерно',
  relation: 'отношения',
  threat: 'угроза',
  pressure: 'давление',
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

function diplomacyFallbackPressure(score: number) {
  if (score <= -60) return 76;
  if (score <= -20) return 58;
  if (score < 40) return 39;
  if (score < 100) return 24;
  return 18;
}

function diplomacyPressureTone(value: number) {
  if (value >= 70) return 'danger';
  if (value >= 50) return 'warning';
  if (value >= 30) return 'watch';
  return 'calm';
}

function diplomacyPressureLabel(value: number) {
  if (value >= 70) return 'Кризисное давление';
  if (value >= 50) return 'Высокое давление';
  if (value >= 30) return 'Наблюдение';
  return 'Спокойный канал';
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

function formatCompactResourceCost(delta: ResourceDelta) {
  const shortLabels: Record<keyof ResourceDelta, string> = {
    gold: 'зол.',
    wood: 'дер.',
    stone: 'кам.',
    iron: 'жел.',
    grain: 'зер.',
    population: 'нас.',
  };
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      const formatted =
        key === 'population' ? Number(value).toFixed(1) : Math.round(Number(value)).toLocaleString('ru-RU');

      return `${formatted} ${shortLabels[key as keyof ResourceDelta] || key}`;
    });

  if (!parts.length) return '0';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} +${parts.length - 1}`;
}

function formatSignedNumber(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function formatDiplomacyDelta(delta: Record<string, number> = {}) {
  const parts = Object.entries(delta)
    .filter(([, value]) => value)
    .map(([country, value]) => `${country} ${formatSignedNumber(value)}`);

  return parts.length ? parts.join(', ') : 'без прямых изменений';
}

function formatNationDelta(delta: OperationPlan['nationDelta'] = {}) {
  const parts = Object.entries(delta)
    .map(([country, metrics]) => {
      const metricText = Object.entries(metrics || {})
        .filter(([, value]) => value)
        .map(([metric, value]) => `${nationDeltaLabels[metric] || metric} ${formatSignedNumber(Number(value))}`)
        .join(', ');

      return metricText ? `${country}: ${metricText}` : '';
    })
    .filter(Boolean);

  return parts.length ? parts.join('; ') : 'без открытых изменений';
}

function missingResourceText(resources: ResourceState[], cost: ResourceDelta = {}) {
  const missing = resources
    .map((resource) => {
      const required = cost[resource.id] ?? 0;
      const deficit = required - resource.value;
      if (deficit <= 0) return '';

      const label = resourceDeltaLabels[resource.id] || resource.label;
      const formatted = resource.id === 'population' ? deficit.toFixed(1) : Math.ceil(deficit).toLocaleString('ru-RU');
      return `${formatted} ${label}`;
    })
    .filter(Boolean);

  return missing.length ? missing.join(', ') : '';
}

function planRiskLabel(risk: OperationPlan['riskLevel']) {
  if (risk === 'critical') return 'критический риск';
  if (risk === 'high') return 'высокий риск';
  if (risk === 'medium') return 'средний риск';
  return 'низкий риск';
}

const planRiskScore: Record<OperationPlan['riskLevel'], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function scoreOperationPlan(plan: OperationPlan) {
  const urgency = Math.max(0, 3 - (plan.expiresTurn - plan.createdTurn));
  const speed = Math.max(0, 4 - plan.durationTurns) * 3;
  const riskPenalty = planRiskScore[plan.riskLevel] * 14;
  const councilBonus = plan.origin === 'council' ? 5 : 0;

  return plan.successChance + speed + urgency + councilBonus - riskPenalty;
}

function pickCouncilPriorityPlan(plans: OperationPlan[]) {
  return [...plans].sort((left, right) => scoreOperationPlan(right) - scoreOperationPlan(left))[0] || null;
}

function councilPriorityReason(plan: OperationPlan, activeOrderCount: number) {
  if (activeOrderCount >= 5) {
    return 'Лимит приказов заполнен: сначала завершите или отмените один активный приказ, затем утверждайте новый план.';
  }

  if (plan.successChance >= 90 && plan.durationTurns <= 1) {
    return 'Лучший первый выбор: быстрый приказ с высоким шансом и понятной ценой.';
  }

  if (plan.riskLevel === 'high' || plan.riskLevel === 'critical') {
    return 'План сильный, но опасный: совет рекомендует сначала уточнить маршрут или подготовить ресурсы.';
  }

  if (plan.kind === 'military') {
    return 'Военный план укрепит позицию державы, но займет время и свяжет ресурсы.';
  }

  if (plan.kind === 'trade') {
    return 'Торговый план дает доход и улучшает связи, если окно маршрута не закрыть промедлением.';
  }

  if (plan.kind === 'diplomacy') {
    return 'Дипломатический план стоит утвердить, если нужен ответ без прямой войны и лишнего давления.';
  }

  return 'Совет считает этот план самым сбалансированным по шансу, сроку и риску.';
}

type PlanDecisionTone = 'safe' | 'watch' | 'risk' | 'blocked';

function hasResourceDelta(delta: ResourceDelta = {}) {
  return Object.values(delta).some((value) => Number(value) !== 0);
}

function firstPlanEffect(plan: OperationPlan) {
  const reward = hasResourceDelta(plan.reward) ? formatResourceCost(plan.reward || {}) : '';
  const diplomacy = formatDiplomacyDelta(plan.diplomacyDelta);
  const nation = formatNationDelta(plan.nationDelta);

  if (plan.kind === 'trade') {
    return reward ? `Доход и маршрут: ${reward}.` : 'Открывает торговое окно и снижает цену следующих переговоров.';
  }

  if (plan.kind === 'diplomacy') {
    return diplomacy !== 'без прямых изменений'
      ? `Дипломатия: ${diplomacy}.`
      : 'Дает безопасный канал для переговоров без немедленной эскалации.';
  }

  if (plan.kind === 'military' || plan.kind === 'countermeasure') {
    return nation !== 'без открытых изменений'
      ? `Военное досье: ${nation}.`
      : 'Укрепляет позицию и снижает шанс чужого давления на приказ.';
  }

  if (plan.kind === 'infrastructure' || plan.kind === 'stability') {
    return reward ? `Внутренний эффект: ${reward}.` : 'Усиливает устойчивость державы и разгружает следующий ход.';
  }

  if (reward) return `Эффект: ${reward}.`;
  if (diplomacy !== 'без прямых изменений') return `Дипломатия: ${diplomacy}.`;
  if (nation !== 'без открытых изменений') return `Досье: ${nation}.`;
  return 'Эффект станет виден после исполнения приказа и реакции мира.';
}

function failurePreview(plan: OperationPlan) {
  const failureCost = hasResourceDelta(plan.failureCost) ? formatResourceCost(plan.failureCost || {}) : '';

  if (plan.riskLevel === 'critical') {
    return failureCost ? `Провал дорогой: ${failureCost}.` : 'Провал может резко поднять давление вокруг цели.';
  }

  if (plan.riskLevel === 'high') {
    return failureCost ? `При срыве потери: ${failureCost}.` : 'При срыве враги получат повод усилить давление.';
  }

  if (plan.riskLevel === 'medium') {
    return 'Средний риск: лучше открыть досье, если цель уже напряжена.';
  }

  return 'Низкий риск: потери при срыве ограничены.';
}

function describePlanDecision(plan: OperationPlan, activeOrderCount: number, currentTurn: number) {
  const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);

  if (activeOrderCount >= 5) {
    return {
      label: 'нужен слот',
      tone: 'blocked' as PlanDecisionTone,
      nextAction: 'Освободите один приказ, затем вернитесь к утверждению.',
      reason: councilPriorityReason(plan, activeOrderCount),
    };
  }

  if (plan.riskLevel === 'critical' || plan.riskLevel === 'high') {
    return {
      label: 'сначала досье',
      tone: 'risk' as PlanDecisionTone,
      nextAction: 'Откройте досье и уточните план, если цена провала слишком высока.',
      reason: `${councilPriorityReason(plan, activeOrderCount)} ${failurePreview(plan)}`,
    };
  }

  if (expiresIn <= 1) {
    return {
      label: 'решить сейчас',
      tone: 'watch' as PlanDecisionTone,
      nextAction: 'Окно почти закрыто: утвердите план или отложите его, чтобы очистить штаб.',
      reason: councilPriorityReason(plan, activeOrderCount),
    };
  }

  if (plan.successChance >= 88) {
    return {
      label: 'можно утверждать',
      tone: 'safe' as PlanDecisionTone,
      nextAction: 'План достаточно надежен: проверьте цену и утверждайте, если цель подходит.',
      reason: councilPriorityReason(plan, activeOrderCount),
    };
  }

  return {
    label: 'проверить цену',
    tone: 'watch' as PlanDecisionTone,
    nextAction: 'Проверьте досье, цену и срок, затем решите: уточнять или утверждать.',
    reason: councilPriorityReason(plan, activeOrderCount),
  };
}

function pickCouncilChoicePlans(plans: OperationPlan[]) {
  return [...plans].sort((left, right) => scoreOperationPlan(right) - scoreOperationPlan(left)).slice(0, 3);
}

function councilChoiceRole(plan: OperationPlan) {
  if (plan.successChance >= 90 && plan.riskLevel === 'low') return 'Безопасный ход';
  if (plan.riskLevel === 'high' || plan.riskLevel === 'critical') return 'Рискованный прорыв';
  if (plan.kind === 'trade') return 'Торговое окно';
  if (plan.kind === 'diplomacy') return 'Дипломатический канал';
  if (plan.kind === 'military') return 'Военный ответ';
  if (plan.kind === 'infrastructure') return 'Развитие державы';
  return 'Спокойный маневр';
}

function councilChoiceHint(plan: OperationPlan, activeOrderCount: number) {
  if (activeOrderCount >= 5) return 'Сначала освободите слот приказа.';
  if (plan.riskLevel === 'high' || plan.riskLevel === 'critical') {
    return 'Лучше открыть досье и уточнить, если ресурсы или дипломатия не готовы.';
  }
  if (plan.successChance >= 88) return 'Можно быстро утвердить после просмотра досье.';
  if (plan.durationTurns > 2) return 'Длинный ход: проверьте, не закрывается ли окно раньше срока.';
  return 'Проверьте цену и последствия, затем решайте.';
}

function buildCouncilStarterPrompts(selectedCountryName: string, worldTension: number) {
  const target = selectedCountryName || playerCountry.name;
  const pressurePrompt =
    worldTension >= 55
      ? `Совет, оцени риски вокруг цели "${target}" и предложи оборонительный ход без резкой эскалации.`
      : `Совет, найди выгодный спокойный ход по цели "${target}" на этот ход.`;

  return [
    {
      label: 'Оценить риск',
      text: pressurePrompt,
      detail: 'Совет вернет осторожный план с ценой, сроком и риском.',
    },
    {
      label: 'Торговый шанс',
      text: `Совет, подготовь торговый маршрут или ресурсную сделку по цели "${target}".`,
      detail: 'Подходит, если нужен рост дохода без войны.',
    },
    {
      label: 'Разведать цель',
      text: `Совет, разведай намерения цели "${target}" и предложи безопасный следующий приказ.`,
      detail: 'Полезно перед переговорами, войной или крупными расходами.',
    },
  ];
}

function operationPlanDoctrine(plan: OperationPlan) {
  if (plan.riskLevel === 'critical') {
    return 'Штаб считает приказ почти кризисным: утверждать стоит только если цель важнее потерь.';
  }

  if (plan.riskLevel === 'high') {
    return 'План может дать сильный результат, но противник или логистика способны дорого сорвать исполнение.';
  }

  if (plan.successChance >= 90) {
    return 'Совет видит устойчивое окно: приказ можно утверждать без долгой подготовки.';
  }

  if (plan.kind === 'diplomacy') {
    return 'Дипломатический ход полезен, когда нужно выиграть время и снизить риск прямого столкновения.';
  }

  if (plan.kind === 'trade') {
    return 'Торговый ход усиливает доход, но его лучше не откладывать, пока маршрут открыт.';
  }

  return 'План рабочий, но совет рекомендует сверить цену, срок и последствия перед утверждением.';
}

function operationPlanApprovalBlockReason(plan: OperationPlan, resources: ResourceState[], activeOrderCount: number) {
  if (activeOrderCount >= 5) {
    return 'Лимит активных приказов заполнен. Отмените или завершите один приказ перед утверждением.';
  }

  const missing = missingResourceText(resources, plan.cost);
  if (missing) {
    return `Не хватает ресурсов: ${missing}.`;
  }

  return '';
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

type TurnObjectiveTone = 'danger' | 'warning' | 'opportunity' | 'steady';

type TurnObjective = {
  eyebrow: string;
  title: string;
  summary: string;
  action: string;
  metricLabel: string;
  metricValue: string;
  progress: number;
  tone: TurnObjectiveTone;
};

type TurnFlowStepState = 'done' | 'active' | 'waiting';

type TurnFlowStep = {
  label: string;
  detail: string;
  state: TurnFlowStepState;
};

function buildTurnObjective({
  diplomacy,
  letters,
  nations,
  operationPlans,
  orders,
  selectedCountry,
  worldTension,
}: {
  diplomacy: DiplomacyRelation[];
  letters: Letter[];
  nations: NationProfile[];
  operationPlans: OperationPlan[];
  orders: Order[];
  selectedCountry: SelectedCountry | null;
  worldTension: number;
}): TurnObjective {
  const activeOrders = orders.filter((order) => order.statusClass !== 'cancelled');
  const openLetters = letters.filter((letter) => letter.status !== 'answered');
  const relationByName = new Map(diplomacy.map((relation) => [relation.name, relation]));
  const selectedNation = selectedCountry
    ? nations.find((nation) => nation.name === selectedCountry.name)
    : null;

  if (selectedCountry && selectedCountry.name !== playerCountry.name) {
    const selectedRelation = relationByName.get(selectedCountry.name);
    const pressure = selectedNation?.pressure ?? diplomacyFallbackPressure(selectedRelation?.score ?? 0);
    const relationScore = selectedRelation?.score ?? selectedNation?.relation ?? 0;

    return {
      eyebrow: 'Цель хода',
      title: `${selectedCountry.name}: оценить ход`,
      summary: selectedNation?.focus
        ? `Фокус: ${focusLabels[selectedNation.focus]}. Давление видно.`
        : 'Совет готов оценить риск и лучший приказ.',
      action: 'Совет или действие в досье.',
      metricLabel: 'Давление',
      metricValue: `${pressure}/100`,
      progress: pressure,
      tone: relationScore < -30 || pressure >= 55 ? 'warning' : 'opportunity',
    };
  }

  const threatCandidate = nations
    .filter((nation) => nation.id !== 'russia')
    .map((nation) => {
      const relation = relationByName.get(nation.name);
      const relationPenalty = relation && relation.score < 0 ? Math.abs(relation.score) / 2 : 0;

      return {
        nation,
        relation,
        priority: nation.pressure + nation.threat + relationPenalty,
      };
    })
    .sort((left, right) => right.priority - left.priority)[0];

  if (
    threatCandidate &&
    (threatCandidate.priority >= 95 ||
      threatCandidate.nation.pressure >= 50 ||
      threatCandidate.nation.threat >= 55 ||
      threatCandidate.relation?.tone === 'hostile')
  ) {
    const pressure = Math.max(threatCandidate.nation.pressure, threatCandidate.nation.threat);

    return {
      eyebrow: 'Главная цель',
      title: `${threatCandidate.nation.name}: снизить риск`,
      summary: `Фокус: ${focusLabels[threatCandidate.nation.focus]}. Риск растёт.`,
      action: 'Совет: разведка или оборона.',
      metricLabel: 'Риск',
      metricValue: `${pressure}/100`,
      progress: pressure,
      tone: pressure >= 70 ? 'danger' : 'warning',
    };
  }

  const urgentLetter = openLetters.find((letter) => letter.tone === 'red' || letter.tone === 'bronze') || openLetters[0];

  if (urgentLetter) {
    return {
      eyebrow: 'Канцелярия',
      title: `${urgentLetter.from}: ждёт ответа`,
      summary: `Тема: ${urgentLetter.subject}. Решение изменит отношения.`,
      action: 'Откройте письмо и выберите ответ.',
      metricLabel: 'Писем',
      metricValue: String(openLetters.length),
      progress: clampStat(openLetters.length * 18),
      tone: urgentLetter.tone === 'red' ? 'warning' : 'opportunity',
    };
  }

  if (operationPlans.length) {
    const bestPlan = [...operationPlans].sort((left, right) => right.successChance - left.successChance)[0];

    return {
      eyebrow: 'Цель совета',
      title: bestPlan.title,
      summary: `${bestPlan.owner}: шанс ${bestPlan.successChance}%, ${planRiskLabel(bestPlan.riskLevel)}.`,
      action: 'Утвердите или уточните план.',
      metricLabel: 'Шанс',
      metricValue: `${bestPlan.successChance}%`,
      progress: bestPlan.successChance,
      tone: bestPlan.riskLevel === 'high' || bestPlan.riskLevel === 'critical' ? 'warning' : 'opportunity',
    };
  }

  if (activeOrders.length) {
    const closestOrder = [...activeOrders].sort((left, right) => left.remainingTurns - right.remainingTurns)[0];
    const progress = clampStat(
      Math.round(((closestOrder.totalTurns - closestOrder.remainingTurns + 1) / closestOrder.totalTurns) * 100),
    );

    return {
      eyebrow: 'Приказы',
      title: closestOrder.title,
      summary: `Исполнитель: ${closestOrder.owner}. Цель: ${closestOrder.target}.`,
      action: 'Завершите ход или откройте досье.',
      metricLabel: 'Прогресс',
      metricValue: `${progress}%`,
      progress,
      tone: closestOrder.riskLevel === 'high' || closestOrder.riskLevel === 'critical' ? 'warning' : 'steady',
    };
  }

  return {
    eyebrow: 'Цель хода',
    title: 'Дать задачу Совету',
    summary: 'Выберите страну на карте или напишите распоряжение.',
    action: 'Совет: граница, торговля, разведка.',
    metricLabel: 'Мир',
    metricValue: `${worldTension}/100`,
    progress: worldTension,
    tone: worldTension >= 55 ? 'warning' : 'steady',
  };
}

function buildTurnFlow({
  activeChannel,
  openLetterCount,
  operationPlanCount,
  orderCount,
  selectedCountryName,
  turnObjective,
}: {
  activeChannel: ChatChannel;
  openLetterCount: number;
  operationPlanCount: number;
  orderCount: number;
  selectedCountryName: string;
  turnObjective: TurnObjective;
}) {
  const targetSelected = selectedCountryName !== playerCountry.name || turnObjective.eyebrow !== 'Цель хода';
  const activeIndex = (() => {
    if (operationPlanCount > 0) return 2;
    if (orderCount > 0) return 3;
    if (targetSelected || activeChannel === 'council') return 1;
    return 0;
  })();
  const stepState = (index: number): TurnFlowStepState => {
    if (index < activeIndex) return 'done';
    if (index === activeIndex) return 'active';
    return 'waiting';
  };

  const steps: TurnFlowStep[] = [
    {
      label: 'Цель',
      detail: targetSelected ? selectedCountryName : 'карта',
      state: stepState(0),
    },
    {
      label: 'Замысел',
      detail: activeChannel === 'council' ? 'Совет' : 'откройте Совет',
      state: stepState(1),
    },
    {
      label: 'Решение',
      detail: operationPlanCount ? `${operationPlanCount} плана` : 'ждём план',
      state: stepState(2),
    },
    {
      label: 'Ход',
      detail: orderCount ? `${orderCount}/5 готово` : 'после плана',
      state: stepState(3),
    },
  ];

  const hint = (() => {
    if (operationPlanCount > 0) return 'Выберите план: открыть досье, уточнить или утвердить приказ.';
    if (orderCount > 0) return 'Приказы в работе: проверьте риск и завершайте ход, когда готовы.';
    if (targetSelected) return 'Цель выбрана: опишите Совету действие обычным текстом.';
    return 'Начните с карты или распоряжения Совету.';
  })();

  return {
    activeIndex,
    hint,
    alert: openLetterCount ? `Канцелярия: ${openLetterCount} писем могут изменить дипломатический фон.` : '',
    steps,
  };
}

function responseToneLabel(tone: NonNullable<TurnReport['strategicResponses']>[number]['tone']) {
  if (tone === 'danger') return 'Угроза';
  if (tone === 'warning') return 'Осторожно';
  if (tone === 'stability') return 'Стабильность';
  return 'Возможность';
}

function buildFallbackTurnCauseLog(report: TurnReport): TurnReport['causeLog'] {
  const causeLog: TurnReport['causeLog'] = [];
  const firstOrder = report.completedOrders[0];
  const firstEvent = report.worldEvents[0];

  if (firstOrder) {
    causeLog.push({
      title: firstOrder.succeeded ? 'Приказ дал результат' : 'Приказ дал сбой',
      cause: `Срок приказа "${firstOrder.title}" закончился на этом ходу.`,
      effect: firstOrder.text,
      tone: firstOrder.succeeded ? 'success' : 'danger',
    });
  }

  if (firstEvent) {
    causeLog.push({
      title: firstEvent.title.startsWith(`${firstEvent.actor}:`) ? firstEvent.title : `${firstEvent.actor}: ${firstEvent.title}`,
      cause: 'Мир отреагировал на текущие намерения держав и последствия российских решений.',
      effect: firstEvent.text,
      tone: firstEvent.tone === 'red' ? 'danger' : firstEvent.tone === 'bronze' ? 'warning' : firstEvent.tone === 'green' ? 'success' : 'neutral',
    });
  }

  causeLog.push({
    title: 'Баланс хода',
    cause: 'После завершения хода применены доходы, расходы и дипломатические сдвиги.',
    effect: `Ресурсы: ${formatResourceDelta(report.resourceDelta)}. Дипломатия: ${formatDiplomacyDelta(report.diplomacyDelta)}.`,
    tone: report.warnings.length ? 'warning' : 'neutral',
  });

  return causeLog.slice(0, 4);
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
  const causeLog = report.causeLog?.length ? report.causeLog : buildFallbackTurnCauseLog(report);

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
        <section className="report-causality" aria-label="Почему изменился ход">
          <div>
            <h3>Почему так вышло</h3>
            <small>Короткая цепочка причин: что сработало, что ответил мир и чем это изменило партию.</small>
          </div>
          <ol>
            {causeLog.map((item, index) => (
              <li key={`${item.title}-${index}`} className={item.tone}>
                <b>{item.title}</b>
                <span>{item.cause}</span>
                <p>{item.effect}</p>
              </li>
            ))}
          </ol>
        </section>
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
  const [activeChatTab, setActiveChatTab] = useState<ChatTabLabel>('Совет');
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] = useState<QuickActionId | null>(null);
  const [pendingOperationPlanId, setPendingOperationPlanId] = useState<string | null>(null);
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
  const previousChatScrollRef = useRef<{ tab: ChatTabLabel; count: number } | null>(null);
  const turnLockRef = useRef(false);
  const seenTurnReportRef = useRef(lastTurnReport?.turn ?? null);
  const pendingOperationPlan = useMemo(
    () => operationPlans.find((plan) => plan.id === pendingOperationPlanId) || null,
    [operationPlans, pendingOperationPlanId],
  );

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
    return ['app-shell', 'redesign-shell', 'minimal-shell', mapModes[mapModeIndex].className].filter(Boolean).join(' ');
  }, [mapModeIndex]);

  const mapLayerAttributes = useMemo(() => {
    return Object.fromEntries(
      Object.entries(mapLayers).map(([key, value]) => [`data-layer-${key}`, value ? 'on' : 'off']),
    ) as Record<`data-layer-${MapLayerId}`, string>;
  }, [mapLayers]);

  const activeMapMode = mapModes[mapModeIndex];
  const activeChatChannel = chatChannelByTab[activeChatTab];
  const visibleChatMessages = useMemo(
    () => chatMessages.filter((message) => message.channel === activeChatChannel),
    [activeChatChannel, chatMessages],
  );
  const allianceNames = useMemo(
    () =>
      diplomacy
        .filter((relation) => relation.tone === 'ally' || relation.score >= 100)
        .map((relation) => relation.name)
        .slice(0, 3),
    [diplomacy],
  );
  const mapSignals = useMemo(() => buildMapSignals(gameState, countryKeyByLocalizedName), [gameState]);
  const visibleMapSignals = useMemo(
    () => filterMapSignalsForMode(mapSignals, activeMapMode.id),
    [activeMapMode.id, mapSignals],
  );
  const mapSignalByKey = useMemo(() => {
    return new Map(mapSignals.map((signal) => [signal.countryKey, signal]));
  }, [mapSignals]);
  const turnObjective = useMemo(
    () =>
      buildTurnObjective({
        diplomacy,
        letters,
        nations,
        operationPlans,
        orders,
        selectedCountry: gameState.selectedCountry,
        worldTension,
      }),
    [diplomacy, gameState.selectedCountry, letters, nations, operationPlans, orders, worldTension],
  );

  const activeIntelKey = gameState.selectedCountry?.key || 'Russia';

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  useEffect(() => {
    if (gameState.lastNotice) showToast(gameState.lastNotice.message);
  }, [gameState.lastNotice, showToast]);

  useEffect(() => {
    if (pendingOperationPlanId && !pendingOperationPlan) {
      setPendingOperationPlanId(null);
    }
  }, [pendingOperationPlan, pendingOperationPlanId]);

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
    if (!messages) return;

    const previous = previousChatScrollRef.current;
    const hasNewMessageInSameTab = previous?.tab === activeChatTab && visibleChatMessages.length > previous.count;
    messages.scrollTop = hasNewMessageInSameTab ? messages.scrollHeight : 0;
    previousChatScrollRef.current = { tab: activeChatTab, count: visibleChatMessages.length };
  }, [activeChatTab, visibleChatMessages.length]);

  const handleNavClick = (label: string) => {
    setActiveNav(label);
    setActiveUtilityPanel(label);
    showToast(`Раздел "${label}" открыт`);
  };

  const openUtilityPanel = (label: string) => {
    if (label === 'Помощь') {
      setGuideOpen(true);
      setActiveUtilityPanel(null);
      return;
    }

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
      showToast(emptyChatToastByChannel[activeChatChannel]);
      return;
    }

    dispatchGame({ type: 'SUBMIT_CHAT_MESSAGE', channel: activeChatChannel, text, time: getCurrentChatTime() });
    setChatInput('');
  };

  const runQuickAction = (id: QuickActionId) => {
    setActiveNav('Совет');
    setActiveChatTab('Совет');
    dispatchGame({ type: 'RUN_QUICK_ACTION', id, time: getCurrentChatTime() });
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

  const openOperationPlanDossier = (id: string) => {
    setPendingOperationPlanId(id);
  };

  const confirmOperationPlan = (id: string) => {
    dispatchGame({ type: 'RUN_OPERATION_PLAN', id });
    setPendingOperationPlanId(null);
  };

  const refineOperationPlan = (id: string) => {
    dispatchGame({ type: 'REFINE_OPERATION_PLAN', id });
  };

  const dismissOperationPlan = (id: string) => {
    dispatchGame({ type: 'DISMISS_OPERATION_PLAN', id });
    if (pendingOperationPlanId === id) {
      setPendingOperationPlanId(null);
    }
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
          turnObjective={turnObjective}
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
              messages={visibleChatMessages}
              input={chatInput}
              activeTab={activeChatTab}
              activeChannel={activeChatChannel}
              operationPlans={operationPlans}
              selectedCountryName={gameState.selectedCountry?.name || 'Россия'}
              allianceNames={allianceNames}
              openLetterCount={letters.filter((letter) => letter.status !== 'answered').length}
              turnNumber={turnNumber}
              orderCount={orders.filter((order) => order.statusClass !== 'cancelled').length}
              turnObjective={turnObjective}
              worldTension={worldTension}
              onInputChange={setChatInput}
              onTabChange={(tab) => {
                setActiveChatTab(tab);
                showToast(`Канал "${tab}" открыт`);
              }}
              onSubmit={submitChat}
              onRunPlan={openOperationPlanDossier}
              onRefinePlan={refineOperationPlan}
              onDismissPlan={dismissOperationPlan}
              messagesRef={chatMessagesRef}
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

      {pendingOperationPlan ? (
        <OperationPlanDossierDialog
          plan={pendingOperationPlan}
          resources={resources}
          activeOrderCount={orders.filter((order) => order.statusClass !== 'cancelled').length}
          currentTurn={turnNumber}
          onClose={() => setPendingOperationPlanId(null)}
          onApprove={confirmOperationPlan}
          onRefine={refineOperationPlan}
          onDismiss={dismissOperationPlan}
        />
      ) : null}

      {guideOpen ? (
        <GuideDialog
          activeChatTab={activeChatTab}
          diplomacy={diplomacy}
          letters={letters}
          operationPlans={operationPlans}
          orders={orders}
          selectedCountryName={gameState.selectedCountry?.name || 'Россия'}
          turnNumber={turnNumber}
          turnObjective={turnObjective}
          worldTension={worldTension}
          onClose={() => setGuideOpen(false)}
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
    { label: 'Поиск', icon: Search, className: 'optional' },
    { label: 'Корона', icon: Crown, className: 'crown optional' },
    { label: 'Почта', icon: Mail, badge: mailCount, className: 'mail' },
    { label: 'Уведомления', icon: Bell, className: 'optional' },
    { label: 'Помощь', icon: CircleHelp, className: 'help' },
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
    Совет: {
      text: `Совет принимает распоряжения обычным текстом и готовит действия с ценой, риском и сроком. Текущая цель: ${selectedCountryName}.`,
      action: 'Напишите приказ в нижней панели или выберите страну на карте, чтобы совет предложил контекстный ход.',
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
    Архив: {
      text: 'Архив хранит хронику мира, старые решения и дипломатические следы партии.',
      action: 'Сейчас подробные события открываются из правой сводки мира.',
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

function GuideDialog({
  activeChatTab,
  diplomacy,
  letters,
  operationPlans,
  orders,
  selectedCountryName,
  turnNumber,
  turnObjective,
  worldTension,
  onClose,
}: {
  activeChatTab: ChatTabLabel;
  diplomacy: DiplomacyRelation[];
  letters: Letter[];
  operationPlans: OperationPlan[];
  orders: Order[];
  selectedCountryName: string;
  turnNumber: number;
  turnObjective: TurnObjective;
  worldTension: number;
  onClose: () => void;
}) {
  const activeOrders = orders.filter((order) => order.statusClass !== 'cancelled');
  const openLetters = letters.filter((letter) => letter.status !== 'answered');
  const strongestPlan = [...operationPlans].sort((left, right) => right.successChance - left.successChance)[0];
  const closestOrder = [...activeOrders].sort((left, right) => left.remainingTurns - right.remainingTurns)[0];
  const tenseRelation = [...diplomacy].sort((left, right) => left.score - right.score)[0];
  const alliedCount = diplomacy.filter((relation) => relation.tone === 'ally' || relation.score >= 100).length;

  const nextAction = (() => {
    if (openLetters.length) {
      const urgentLetter = openLetters.find((letter) => letter.tone === 'red' || letter.tone === 'bronze') || openLetters[0];

      return {
        title: 'Разберите канцелярские письма',
        text: `${urgentLetter.from} ждёт решения по теме "${urgentLetter.subject}". Ответ может изменить отношения, ресурсы или создать новый повод для приказа.`,
        tone: urgentLetter.tone === 'red' ? 'warning' : 'opportunity',
      };
    }

    if (strongestPlan) {
      return {
        title: 'Проверьте предложение Совета',
        text: `${strongestPlan.title}: шанс ${strongestPlan.successChance}%, риск "${planRiskLabel(strongestPlan.riskLevel)}". Откройте досье, чтобы понять цену, награду и последствия провала.`,
        tone: strongestPlan.riskLevel === 'high' || strongestPlan.riskLevel === 'critical' ? 'warning' : 'opportunity',
      };
    }

    if (closestOrder) {
      return {
        title: 'Дайте приказам продвинуться',
        text: `${closestOrder.title} завершится через ${closestOrder.remainingTurns} ход. Если писем и новых планов нет, завершение хода двинет экономику, арбитра мира и статусы приказов.`,
        tone: closestOrder.riskLevel === 'high' || closestOrder.riskLevel === 'critical' ? 'warning' : 'steady',
      };
    }

    if (selectedCountryName !== playerCountry.name) {
      return {
        title: `Сформулируйте ход по цели "${selectedCountryName}"`,
        text: 'Напишите распоряжение в Совет или используйте действие из досье страны. Совет вернёт план с ценой, сроком, шансом и последствиями.',
        tone: 'opportunity',
      };
    }

    return {
      title: 'Выберите замысел на ход',
      text: 'Начните с цели: страна на карте, письмо, торговый маршрут, оборона или разведка. Совет превращает обычный текст в проверяемый игровой приказ.',
      tone: worldTension >= 55 ? 'warning' : 'steady',
    };
  })();

  const channelGuide: Array<{ title: ChatTabLabel; status: string; text: string; icon: LucideIcon }> = [
    {
      title: 'Совет',
      status: activeChatTab === 'Совет' ? 'открыт сейчас' : 'приватный канал',
      text: 'Главный канал игрока и нейросети. Здесь пишутся распоряжения, а Совет оценивает риск, цену, цель и возможные последствия.',
      icon: CircleHelp,
    },
    {
      title: 'Мир',
      status: 'видят все державы',
      text: 'Публичные заявления: гарантии, угрозы, торговые предложения. Они могут менять дипломатическое давление и попадать в хронику.',
      icon: MessageSquare,
    },
    {
      title: 'Альянс',
      status: alliedCount ? `${alliedCount} союзн.` : 'нужны союзники',
      text: 'Закрытая координация с союзниками. Полезна для совместной обороны, маршрутов, поставок и осторожных политических сигналов.',
      icon: Handshake,
    },
  ];

  const actionGuide = [
    {
      title: 'Письма',
      value: `${openLetters.length} открыто`,
      text: 'Это не почта для вида: ответы меняют дипломатию, хронику, ресурсы и иногда создают новые планы Совета.',
    },
    {
      title: 'Приказы',
      value: `${activeOrders.length}/5`,
      text: 'Приказ начинает тратить ресурсы и двигаться по ходам только после утверждения досье. Отмена убирает его из активного списка.',
    },
    {
      title: 'Завершить ход',
      value: `ход ${turnNumber}`,
      text: 'Нажимайте, когда письма и планы разобраны. Тогда начисляются ресурсы, мир реагирует, а приказы приближаются к результату.',
    },
    {
      title: 'Досье державы',
      value: tenseRelation ? `${tenseRelation.name} ${tenseRelation.score > 0 ? '+' : ''}${tenseRelation.score}` : 'нет данных',
      text: 'Выбор страны на карте показывает её фокус, давление, угрозу и доступные действия. Это лучший вход для точечных распоряжений.',
    },
  ];

  const cycleGuide = [
    { title: '1. Цель', text: 'Выберите страну, письмо или проблему на карте.' },
    { title: '2. Замысел', text: 'Напишите Совету обычным текстом, что хотите сделать.' },
    { title: '3. Досье', text: 'Проверьте шанс, цену, срок и риск провала.' },
    { title: '4. Ход', text: 'Утвердите приказ и завершите ход, чтобы мир ответил.' },
  ];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="guide-dialog framed-panel" role="dialog" aria-modal="true" aria-labelledby="guideDialogTitle">
        <header className="dialog-heading guide-dialog-heading">
          <span className="guide-emblem" aria-hidden="true">
            <CircleHelp />
          </span>
          <div>
            <small>Полевой устав Совета</small>
            <h2 id="guideDialogTitle">Как вести ход</h2>
            <p>
              Ход {turnNumber} · цель: {selectedCountryName} · канал: {activeChatTab}
            </p>
          </div>
          <strong>
            {turnObjective.metricLabel}: {turnObjective.metricValue}
          </strong>
          <button type="button" className="dialog-close text-close" onClick={onClose}>
            Закрыть устав
          </button>
        </header>

        <div className="guide-dialog-body">
          <section className={`guide-current ${nextAction.tone}`} aria-label="Текущая рекомендация">
            <div>
              <span>Сейчас важно</span>
              <h3>{nextAction.title}</h3>
              <p>{nextAction.text}</p>
            </div>
            <div className="guide-current-meter">
              <span>Цель хода</span>
              <b>{turnObjective.title}</b>
              <i aria-hidden="true">
                <em style={{ width: `${turnObjective.progress}%` }} />
              </i>
              <small>{turnObjective.action}</small>
            </div>
          </section>

          <section className="guide-cycle" aria-label="Игровой цикл">
            {cycleGuide.map((item) => (
              <article key={item.title}>
                <b>{item.title}</b>
                <p>{item.text}</p>
              </article>
            ))}
          </section>

          <section className="guide-channels" aria-label="Каналы общения">
            <header>
              <h3>Куда писать</h3>
              <p>Основные действия проходят через чат, а панели помогают быстро проверить последствия.</p>
            </header>
            <div>
              {channelGuide.map(({ title, status, text, icon: Icon }) => (
                <article key={title} className={activeChatTab === title ? 'active' : undefined}>
                  <Icon aria-hidden="true" />
                  <div>
                    <b>{title}</b>
                    <span>{status}</span>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="guide-actions" aria-label="Смысл основных кнопок">
            <header>
              <h3>Что значат главные кнопки</h3>
              <p>Кнопки нужны не вместо Совета, а чтобы не терять важные решения и быстро подтверждать понятные действия.</p>
            </header>
            <dl>
              {actionGuide.map((item) => (
                <div key={item.title}>
                  <dt>
                    <span>{item.title}</span>
                    <b>{item.value}</b>
                  </dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </section>
    </div>
  );
}

function TurnObjectiveCard({ objective }: { objective: TurnObjective }) {
  return (
    <section className={`turn-objective ${objective.tone}`} aria-label="Цель текущего хода">
      <header>
        <span>{objective.eyebrow}</span>
        <b>
          {objective.metricLabel}: {objective.metricValue}
        </b>
      </header>
      <h2>{objective.title}</h2>
      <p>{objective.summary}</p>
      <div className="turn-objective-meter" aria-hidden="true">
        <i style={{ width: `${objective.progress}%` }} />
      </div>
      <small>{objective.action}</small>
    </section>
  );
}

function EmpirePanel({
  clock,
  resources,
  nations,
  turnObjective,
  worldTension,
  quickActionTurns,
  turnNumber,
  onEndTurn,
  onQuickAction,
}: {
  clock: string;
  resources: ResourceState[];
  nations: NationProfile[];
  turnObjective: TurnObjective;
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
        </div>
        <TurnObjectiveCard objective={turnObjective} />
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

function CouncilDecisionCard({
  plan,
  currentTurn,
  onRunPlan,
  onRefinePlan,
  onDismissPlan,
}: {
  plan: OperationPlan;
  currentTurn: number;
  onRunPlan: (id: string) => void;
  onRefinePlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
}) {
  const Icon = orderIcons[plan.iconKey];
  const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);
  const refinements = plan.refinements || 0;

  return (
    <section className={`council-decision-card ${plan.riskLevel}`} aria-label="Решение Совета">
      <header>
        <span>Штабное решение</span>
        <b>{planRiskLabel(plan.riskLevel)}</b>
      </header>
      <div className="council-decision-main">
        <span className="council-decision-icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h3>{plan.title}</h3>
          <p>{plan.summary}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>Шанс</dt>
          <dd>{plan.successChance}%</dd>
        </div>
        <div>
          <dt>Срок</dt>
          <dd>{plan.durationTurns} ход</dd>
        </div>
        <div>
          <dt>Цена</dt>
          <dd title={formatResourceCost(plan.cost)}>{formatCompactResourceCost(plan.cost)}</dd>
        </div>
        <div>
          <dt>Окно</dt>
          <dd>{expiresIn} ход</dd>
        </div>
      </dl>
      <div className="council-decision-actions">
        <button type="button" className="plan-run" onClick={() => onRunPlan(plan.id)}>
          Утвердить
        </button>
        <button type="button" className="plan-refine" onClick={() => onRefinePlan(plan.id)} disabled={refinements >= 2}>
          {refinements >= 2 ? 'Уточнено' : 'Уточнить'}
        </button>
        <button type="button" className="plan-dismiss" onClick={() => onDismissPlan(plan.id)}>
          Отложить
        </button>
      </div>
    </section>
  );
}

function CouncilChoiceBoard({
  plans,
  selectedCountryName,
  worldTension,
  currentTurn,
  activeOrderCount,
  onInputChange,
  onRunPlan,
  onRefinePlan,
  onDismissPlan,
}: {
  plans: OperationPlan[];
  selectedCountryName: string;
  worldTension: number;
  currentTurn: number;
  activeOrderCount: number;
  onInputChange: (value: string) => void;
  onRunPlan: (id: string) => void;
  onRefinePlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
}) {
  const [primaryPlan, ...alternativePlans] = plans;
  const starterPrompts = buildCouncilStarterPrompts(selectedCountryName, worldTension);

  if (!primaryPlan) {
    return (
      <section className="council-choice-board empty" aria-label="Штабной выбор Совета">
        <header>
          <span>Штабной выбор</span>
          <b>нужен замысел</b>
        </header>
        <p>
          Выберите формулировку или напишите свою. Совет превратит её в проверяемый план с ценой, риском и сроком.
        </p>
        <div className="council-starter-prompts">
          {starterPrompts.map((prompt) => (
            <button key={prompt.label} type="button" onClick={() => onInputChange(prompt.text)}>
              <b>{prompt.label}</b>
              <span>{prompt.detail}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="council-choice-board has-plans" aria-label="Штабной выбор Совета">
      <CouncilDecisionCard
        plan={primaryPlan}
        currentTurn={currentTurn}
        onRunPlan={onRunPlan}
        onRefinePlan={onRefinePlan}
        onDismissPlan={onDismissPlan}
      />
      {alternativePlans.length ? (
        <div className="council-next-steps" aria-label="Альтернативы Совета">
          <header>
            <span>Ещё варианты</span>
            <b>{plans.length} хода на выбор</b>
          </header>
          {alternativePlans.map((plan) => {
            const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);
            const refinements = plan.refinements || 0;

            return (
              <article key={plan.id} className={`council-next-step ${plan.riskLevel}`}>
                <div>
                  <span>{councilChoiceRole(plan)}</span>
                  <h4>{plan.title}</h4>
                  <p>{councilChoiceHint(plan, activeOrderCount)}</p>
                </div>
                <dl>
                  <div>
                    <dt>Шанс</dt>
                    <dd>{plan.successChance}%</dd>
                  </div>
                  <div>
                    <dt>Окно</dt>
                    <dd>{expiresIn} ход</dd>
                  </div>
                </dl>
                <div className="council-next-actions">
                  <button
                    type="button"
                    className="plan-run"
                    aria-label={`Открыть досье альтернативного плана: ${plan.title}`}
                    onClick={() => onRunPlan(plan.id)}
                    disabled={activeOrderCount >= 5}
                  >
                    Досье
                  </button>
                  <button
                    type="button"
                    className="plan-refine"
                    aria-label={`Уточнить альтернативный план: ${plan.title}`}
                    onClick={() => onRefinePlan(plan.id)}
                    disabled={refinements >= 2}
                  >
                    {refinements >= 2 ? 'Готово' : 'Уточнить'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="council-choice-note">
          Совет держит один сильный вариант. Если он не подходит, уточните план или напишите новый замысел ниже.
        </p>
      )}
    </section>
  );
}

function TurnFlowStrip({
  activeChannel,
  openLetterCount,
  operationPlanCount,
  orderCount,
  selectedCountryName,
  turnObjective,
}: {
  activeChannel: ChatChannel;
  openLetterCount: number;
  operationPlanCount: number;
  orderCount: number;
  selectedCountryName: string;
  turnObjective: TurnObjective;
}) {
  const flow = buildTurnFlow({
    activeChannel,
    openLetterCount,
    operationPlanCount,
    orderCount,
    selectedCountryName,
    turnObjective,
  });

  return (
    <section className="turn-flow" aria-label="Маршрут текущего хода" data-active-step={flow.activeIndex + 1}>
      <div className="turn-flow-head">
        <b>Маршрут хода</b>
        <span>{flow.hint}</span>
      </div>
      <ol>
        {flow.steps.map((step, index) => (
          <li key={step.label} className={step.state} aria-current={step.state === 'active' ? 'step' : undefined}>
            <i>{index + 1}</i>
            <span>{step.label}</span>
            <small>{step.detail}</small>
          </li>
        ))}
      </ol>
      {flow.alert ? <p>{flow.alert}</p> : null}
    </section>
  );
}

function ChatPanel({
  messages,
  input,
  activeTab,
  activeChannel,
  operationPlans,
  selectedCountryName,
  allianceNames,
  openLetterCount,
  turnNumber,
  orderCount,
  turnObjective,
  worldTension,
  onInputChange,
  onTabChange,
  onSubmit,
  onRunPlan,
  onRefinePlan,
  onDismissPlan,
  messagesRef,
}: {
  messages: ChatMessage[];
  input: string;
  activeTab: ChatTabLabel;
  activeChannel: ChatChannel;
  operationPlans: OperationPlan[];
  selectedCountryName: string;
  allianceNames: string[];
  openLetterCount: number;
  turnNumber: number;
  orderCount: number;
  turnObjective: TurnObjective;
  worldTension: number;
  onInputChange: (value: string) => void;
  onTabChange: (tab: ChatTabLabel) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRunPlan: (id: string) => void;
  onRefinePlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
  messagesRef: React.RefObject<HTMLDivElement | null>;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const primeTimerRef = useRef<number | null>(null);
  const [inputPrimed, setInputPrimed] = useState(false);
  const alliesLabel = allianceNames.length ? allianceNames.join(', ') : 'нет надежного союза';
  const councilChoicePlans = useMemo(() => pickCouncilChoicePlans(operationPlans), [operationPlans]);
  const activeOrderCount = orderCount;
  const primeCouncilInput = useCallback(
    (value: string) => {
      onInputChange(value);
      setInputPrimed(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());

      if (primeTimerRef.current) {
        window.clearTimeout(primeTimerRef.current);
      }

      primeTimerRef.current = window.setTimeout(() => {
        setInputPrimed(false);
        primeTimerRef.current = null;
      }, 1400);
    },
    [onInputChange],
  );

  useEffect(
    () => () => {
      if (primeTimerRef.current) {
        window.clearTimeout(primeTimerRef.current);
      }
    },
    [],
  );
  const chatConfig: Record<
    ChatChannel,
    {
      title: string;
      aria: string;
      placeholder: string;
      prompt: string;
      helperLabel: string;
      emptyTitle: string;
      emptyText: string;
      context: Array<{ label: string; value: string | number; tone?: 'warn' | 'danger' }>;
    }
  > = {
    council: {
      title: 'Совет правителя',
      aria: 'Контекст совета',
      placeholder: 'Приказ совету: разведать Турцию, открыть торговлю, укрепить границу...',
      prompt: `Совет, подготовь приказ по цели "${selectedCountryName}"`,
      helperLabel: 'Вставить пример распоряжения совету',
      emptyTitle: 'Совет ждёт распоряжения',
      emptyText: 'Напишите действие обычным текстом, и совет оценит риск, ресурсы и последствия.',
      context: [
        { label: 'Цель', value: selectedCountryName },
        { label: 'Ход', value: turnNumber },
        { label: 'Приказы', value: `${orderCount}/5` },
        { label: 'Мир', value: `${worldTension}/100`, tone: worldTension >= 65 ? 'danger' : worldTension >= 45 ? 'warn' : undefined },
      ],
    },
    world: {
      title: 'Мировой канал',
      aria: 'Контекст мирового канала',
      placeholder: 'Публичное заявление: Россия предлагает торговые гарантии...',
      prompt: `Россия заявляет миру: готовы обсудить безопасный маршрут с целью "${selectedCountryName}"`,
      helperLabel: 'Вставить пример публичного заявления',
      emptyTitle: 'Мир пока молчит',
      emptyText: 'Публичные сообщения видят все державы. Реакции появятся здесь и в хронике.',
      context: [
        { label: 'Видимость', value: 'все державы' },
        { label: 'Ход', value: turnNumber },
        { label: 'Фокус', value: selectedCountryName },
        { label: 'Напряжение', value: `${worldTension}/100`, tone: worldTension >= 65 ? 'danger' : worldTension >= 45 ? 'warn' : undefined },
      ],
    },
    alliance: {
      title: 'Союзный канал',
      aria: 'Контекст союзного канала',
      placeholder: 'Союзникам: согласовать охрану караванов и обмен ресурсами...',
      prompt: `Союзникам: согласовать закрытый план по цели "${selectedCountryName}"`,
      helperLabel: 'Вставить пример союзного сообщения',
      emptyTitle: 'Союзники ждут сигнала',
      emptyText: 'Этот канал закрыт для нейтральных и враждебных держав. Используйте его для координации.',
      context: [
        { label: 'Канал', value: 'закрытый' },
        { label: 'Союзники', value: alliesLabel },
        { label: 'Ход', value: turnNumber },
        { label: 'Приказы', value: `${orderCount}/5` },
      ],
    },
  };
  const config = chatConfig[activeChannel];
  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <motion.section
      className="chat-panel framed-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="chat-tabs" role="tablist" aria-label="Каналы чата">
        <b>{config.title}</b>
        {chatTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="chatMessages"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="chat-context" aria-label={config.aria}>
        {config.context.map((item) => (
          <span key={item.label} className={item.tone || undefined}>
            <b>{item.label}:</b> {item.value}
          </span>
        ))}
      </div>
      <div className={`council-decision-slot ${activeChannel === 'council' ? 'active' : ''}`} aria-live="polite">
        {activeChannel === 'council' && councilChoicePlans.length ? (
          <CouncilChoiceBoard
            plans={councilChoicePlans}
            selectedCountryName={selectedCountryName}
            worldTension={worldTension}
            currentTurn={turnNumber}
            activeOrderCount={activeOrderCount}
            onInputChange={primeCouncilInput}
            onRunPlan={onRunPlan}
            onRefinePlan={onRefinePlan}
            onDismissPlan={onDismissPlan}
          />
        ) : null}
      </div>
      <div id="chatMessages" className="chat-messages" ref={messagesRef}>
        {messages.length ? (
          messages.map((message) => (
            <p key={message.id}>
              <time>{message.time}</time>
              <span className={`flag ${message.flag}`} />
              <b>{message.faction}:</b>
              <span className="chat-text">{message.text}</span>
            </p>
          ))
        ) : (
          <div className="chat-empty">
            <b>{config.emptyTitle}</b>
            <span>{config.emptyText}</span>
          </div>
        )}
      </div>
      <form id="chatForm" className={`chat-input${inputPrimed ? ' primed' : ''}`} onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          id="chatInput"
          aria-label={config.placeholder}
          placeholder={config.placeholder}
          rows={2}
          value={input}
          onChange={(event) => {
            if (inputPrimed) setInputPrimed(false);
            onInputChange(event.currentTarget.value);
          }}
          onKeyDown={handleComposerKeyDown}
        />
        <button
          className="emoji"
          type="button"
          aria-label={config.helperLabel}
          onClick={() => primeCouncilInput(input.trim() ? input : config.prompt)}
        >
          <CircleHelp aria-hidden="true" />
        </button>
        <button className="send" type="submit" aria-label="Отправить">
          <Send aria-hidden="true" />
        </button>
      </form>
    </motion.section>
  );
}

function CouncilPriorityBrief({
  plan,
  currentTurn,
  activeOrderCount,
  onRunPlan,
  onRefinePlan,
  onDismissPlan,
}: {
  plan: OperationPlan;
  currentTurn: number;
  activeOrderCount: number;
  onRunPlan: (id: string) => void;
  onRefinePlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
}) {
  const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);
  const refinements = plan.refinements || 0;
  const canApprove = activeOrderCount < 5;
  const decision = describePlanDecision(plan, activeOrderCount, currentTurn);
  const effect = firstPlanEffect(plan);

  return (
    <article className={`council-priority ${plan.riskLevel}`} aria-label="Рекомендация Совета">
      <header>
        <span>Главная рекомендация</span>
        <b className={`plan-decision-badge ${decision.tone}`}>{decision.label}</b>
      </header>
      <div className="council-priority-copy">
        <h3>{plan.title}</h3>
        <p>{decision.reason}</p>
      </div>
      <div className="council-priority-guidance" aria-label="Подсказка по рекомендованному плану">
        <span>
          <b>Следующий шаг</b>
          {decision.nextAction}
        </span>
        <span>
          <b>Эффект</b>
          {effect}
        </span>
      </div>
      <ul className="council-priority-facts" aria-label="Параметры рекомендованного плана">
        <li>
          <span>Шанс</span>
          <b>{plan.successChance}%</b>
        </li>
        <li>
          <span>Риск</span>
          <b>{planRiskLabel(plan.riskLevel)}</b>
        </li>
        <li>
          <span>Срок</span>
          <b>{plan.durationTurns} ход</b>
        </li>
        <li title={formatResourceCost(plan.cost)}>
          <span>Цена</span>
          <b>{formatCompactResourceCost(plan.cost)}</b>
        </li>
        <li>
          <span>Окно</span>
          <b>{canApprove ? `${expiresIn} ход` : 'закрыто'}</b>
        </li>
      </ul>
      <div className="council-priority-actions">
        <button
          type="button"
          className="plan-run"
          aria-label={`Утвердить рекомендованный план: ${plan.title}`}
          onClick={() => onRunPlan(plan.id)}
          disabled={!canApprove}
        >
          Утвердить
        </button>
        <button
          type="button"
          className="plan-refine"
          aria-label={`Уточнить рекомендованный план: ${plan.title}`}
          onClick={() => onRefinePlan(plan.id)}
          disabled={refinements >= 2}
        >
          {refinements >= 2 ? 'Уточнено' : 'Уточнить'}
        </button>
        <button
          type="button"
          className="plan-dismiss"
          aria-label={`Отложить рекомендованный план: ${plan.title}`}
          onClick={() => onDismissPlan(plan.id)}
        >
          Отложить
        </button>
      </div>
    </article>
  );
}

function OrdersPanel({
  orders,
  operationPlans,
  currentTurn,
  onCancel,
  onCreateOrder,
  onRunPlan,
  onRefinePlan,
  onDismissPlan,
}: {
  orders: Order[];
  operationPlans: OperationPlan[];
  currentTurn: number;
  onCancel: (id: string) => void;
  onCreateOrder: () => void;
  onRunPlan: (id: string) => void;
  onRefinePlan: (id: string) => void;
  onDismissPlan: (id: string) => void;
}) {
  const visibleOrders = useMemo(() => orders.filter((order) => order.statusClass !== 'cancelled'), [orders]);
  const activeOrderCount = visibleOrders.length;
  const recommendedPlan = useMemo(() => pickCouncilPriorityPlan(operationPlans), [operationPlans]);
  const listedOperationPlans = useMemo(
    () => (recommendedPlan ? operationPlans.filter((plan) => plan.id !== recommendedPlan.id) : operationPlans),
    [operationPlans, recommendedPlan],
  );
  const recommendedDecision = recommendedPlan ? describePlanDecision(recommendedPlan, activeOrderCount, currentTurn) : null;
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  return (
    <motion.section
      className={`orders-panel framed-panel${operationPlans.length ? ' has-operation-plans' : ''}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-heading">
        <h2>
          Очередь решений <span>({activeOrderCount}/5)</span>
        </h2>
      </div>
      <div className="orders-panel-brief" aria-label="Состояние штаба">
        <span>
          <b>Главное:</b>{' '}
          {recommendedPlan && recommendedDecision
            ? `${recommendedDecision.label} · ${recommendedPlan.title}`
            : activeOrderCount
              ? 'наблюдать за активными приказами'
              : 'дать Совету первый замысел'}
        </span>
        <span>
          <b>Очередь:</b> {operationPlans.length ? `${operationPlans.length} план(а)` : 'нет планов'} · {activeOrderCount}/5 приказов
        </span>
      </div>
      <div className="orders-decision-scroll">
        {recommendedPlan ? (
          <CouncilPriorityBrief
            plan={recommendedPlan}
            currentTurn={currentTurn}
            activeOrderCount={activeOrderCount}
            onRunPlan={onRunPlan}
            onRefinePlan={onRefinePlan}
            onDismissPlan={onDismissPlan}
          />
        ) : null}
        {listedOperationPlans.length ? (
          <section className="operation-plans" aria-label="Оперативные планы">
            <header>
              <b>Предложения Совета</b>
              <small>{operationPlans.length}/4 ожидают решения</small>
            </header>
            <div className="operation-plan-list">
              {listedOperationPlans.map((plan) => {
                const Icon = orderIcons[plan.iconKey];
                const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);
                const refinements = plan.refinements || 0;
                const decision = describePlanDecision(plan, activeOrderCount, currentTurn);
                const effect = firstPlanEffect(plan);

                return (
                  <article
                    key={plan.id}
                    className={`operation-plan ${plan.riskLevel}`}
                    title={plan.sourceText ? `Основание: ${plan.sourceText}` : undefined}
                  >
                    <span className="operation-plan-icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <div className="operation-plan-head">
                        <span>{councilChoiceRole(plan)}</span>
                        <b className={`plan-decision-badge ${decision.tone}`}>{decision.label}</b>
                      </div>
                      <h3>{plan.title}</h3>
                      <p>{decision.nextAction}</p>
                      <small className="operation-plan-effect">{effect}</small>
                      <div className="operation-plan-metrics" aria-label={`Параметры плана: ${plan.title}`}>
                        <span title={plan.advisor}>{plan.advisor}</span>
                        <span>шанс {plan.successChance}%</span>
                        <span>{planRiskLabel(plan.riskLevel)}</span>
                        <span title={formatResourceCost(plan.cost)}>{formatCompactResourceCost(plan.cost)}</span>
                        <span>окно {expiresIn} ход</span>
                      </div>
                    </div>
                    <div className="operation-plan-actions">
                      <button
                        type="button"
                        className="plan-run"
                        aria-label={`Утвердить предложение: ${plan.title}`}
                        title={activeOrderCount >= 5 ? 'Лимит активных приказов заполнен' : undefined}
                        onClick={() => onRunPlan(plan.id)}
                        disabled={activeOrderCount >= 5}
                      >
                        Утвердить приказ
                      </button>
                      <button
                        type="button"
                        className="plan-refine"
                        aria-label={`Уточнить предложение: ${plan.title}`}
                        onClick={() => onRefinePlan(plan.id)}
                        disabled={refinements >= 2}
                      >
                        {refinements >= 2 ? 'Уточнено' : 'Уточнить'}
                      </button>
                      <button
                        type="button"
                        className="plan-dismiss"
                        aria-label={`Отложить предложение: ${plan.title}`}
                        onClick={() => onDismissPlan(plan.id)}
                      >
                        Отложить
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
        <div className="orders-list">
          {!visibleOrders.length && !operationPlans.length ? (
            <article className="orders-empty" aria-label="Нет активных приказов">
              <Flag aria-hidden="true" />
              <h3>Нет активных приказов</h3>
              <p>Напишите совету распоряжение или утвердите один из предложенных планов.</p>
            </article>
          ) : null}
          {visibleOrders.map((order) => {
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
      </div>
      <button className="create-order" type="button" onClick={onCreateOrder}>
        <Plus aria-hidden="true" />
        Подготовить приказ
      </button>
    </motion.section>
  );
}

function OperationPlanDossierDialog({
  plan,
  resources,
  activeOrderCount,
  currentTurn,
  onClose,
  onApprove,
  onRefine,
  onDismiss,
}: {
  plan: OperationPlan;
  resources: ResourceState[];
  activeOrderCount: number;
  currentTurn: number;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRefine: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = orderIcons[plan.iconKey];
  const expiresIn = Math.max(0, plan.expiresTurn - currentTurn);
  const refinements = plan.refinements || 0;
  const blockReason = operationPlanApprovalBlockReason(plan, resources, activeOrderCount);
  const canApprove = !blockReason && canPay(resources, plan.cost);
  const readiness = canApprove ? 'Готов к утверждению' : 'Нужна подготовка';
  const approvalHint = blockReason || 'После утверждения приказ появится в списке активных и начнёт выполняться со следующего хода.';

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`operation-plan-dialog framed-panel ${plan.riskLevel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operationPlanDossierTitle"
      >
        <header className="dialog-heading plan-dossier-heading">
          <span className="plan-dossier-emblem" aria-hidden="true">
            <Icon />
          </span>
          <div>
            <small>Штабное досье приказа</small>
            <h2 id="operationPlanDossierTitle">{plan.title}</h2>
            <p>
              Цель: {plan.target} · Исполнитель: {plan.advisor}
            </p>
          </div>
          <strong>{readiness}</strong>
          <button type="button" className="dialog-close" aria-label="Закрыть досье приказа" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="operation-plan-dialog-body">
          <section className="plan-dossier-brief">
            <p>{plan.summary}</p>
            <p>{operationPlanDoctrine(plan)}</p>
          </section>

          <dl className="plan-dossier-metrics">
            <div>
              <dt>Шанс</dt>
              <dd>{plan.successChance}%</dd>
            </div>
            <div>
              <dt>Риск</dt>
              <dd>{planRiskLabel(plan.riskLevel)}</dd>
            </div>
            <div>
              <dt>Срок</dt>
              <dd>{plan.durationTurns} ход</dd>
            </div>
            <div>
              <dt>Окно</dt>
              <dd>{expiresIn} ход</dd>
            </div>
            <div>
              <dt>Цена</dt>
              <dd title={formatResourceCost(plan.cost)}>{formatResourceCost(plan.cost)}</dd>
            </div>
            <div>
              <dt>Награда</dt>
              <dd title={formatResourceCost(plan.reward || {})}>{formatResourceDelta(plan.reward || {})}</dd>
            </div>
          </dl>

          <div className="plan-dossier-outcomes">
            <article>
              <span>Успех</span>
              <h3>Ожидаемый результат</h3>
              <p>{plan.completeText}</p>
            </article>
            <article className={plan.riskLevel === 'high' || plan.riskLevel === 'critical' ? 'danger' : 'warning'}>
              <span>Провал</span>
              <h3>Если приказ сорвётся</h3>
              <p>{plan.failureText}</p>
            </article>
          </div>

          <section className="plan-dossier-effects">
            <h3>Что изменится</h3>
            <dl>
              <div>
                <dt>Ресурсы при успехе</dt>
                <dd>{formatResourceDelta(plan.reward || {})}</dd>
              </div>
              <div>
                <dt>Ресурсы при провале</dt>
                <dd>{formatResourceDelta(plan.failureCost || {})}</dd>
              </div>
              <div>
                <dt>Дипломатия при успехе</dt>
                <dd>{formatDiplomacyDelta(plan.diplomacyDelta)}</dd>
              </div>
              <div>
                <dt>Дипломатия при провале</dt>
                <dd>{formatDiplomacyDelta(plan.failureDiplomacyDelta)}</dd>
              </div>
              <div>
                <dt>Досье при успехе</dt>
                <dd>{formatNationDelta(plan.nationDelta)}</dd>
              </div>
              <div>
                <dt>Досье при провале</dt>
                <dd>{formatNationDelta(plan.failureNationDelta)}</dd>
              </div>
            </dl>
          </section>

          {plan.sourceText ? (
            <aside className="plan-dossier-source">
              <span>Основание</span>
              <p>{plan.sourceText}</p>
            </aside>
          ) : null}
        </div>

        <footer className="dialog-footer plan-dossier-actions">
          <span>{approvalHint}</span>
          <div>
            <button type="button" className="dialog-secondary" onClick={() => onRefine(plan.id)} disabled={refinements >= 2}>
              {refinements >= 2 ? 'Уточнено' : 'Уточнить план'}
            </button>
            <button type="button" className="dialog-secondary muted" onClick={() => onDismiss(plan.id)}>
              Отложить
            </button>
            <button type="button" className="dialog-secondary primary" onClick={() => onApprove(plan.id)} disabled={!canApprove}>
              Утвердить приказ
            </button>
          </div>
        </footer>
      </section>
    </div>
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
          Совет подготовит инфраструктурный приказ для цели: <b>{selectedCountryName}</b>. Сначала он появится в предложениях Совета;
          ресурсы спишутся только после утверждения, а результат появится в хронике после завершения хода.
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

type LetterEntry = {
  letter: Letter;
  index: number;
  id: string;
};

type ChronicleEntry = {
  id: string;
  kind: 'world' | 'timeline';
  title: string;
  text: string;
  time: string;
  tone: string;
  icon?: string;
  flag?: string;
  actor?: string;
  turn?: number;
  impact?: WorldEvent['impact'];
};

function chronicleToneLabel(tone: string) {
  if (tone === 'red') return 'Кризис';
  if (tone === 'green') return 'Успех';
  if (tone === 'blue') return 'Сводка';
  if (tone === 'bronze') return 'Внимание';
  return 'Событие';
}

function chronicleImpactLabel(impact?: WorldEvent['impact']) {
  if (impact === 'trade') return 'Торговля';
  if (impact === 'military') return 'Военное давление';
  if (impact === 'diplomacy') return 'Дипломатия';
  if (impact === 'economy') return 'Экономика';
  if (impact === 'stability') return 'Стабильность';
  if (impact === 'threat') return 'Угроза';
  return 'Общая хроника';
}

function chronicleAdvice(entry: ChronicleEntry) {
  if (entry.tone === 'red' || entry.impact === 'threat' || entry.impact === 'military') {
    return 'Событие может ухудшить безопасность или отношения. Стоит проверить приказы, дипломатические связи и давление соседей.';
  }

  if (entry.impact === 'trade' || entry.tone === 'green') {
    return 'Событие можно использовать как окно возможностей: торговля, дипломатия или новый приказ могут усилить позицию державы.';
  }

  if (entry.tone === 'bronze') {
    return 'Событие требует наблюдения. Оно не ломает ход сразу, но может стать проблемой, если оставить его без реакции.';
  }

  return 'Событие зафиксировано в хронике. Оно помогает понять, почему меняются письма, отношения, ресурсы и намерения держав.';
}

function ChronicleDialog({ entry, onClose }: { entry: ChronicleEntry; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`chronicle-dialog framed-panel ${entry.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chronicleDialogTitle"
        aria-describedby="chronicleDialogBody"
      >
        <header className="dialog-heading">
          {entry.flag ? <span className={`flag ${entry.flag}`} /> : <span className={`event-icon ${entry.tone}`}>{entry.icon || '•'}</span>}
          <div>
            <small>{entry.kind === 'world' ? 'Событие мира' : 'Запись хроники'}</small>
            <h2 id="chronicleDialogTitle">{entry.title}</h2>
            <p>{entry.actor || chronicleImpactLabel(entry.impact)}</p>
          </div>
          <em>{entry.time}</em>
          <button ref={closeRef} type="button" className="dialog-close" aria-label="Закрыть запись хроники" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="chronicle-dialog-body" id="chronicleDialogBody">
          <p>{entry.text}</p>
          <dl className="chronicle-dialog-metrics">
            <div>
              <dt>Тип</dt>
              <dd>{chronicleToneLabel(entry.tone)}</dd>
            </div>
            <div>
              <dt>Сфера</dt>
              <dd>{chronicleImpactLabel(entry.impact)}</dd>
            </div>
            <div>
              <dt>Источник</dt>
              <dd>{entry.actor || 'Канцелярия'}</dd>
            </div>
          </dl>
          <section className="chronicle-dialog-meaning">
            <h3>Что это значит</h3>
            <p>{chronicleAdvice(entry)}</p>
          </section>
        </div>
        <footer className="dialog-footer">
          <span>Хроника связывает карту, письма, приказы и дипломатию в одну игровую ленту.</span>
          <button type="button" className="dialog-secondary" onClick={onClose}>
            Понятно
          </button>
        </footer>
      </section>
    </div>
  );
}

function ChronicleArchiveDialog({ entries, onOpenEntry, onClose }: { entries: ChronicleEntry[]; onOpenEntry: (id: string) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="chronicle-archive-dialog framed-panel" role="dialog" aria-modal="true" aria-labelledby="chronicleArchiveTitle">
        <header className="dialog-heading">
          <span className="event-icon bronze">◆</span>
          <div>
            <small>Архив сводок</small>
            <h2 id="chronicleArchiveTitle">Хроника мира</h2>
            <p>{entries.length} последних записей</p>
          </div>
          <em>обзор</em>
          <button ref={closeRef} type="button" className="dialog-close" aria-label="Закрыть архив хроники" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="chronicle-archive-list">
          {entries.map((entry) => (
            <button key={entry.id} type="button" className={`chronicle-archive-row ${entry.tone}`} onClick={() => onOpenEntry(entry.id)}>
              {entry.flag ? <span className={`flag ${entry.flag}`} /> : <span className={`event-icon ${entry.tone}`}>{entry.icon || '•'}</span>}
              <div>
                <b>{entry.title}</b>
                <p>{entry.text}</p>
              </div>
              <time>{entry.time}</time>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function LetterDialog({
  entry,
  responses,
  onRespond,
  onClose,
}: {
  entry: LetterEntry;
  responses: LetterResponseOption[];
  onRespond: (letterId: string, responseId: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { letter, id } = entry;
  const isAnswered = letter.status === 'answered';
  const statusLabel = isAnswered ? letter.answeredBy || 'решено' : 'ожидает ответа';

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`letter-dialog framed-panel ${isAnswered ? 'answered' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="letterDialogTitle"
        aria-describedby="letterDialogBody"
      >
        <header className="dialog-heading">
          <CountryFlagMark
            countryKey={countryKeyByLocalizedName[letter.from]}
            countryName={letter.from}
            fallbackFlag={countryKeyByLocalizedName[letter.from]}
          />
          <div>
            <small>Входящее письмо</small>
            <h2 id="letterDialogTitle">{letter.subject}</h2>
            <p>{letter.from}</p>
          </div>
          <em>{statusLabel}</em>
          <button ref={closeRef} type="button" className="dialog-close" aria-label="Закрыть письмо" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="letter-dialog-body">
          <p id="letterDialogBody">
            {letter.body || `Канцелярия ждёт решения по письму "${letter.subject}". Выберите ответ, который реально изменит состояние партии.`}
          </p>
          <div className="letter-dialog-responses" aria-label="Варианты ответа на письмо">
            {responses.map((response) => (
              <button
                key={response.id}
                type="button"
                className={`letter-dialog-response ${response.tone}`}
                disabled={isAnswered}
                aria-label={`Ответить на письмо: ${response.label}`}
                onClick={() => onRespond(id, response.id)}
              >
                <span>{response.label}</span>
                <small>{response.summary}</small>
              </button>
            ))}
          </div>
        </div>
        <footer className="dialog-footer">
          <span>{isAnswered ? 'Решение принято. Письмо останется в архиве входящих.' : 'Ответ сразу попадёт в хронику и изменит дипломатию или ресурсы.'}</span>
          <button type="button" className="dialog-secondary" onClick={onClose}>
            {isAnswered ? 'Готово' : 'Закрыть'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function DiplomacyDialog({ item, nation, onClose }: { item: DiplomacyRelation; nation?: NationProfile; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const pressure = nation?.pressure ?? diplomacyFallbackPressure(item.score);
  const threat = nation?.threat ?? clampStat(pressure + (item.score < -20 ? 12 : -8));
  const stability = nation?.stability ?? clampStat(72 - Math.max(0, pressure - 32));
  const pressureTone = diplomacyPressureTone(pressure);
  const pressureStyle = { '--value': `${pressure}%` } as CSSProperties;
  const intentView = nation
    ? getVisibleIntent(nation.currentIntent, item.score, item.tone)
    : {
        tone: 'unknown',
        label: 'Досье',
        title: 'Сводка ожидает разведку',
        summary: 'Канцелярия видит отношения, но точное давление и ближайшие цели пока не подтверждены.',
        meta: 'нет донесения',
      };

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`diplomacy-dialog framed-panel ${pressureTone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diplomacyDialogTitle"
        aria-describedby="diplomacyDialogBody"
      >
        <header className="dialog-heading diplomacy-dialog-heading">
          <CountryFlagMark countryName={item.name} fallbackFlag={item.flag} />
          <div>
            <small>Дипломатическое досье</small>
            <h2 id="diplomacyDialogTitle">{item.name}</h2>
            <p>{item.status}</p>
          </div>
          <strong>{item.score > 0 ? `+${item.score}` : item.score}</strong>
          <button ref={closeRef} type="button" className="dialog-close text-close" aria-label={`Закрыть досье: ${item.name}`} onClick={onClose}>
            Закрыть досье
          </button>
        </header>
        <div className="diplomacy-dialog-body" id="diplomacyDialogBody">
          <section className="dialog-meter" aria-label={`Давление: ${pressure} из 100`}>
            <div>
              <span>{diplomacyPressureLabel(pressure)}</span>
              <b>{pressure}/100</b>
            </div>
            <i style={pressureStyle} aria-hidden="true" />
          </section>
          <dl className="diplomacy-dialog-metrics">
            <div>
              <dt>Угроза</dt>
              <dd>{threat}/100</dd>
            </div>
            <div>
              <dt>Устойчивость</dt>
              <dd>{stability}/100</dd>
            </div>
            <div>
              <dt>Фокус</dt>
              <dd>{nation ? focusLabels[nation.focus] : 'не раскрыт'}</dd>
            </div>
          </dl>
          <p className="diplomacy-dialog-activity">
            {nation?.lastAction || 'Открытых донесений пока мало: нужны дипломатия, торговля или разведка.'}
          </p>
          <section className={`diplomacy-dialog-intent ${intentView.tone}`}>
            <small>{intentView.label}</small>
            <h3>{intentView.title}</h3>
            <p>{intentView.summary}</p>
            <em>{intentView.meta}</em>
          </section>
          {nation?.goals.length ? (
            <section className="diplomacy-dialog-goals">
              <h3>Наблюдаемые цели</h3>
              <ul aria-label={`Цели державы: ${item.name}`}>
                {nation.goals.slice(0, 4).map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <footer className="dialog-footer note-only">
          <span>Досье обновляется через игровые действия: дипломатия, разведка, торговля и завершение хода.</span>
        </footer>
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
  const [openChronicleId, setOpenChronicleId] = useState<string | null>(null);
  const [isChronicleArchiveOpen, setIsChronicleArchiveOpen] = useState(false);
  const [openLetterId, setOpenLetterId] = useState<string | null>(null);
  const [openDiplomacyName, setOpenDiplomacyName] = useState<string | null>(null);
  const chronicleEntries = useMemo<ChronicleEntry[]>(() => {
    const entries: ChronicleEntry[] = [];

    if (latestWorldEvent) {
      entries.push({
        id: `world-${latestWorldEvent.id}`,
        kind: 'world',
        title: latestWorldEvent.title,
        text: latestWorldEvent.text,
        time: `ход ${latestWorldEvent.turn}`,
        tone: latestWorldEvent.tone,
        flag: latestWorldEvent.flag,
        actor: latestWorldEvent.actor,
        turn: latestWorldEvent.turn,
        impact: latestWorldEvent.impact,
      });
    }

    timeline.slice(0, latestWorldEvent ? 6 : 7).forEach((event, index) => {
      entries.push({
        id: `timeline-${index}-${event.title}-${event.time}`,
        kind: 'timeline',
        title: event.title,
        text: event.text,
        time: event.time,
        tone: event.tone,
        icon: event.icon,
      });
    });

    return entries;
  }, [latestWorldEvent, timeline]);
  const letterEntries = useMemo<LetterEntry[]>(
    () =>
      letters.map((letter, index) => ({
        letter,
        index,
        id: getLetterRuntimeId(letter, index),
      })),
    [letters],
  );
  const openLetterEntry = openLetterId ? letterEntries.find((entry) => entry.id === openLetterId) || null : null;
  const openLetterResponses = openLetterEntry ? getLetterResponseOptions(openLetterEntry.letter) : [];
  const openChronicleEntry = openChronicleId ? chronicleEntries.find((entry) => entry.id === openChronicleId) || null : null;
  const openDiplomacyItem = openDiplomacyName ? diplomacy.find((item) => item.name === openDiplomacyName) || null : null;
  const openDiplomacyNation = openDiplomacyItem ? nations.find((entry) => entry.name === openDiplomacyItem.name) : undefined;

  useEffect(() => {
    if (!openChronicleId || chronicleEntries.some((entry) => entry.id === openChronicleId)) return;
    setOpenChronicleId(null);
  }, [chronicleEntries, openChronicleId]);

  useEffect(() => {
    if (!openLetterId || letterEntries.some((entry) => entry.id === openLetterId)) return;
    setOpenLetterId(null);
  }, [letterEntries, openLetterId]);

  useEffect(() => {
    if (!openDiplomacyName || diplomacy.some((item) => item.name === openDiplomacyName)) return;
    setOpenDiplomacyName(null);
  }, [diplomacy, openDiplomacyName]);

  return (
    <>
    <motion.aside
      className="side-panel right-panel"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <section className="timeline-panel framed-panel compact">
        <div className="panel-heading">
          <h2>Сводка мира</h2>
          <button type="button" aria-haspopup="dialog" onClick={() => setIsChronicleArchiveOpen(true)}>
            Смотреть все
          </button>
        </div>
        <div className="timeline-list">
          {chronicleEntries.map((entry) => (
            <article key={entry.id} className={`${entry.kind === 'world' ? 'world-pulse-row' : ''}${openChronicleId === entry.id ? ' selected' : ''}`}>
              <button
                type="button"
                className="timeline-row-button"
                aria-haspopup="dialog"
                aria-expanded={openChronicleId === entry.id}
                onClick={() => setOpenChronicleId(entry.id)}
              >
                {entry.flag ? <span className={`flag ${entry.flag}`} /> : <span className={`event-icon ${entry.tone}`}>{entry.icon}</span>}
                <div>
                  {entry.kind === 'world' ? <span className="timeline-kind">Главное событие</span> : null}
                  <h3>{entry.title}</h3>
                  <p>{entry.text}</p>
                </div>
                <time>{entry.time}</time>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="mail-panel framed-panel compact">
        <div className="panel-heading">
          <h2>
            Канцелярия <span>{letters.length}</span>
          </h2>
          <button type="button" aria-label="Написать письмо" onClick={onComposeLetter}>
            Написать
          </button>
        </div>
        <div className="mail-list" aria-label="Список входящих писем">
          {letterEntries.map(({ letter, id }) => {
            const isSelected = openLetterId === id;
            const isAnswered = letter.status === 'answered';

            return (
              <article
                key={id}
                className={`mail-item${isSelected ? ' selected' : ''}${isAnswered ? ' answered' : ''}`}
              >
                <button
                  type="button"
                  className="mail-row-button"
                  aria-haspopup="dialog"
                  aria-expanded={isSelected}
                  onClick={() => setOpenLetterId(id)}
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
        <button className="show-all" type="button" onClick={() => showToast('Показать все письма')}>
          Показать все письма
        </button>
      </section>

      <section className="diplomacy-panel framed-panel compact">
        <div className="panel-heading">
          <h2>Державы</h2>
          <button type="button" onClick={() => showToast('Смотреть все')}>
            Смотреть все
          </button>
        </div>
        <ul>
          {diplomacy.map((item) => {
            const nation = nations.find((entry) => entry.name === item.name);
            const isOpen = openDiplomacyName === item.name;
            const pressure = nation?.pressure ?? diplomacyFallbackPressure(item.score);

            return (
              <li key={item.name} className={isOpen ? 'selected' : ''}>
                <button
                  type="button"
                  className="diplomacy-row"
                  aria-haspopup="dialog"
                  aria-expanded={isOpen}
                  onClick={() => setOpenDiplomacyName(item.name)}
                >
                  <CountryFlagMark countryName={item.name} fallbackFlag={item.flag} />
                  <b>{item.name}</b>
                  <em className={item.tone}>{item.status}</em>
                  <strong className={`relation-score ${item.tone}`} title={`Индекс отношений с Россией: ${item.score > 0 ? `+${item.score}` : item.score}`}>
                    <span>Отн.</span>
                    <b>{item.score > 0 ? `+${item.score}` : item.score}</b>
                  </strong>
                  <small>
                    <span>{`Давление ${pressure}/100`}</span>
                    <i>{nation?.lastAction || 'Досье ожидает разведданных'}</i>
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </motion.aside>
    {openChronicleEntry ? <ChronicleDialog entry={openChronicleEntry} onClose={() => setOpenChronicleId(null)} /> : null}
    {isChronicleArchiveOpen ? (
      <ChronicleArchiveDialog
        entries={chronicleEntries}
        onOpenEntry={(id) => {
          setIsChronicleArchiveOpen(false);
          setOpenChronicleId(id);
        }}
        onClose={() => setIsChronicleArchiveOpen(false)}
      />
    ) : null}
    {openLetterEntry ? (
      <LetterDialog
        entry={openLetterEntry}
        responses={openLetterResponses}
        onRespond={onRespondLetter}
        onClose={() => setOpenLetterId(null)}
      />
    ) : null}
    {openDiplomacyItem ? (
      <DiplomacyDialog item={openDiplomacyItem} nation={openDiplomacyNation} onClose={() => setOpenDiplomacyName(null)} />
    ) : null}
    </>
  );
}

export default App;
