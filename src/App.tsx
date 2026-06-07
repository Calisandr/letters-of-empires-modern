import { FormEvent, MouseEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ToastState = {
  message: string;
};

type ChatMessage = {
  id: number;
  time: string;
  faction: string;
  flag: string;
  text: string;
};

type ResourceId = 'gold' | 'wood' | 'stone' | 'iron' | 'grain' | 'population';
type QuickActionId = 'compose-letter' | 'create-order' | 'manage-lands' | 'trade-routes' | 'recruit-army' | 'diplomacy';
type DiplomacyTone = 'ally' | 'friendly' | 'neutral' | 'risk' | 'hostile';

type ResourceState = {
  id: ResourceId;
  label: string;
  value: number;
  perTurn: number;
  format: 'integer' | 'population';
};

type ResourceDelta = Partial<Record<ResourceId, number>>;

type Order = {
  id: string;
  icon: LucideIcon;
  title: string;
  owner: string;
  target: string;
  status: string;
  statusClass: string;
  due: string;
  remainingTurns: number;
  totalTurns: number;
  cost?: ResourceDelta;
  reward?: ResourceDelta;
  diplomacyDelta?: Record<string, number>;
  completeText: string;
};

type TimelineEvent = {
  icon: string;
  tone: string;
  title: string;
  text: string;
  time: string;
};

type Letter = {
  tone: string;
  from: string;
  subject: string;
  time: string;
};

type DiplomacyRelation = {
  flag: string;
  name: string;
  status: string;
  tone: DiplomacyTone;
  score: number;
};

const navItems = [
  { label: 'Карта мира', icon: MapIcon },
  { label: 'Письма', icon: Mail, badge: 6 },
  { label: 'Приказы', icon: Flag },
  { label: 'Хроника', icon: MessageSquare },
  { label: 'Договоры', icon: Landmark },
  { label: 'Фракции', icon: Shield },
  { label: 'Настройки', icon: CircleHelp },
];

const mapModes = [
  { title: 'Политическая карта', className: '' },
  { title: 'Торговая карта', className: 'trade-mode' },
  { title: 'Стратегическая карта', className: 'strategy-mode' },
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

const playerCountry = {
  name: 'Россия',
  flag: 'russia',
};

const initialResources: ResourceState[] = [
  { id: 'gold', label: 'Золото', value: 12540, perTurn: 1250, format: 'integer' },
  { id: 'wood', label: 'Дерево', value: 8760, perTurn: 720, format: 'integer' },
  { id: 'stone', label: 'Камень', value: 6410, perTurn: 610, format: 'integer' },
  { id: 'iron', label: 'Железо', value: 7230, perTurn: 560, format: 'integer' },
  { id: 'grain', label: 'Зерно', value: 9850, perTurn: 1100, format: 'integer' },
  { id: 'population', label: 'Население', value: 146.2, perTurn: 0.8, format: 'population' },
];

const quickActions: Array<{ id: QuickActionId; label: string; icon: LucideIcon; toast?: string }> = [
  { id: 'compose-letter', label: 'Написать письмо', icon: Mail },
  { id: 'create-order', label: 'Создать приказ', icon: Flag },
  { id: 'manage-lands', label: 'Управление землями', icon: Landmark },
  { id: 'trade-routes', label: 'Торговые маршруты', icon: Anchor },
  { id: 'recruit-army', label: 'Набор войск', icon: Shield },
  { id: 'diplomacy', label: 'Дипломатия', icon: Handshake, toast: 'Дипломатические переговоры' },
];

const oncePerTurnQuickActions = new Set<QuickActionId>(['compose-letter', 'manage-lands', 'diplomacy']);

const initialChatMessages: ChatMessage[] = [
  {
    id: 1,
    time: '12:45',
    flag: 'france',
    faction: 'Франция',
    text: 'Кто заинтересован в совместной торговле редкими ресурсами?',
  },
  {
    id: 2,
    time: '12:45',
    flag: 'turkey',
    faction: 'Турция',
    text: 'Мы открыты к переговорам по новому маршруту через Черное море.',
  },
  {
    id: 3,
    time: '12:46',
    flag: 'russia',
    faction: 'Россия',
    text: 'Нужно обсудить долгосрочные поставки железа и зерна.',
  },
  {
    id: 4,
    time: '12:47',
    flag: 'india',
    faction: 'Индия',
    text: 'Внимание всем! На наши земли совершено нападение пиратов.',
  },
  {
    id: 5,
    time: '12:47',
    flag: 'germany',
    faction: 'Германия',
    text: 'Предлагаю заключить пакт о ненападении между нашими странами.',
  },
];

const initialOrders: Order[] = [
  {
    id: 'trade-india',
    icon: Package,
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
    icon: Swords,
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
  },
  {
    id: 'kuzbass-mines',
    icon: Pickaxe,
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

const initialTimeline: TimelineEvent[] = [
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

const initialLetters: Letter[] = [
  { tone: 'neutral', from: 'Франция', subject: 'Торговое предложение', time: '5 мин. назад' },
  { tone: 'red', from: 'Турция', subject: 'Дипломатический запрос', time: '32 мин. назад' },
  { tone: 'burgundy', from: 'Германия', subject: 'Военный союз', time: '1 час назад' },
  { tone: 'gold', from: 'Китай', subject: 'Граница и торговля', time: '2 часа назад' },
  { tone: 'blue', from: 'Аргентина', subject: 'Обмен ресурсами', time: '3 часа назад' },
];

const initialDiplomacy: DiplomacyRelation[] = [
  { flag: 'china', name: 'Китай', status: 'Союзники', tone: 'ally', score: 165 },
  { flag: 'india', name: 'Индия', status: 'Союзники', tone: 'ally', score: 120 },
  { flag: 'france', name: 'Франция', status: 'Дружественные', tone: 'friendly', score: 75 },
  { flag: 'turkey', name: 'Турция', status: 'Нейтральные', tone: 'neutral', score: 10 },
  { flag: 'germany', name: 'Германия', status: 'Нейтральные', tone: 'neutral', score: 5 },
  { flag: 'japan', name: 'Япония', status: 'Риск конфликта', tone: 'risk', score: -25 },
  { flag: 'ukraine', name: 'Украина', status: 'Враждебные', tone: 'hostile', score: -80 },
];

const formatClock = (value: number) => {
  const h = String(Math.floor(value / 3600)).padStart(2, '0');
  const m = String(Math.floor((value % 3600) / 60)).padStart(2, '0');
  const s = String(value % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

function formatOrderDue(turns: number) {
  if (turns <= 0) return 'готово';
  if (turns === 1) return '1 день';
  if (turns < 5) return `${turns} дня`;
  return `${turns} дней`;
}

function formatResourceValue(resource: ResourceState) {
  if (resource.format === 'population') return `${resource.value.toFixed(1)}M`;
  return Math.round(resource.value).toLocaleString('ru-RU');
}

function formatResourceTrend(resource: ResourceState) {
  const sign = resource.perTurn >= 0 ? '+' : '';
  if (resource.format === 'population') return `${sign}${resource.perTurn.toFixed(1)}%`;
  return `${sign}${Math.round(resource.perTurn).toLocaleString('ru-RU')}/ход`;
}

function applyResourceDelta(resources: ResourceState[], delta: ResourceDelta = {}) {
  return resources.map((resource) => {
    const change = delta[resource.id] ?? 0;
    if (!change) return resource;

    return {
      ...resource,
      value: Math.max(0, Number((resource.value + change).toFixed(resource.format === 'population' ? 1 : 0))),
    };
  });
}

function canPay(resources: ResourceState[], cost: ResourceDelta = {}) {
  return resources.every((resource) => (cost[resource.id] ?? 0) <= resource.value);
}

function describeResourceCost(resources: ResourceState[], cost: ResourceDelta = {}) {
  return resources
    .filter((resource) => cost[resource.id])
    .map((resource) => `${resource.label}: ${Math.round(cost[resource.id] ?? 0).toLocaleString('ru-RU')}`)
    .join(', ');
}

function relationTone(score: number): DiplomacyTone {
  if (score >= 100) return 'ally';
  if (score >= 50) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'risk';
  return 'hostile';
}

function relationStatus(score: number) {
  const tone = relationTone(score);
  if (tone === 'ally') return 'Союзники';
  if (tone === 'friendly') return 'Дружественные';
  if (tone === 'neutral') return 'Нейтральные';
  if (tone === 'risk') return 'Риск конфликта';
  return 'Враждебные';
}

function applyDiplomacyDelta(relations: DiplomacyRelation[], delta: Record<string, number> = {}) {
  return relations.map((relation) => {
    const change = delta[relation.name] ?? 0;
    if (!change) return relation;

    const score = Math.max(-100, Math.min(200, relation.score + change));
    return {
      ...relation,
      score,
      status: relationStatus(score),
      tone: relationTone(score),
    };
  });
}

const getCountryElement = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return null;
  return target.closest('.country') as SVGElement | null;
};

const WorldMapLayer = memo(function WorldMapLayer({
  zoom,
  mapSvgRef,
}: {
  zoom: number;
  mapSvgRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      id="mapZoomLayer"
      className="map-zoom-layer"
      ref={mapSvgRef}
      style={{ transform: `scale(${zoom.toFixed(2)})` }}
      dangerouslySetInnerHTML={{ __html: worldMapSvg }}
    />
  );
});

function App() {
  const [activeNav, setActiveNav] = useState('Карта мира');
  const [routesVisible, setRoutesVisible] = useState(true);
  const [mapModeIndex, setMapModeIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatInput, setChatInput] = useState('');
  const [resources, setResources] = useState<ResourceState[]>(initialResources);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(initialTimeline);
  const [letters, setLetters] = useState<Letter[]>(initialLetters);
  const [diplomacy, setDiplomacy] = useState<DiplomacyRelation[]>(initialDiplomacy);
  const [quickActionTurns, setQuickActionTurns] = useState<Partial<Record<QuickActionId, number>>>({});
  const [turnNumber, setTurnNumber] = useState(123);
  const [secondsLeft, setSecondsLeft] = useState(18 * 3600 + 42 * 60 + 31);
  const [toast, setToast] = useState<ToastState | null>(null);

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
  const actionIdRef = useRef(0);

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
    showToast(`Раздел "${label}" выбран`);
  };

  const handleMapModeClick = () => {
    const nextIndex = (mapModeIndex + 1) % mapModes.length;
    setMapModeIndex(nextIndex);
    showToast(`Включен режим: ${mapModes[nextIndex].title}`);
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

    if (activeTooltipCountryRef.current !== sourceName) {
      const title = tooltipNode.querySelector('strong');
      const subtitle = tooltipNode.querySelector('small');

      if (title) title.textContent = countryNames[sourceName] || sourceName;
      if (subtitle) subtitle.textContent = statusText[status] || statusText.common;

      activeTooltipCountryRef.current = sourceName;
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

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const country = getCountryElement(event.target);
    if (!country) return;

    const sourceName = country.dataset.name || '';
    const name = countryNames[sourceName] || sourceName;

    if (selectedCountryRef.current && selectedCountryRef.current !== country) {
      selectedCountryRef.current.classList.remove('selected');
    }

    country.classList.add('selected');
    selectedCountryRef.current = country;

    showToast(`Выбрана страна: ${name}`);
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
    if (!text) return;

    const time = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    setChatMessages((messages) => [
      ...messages,
      {
        id: Date.now(),
        time,
        flag: 'russia',
        faction: 'Россия',
        text,
      },
    ]);
    setChatInput('');
  };

  const pushTimeline = useCallback((event: Omit<TimelineEvent, 'time'> & { time?: string }) => {
    const nextEvent = { ...event, time: event.time || 'только что' };

    setTimelineEvents((events) => {
      const latest = events[0];
      if (latest?.title === nextEvent.title && latest.text === nextEvent.text) {
        return [{ ...latest, time: nextEvent.time }, ...events.slice(1)];
      }

      return [nextEvent, ...events].slice(0, 5);
    });
  }, []);

  const pushLetter = useCallback((letter: Letter) => {
    setLetters((items) => {
      const latest = items[0];
      if (latest?.from === letter.from && latest.subject === letter.subject) {
        return [{ ...latest, time: letter.time }, ...items.slice(1)];
      }

      return [letter, ...items].slice(0, 5);
    });
  }, []);

  const createStrategicOrder = useCallback(
    (order: Omit<Order, 'id' | 'status' | 'statusClass' | 'due'>) => {
      const activeOrderCount = orders.filter((item) => item.statusClass !== 'cancelled').length;

      if (activeOrderCount >= 5) {
        showToast('Лимит приказов заполнен');
        return false;
      }

      if (!canPay(resources, order.cost)) {
        showToast(`Не хватает ресурсов: ${describeResourceCost(resources, order.cost)}`);
        return false;
      }

      actionIdRef.current += 1;
      setResources((current) => {
        const costDelta = Object.fromEntries(
          Object.entries(order.cost || {}).map(([key, value]) => [key, -value]),
        ) as ResourceDelta;
        return applyResourceDelta(current, costDelta);
      });
      setOrders((current) => [
        ...current,
        {
          ...order,
          id: `player-order-${Date.now()}-${actionIdRef.current}`,
          status: order.remainingTurns <= 1 ? 'В работе' : 'В пути',
          statusClass: order.remainingTurns <= 1 ? 'progress' : 'moving',
          due: formatOrderDue(order.remainingTurns),
        },
      ]);
      pushTimeline({
        icon: '⚑',
        tone: 'blue',
        title: 'Новый приказ принят',
        text: order.title,
      });
      showToast('Приказ принят к исполнению');
      return true;
    },
    [orders, pushTimeline, resources, showToast],
  );

  const handleQuickAction = useCallback(
    (id: QuickActionId) => {
      if (id === 'compose-letter') {
        if (quickActionTurns[id] === turnNumber) {
          showToast('Канцелярия уже отправила письмо в этом ходу');
          return;
        }

        setQuickActionTurns((current) => ({ ...current, [id]: turnNumber }));
        pushTimeline({
          icon: '✉',
          tone: 'blue',
          title: 'Письмо союзникам отправлено',
          text: 'Канцелярия направила исходящее письмо союзникам. Ответ появится во входящих после дипломатического хода.',
        });
        showToast('Письмо отправлено союзникам');
        return;
      }

      if (id === 'manage-lands') {
        if (quickActionTurns[id] === turnNumber) {
          showToast('Земли уже перераспределены в этом ходу');
          return;
        }

        const cost: ResourceDelta = { gold: 380, wood: 220, stone: 180 };
        if (!canPay(resources, cost)) {
          showToast(`Не хватает ресурсов: ${describeResourceCost(resources, cost)}`);
          return;
        }

        setQuickActionTurns((current) => ({ ...current, [id]: turnNumber }));
        setResources((current) =>
          applyResourceDelta(current, { gold: -380, wood: -220, stone: -180 }).map((resource) => {
            if (resource.id === 'grain') return { ...resource, perTurn: resource.perTurn + 90 };
            if (resource.id === 'gold') return { ...resource, perTurn: resource.perTurn + 45 };
            return resource;
          }),
        );
        pushTimeline({
          icon: '♜',
          tone: 'green',
          title: 'Земли упорядочены',
          text: 'Новые управленцы повысили доход золота и зерна за ход.',
        });
        showToast('Доходы земель выросли');
        return;
      }

      if (id === 'trade-routes') {
        createStrategicOrder({
          icon: Anchor,
          title: 'Расширить торговый маршрут в Индию',
          owner: 'Торговый совет',
          target: 'Индия',
          remainingTurns: 2,
          totalTurns: 2,
          cost: { gold: 360, grain: 180 },
          reward: { gold: 1250, grain: 480 },
          diplomacyDelta: { Индия: 5 },
          completeText: 'Новый торговый маршрут увеличил доход и укрепил отношения с Индией.',
        });
        return;
      }

      if (id === 'recruit-army') {
        createStrategicOrder({
          icon: Shield,
          title: 'Сформировать новую полевую армию',
          owner: 'Генеральный штаб',
          target: 'Москва',
          remainingTurns: 3,
          totalTurns: 3,
          cost: { gold: 820, iron: 520, grain: 360, population: 0.2 },
          reward: { iron: 160 },
          completeText: 'Новая полевая армия готова к переброске и усилила безопасность державы.',
        });
        return;
      }

      if (id === 'diplomacy') {
        if (quickActionTurns[id] === turnNumber) {
          showToast('Дипломаты уже ведут переговоры в этом ходу');
          return;
        }

        setQuickActionTurns((current) => ({ ...current, [id]: turnNumber }));
        setDiplomacy((relations) => applyDiplomacyDelta(relations, { Франция: 4, Турция: 2 }));
        pushLetter({ tone: 'gold', from: 'Франция', subject: 'Ответ на переговоры', time: 'только что' });
        pushTimeline({
          icon: '◎',
          tone: 'green',
          title: 'Дипломаты начали переговоры',
          text: 'Франция и Турция получили новые предложения о сотрудничестве.',
        });
        showToast('Дипломатия улучшена');
        return;
      }

      createStrategicOrder({
        icon: Landmark,
        title: 'Развить инфраструктуру центральных земель',
        owner: 'Совет по развитию',
        target: 'Москва',
        remainingTurns: 2,
        totalTurns: 2,
        cost: { gold: 520, wood: 260, stone: 220 },
        reward: { stone: 620, gold: 260 },
        completeText: 'Инфраструктура улучшена: логистика и сбор налогов стали эффективнее.',
      });
    },
    [createStrategicOrder, pushLetter, pushTimeline, quickActionTurns, resources, showToast, turnNumber],
  );

  const cancelOrder = (id: string) => {
    const order = orders.find((item) => item.id === id);
    if (!order || order.statusClass === 'cancelled') return;

    const refund = Object.fromEntries(
      Object.entries(order.cost || {}).map(([key, value]) => [key, Math.round(value * 0.45)]),
    ) as ResourceDelta;

    setOrders((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: 'Отменен', statusClass: 'cancelled', due: 'снят', remainingTurns: 0 }
          : item,
      ),
    );
    setResources((current) => applyResourceDelta(current, refund));
    pushTimeline({
      icon: '×',
      tone: 'red',
      title: 'Приказ отменен',
      text: `${order.title}. Часть ресурсов возвращена в казну.`,
    });
    showToast('Приказ отменен, часть ресурсов возвращена');
  };

  const handleEndTurn = () => {
    const nextTurn = turnNumber + 1;
    const completedOrders: Order[] = [];
    const activeOrders = orders
      .filter((order) => order.statusClass !== 'cancelled')
      .map((order) => {
        const remainingTurns = Math.max(0, order.remainingTurns - 1);
        if (remainingTurns <= 0) {
          completedOrders.push(order);
          return null;
        }

        return {
          ...order,
          remainingTurns,
          status: remainingTurns <= 1 ? 'В работе' : order.status,
          statusClass: remainingTurns <= 1 ? 'progress' : order.statusClass,
          due: formatOrderDue(remainingTurns),
        };
      })
      .filter(Boolean) as Order[];

    const incomeDelta = resources.reduce<ResourceDelta>((delta, resource) => {
      delta[resource.id] = resource.perTurn;
      return delta;
    }, {});

    const rewardDelta = completedOrders.reduce<ResourceDelta>((delta, order) => {
      Object.entries(order.reward || {}).forEach(([key, value]) => {
        const resourceKey = key as ResourceId;
        delta[resourceKey] = (delta[resourceKey] || 0) + value;
      });
      return delta;
    }, incomeDelta);

    const relationDelta = completedOrders.reduce<Record<string, number>>((delta, order) => {
      Object.entries(order.diplomacyDelta || {}).forEach(([name, value]) => {
        delta[name] = (delta[name] || 0) + value;
      });
      return delta;
    }, {});

    setTurnNumber(nextTurn);
    setSecondsLeft(18 * 3600 + 42 * 60 + 31);
    setOrders(activeOrders);
    setResources((current) => applyResourceDelta(current, rewardDelta));
    setDiplomacy((relations) => applyDiplomacyDelta(relations, relationDelta));
    setTimelineEvents((events) => [
      ...completedOrders.map<TimelineEvent>((order) => ({
        icon: '✓',
        tone: order.diplomacyDelta?.Украина ? 'bronze' : 'green',
        title: 'Приказ выполнен',
        text: order.completeText,
        time: `Ход ${nextTurn}`,
      })),
      {
        icon: '⌛',
        tone: 'blue',
        title: `Ход ${nextTurn} начался`,
        text: completedOrders.length
          ? `Завершено приказов: ${completedOrders.length}. Доход державы начислен.`
          : 'Доход державы начислен, текущие приказы продвинулись.',
        time: 'только что',
      },
      ...events,
    ].slice(0, 5));

    if (completedOrders.length) {
      pushLetter({
        tone: 'neutral',
        from: 'Совет империи',
        subject: `Отчет за ход ${nextTurn}`,
        time: 'только что',
      });
    }

    showToast(`Ход ${nextTurn} начался`);
  };

  return (
    <>
      <div className={appClassName} data-routes={routesVisible ? 'on' : 'off'}>
        <Topbar activeNav={activeNav} mailCount={letters.length} onNavClick={handleNavClick} showToast={showToast} />

        <EmpirePanel
          clock={formatClock(secondsLeft)}
          resources={resources}
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
              <button className="tool-select" type="button" onClick={() => showToast('Слой карты')}>
                <Layers aria-hidden="true" />
                Слой карты
              </button>
              <button id="mapMode" className="tool-select wide" type="button" onClick={handleMapModeClick}>
                {mapModes[mapModeIndex].title}
                <ChevronDown aria-hidden="true" />
              </button>
              <label className="route-toggle">
                <input
                  id="routeToggle"
                  type="checkbox"
                  checked={routesVisible}
                  onChange={(event) => setRoutesVisible(event.currentTarget.checked)}
                />
                <span>Показать маршруты</span>
              </label>
            </div>

            <div
              className="map-canvas"
              ref={mapCanvasRef}
              onMouseMove={handleMapPointerMove}
              onMouseLeave={handleMapLeave}
              onClick={handleMapClick}
            >
              <div className="ocean-glow" aria-hidden="true" />
              <WorldMapLayer zoom={zoom} mapSvgRef={mapSvgRef} />
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
              <div className="mini-map" aria-hidden="true">
                <div />
              </div>
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
              onInputChange={setChatInput}
              onSubmit={submitChat}
              messagesRef={chatMessagesRef}
            />
            <OrdersPanel
              orders={orders}
              onCancel={cancelOrder}
              onCreateOrder={() => handleQuickAction('create-order')}
              showToast={showToast}
            />
          </section>
        </main>

        <RightPanel
          timeline={timelineEvents}
          letters={letters}
          diplomacy={diplomacy}
          showToast={showToast}
        />
      </div>

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
  showToast,
}: {
  activeNav: string;
  mailCount: number;
  onNavClick: (label: string) => void;
  showToast: (message: string) => void;
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
            onClick={() => showToast(label)}
          >
            <Icon aria-hidden="true" />
            {badge ? <b>{badge}</b> : null}
          </button>
        ))}
        <button className="profile-chip" type="button" aria-label="Профиль правителя" onClick={() => showToast('Профиль правителя')}>
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

function EmpirePanel({
  clock,
  resources,
  quickActionTurns,
  turnNumber,
  onEndTurn,
  onQuickAction,
}: {
  clock: string;
  resources: ResourceState[];
  quickActionTurns: Partial<Record<QuickActionId, number>>;
  turnNumber: number;
  onEndTurn: () => void;
  onQuickAction: (id: QuickActionId) => void;
}) {
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
  onInputChange,
  onSubmit,
  messagesRef,
}: {
  messages: ChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  messagesRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <motion.section
      className="chat-panel framed-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="chat-tabs">
        <b>Чат империй</b>
        {['Мировой чат', 'Мировой', 'Альянс', 'Фракция', 'Личные'].map((tab, index) => (
          <button key={tab} type="button" className={index === 0 ? 'active' : ''}>
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
          placeholder="Введите сообщение..."
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
        />
        <button className="emoji" type="button" aria-label="Эмодзи">
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
  onCancel,
  onCreateOrder,
  showToast,
}: {
  orders: Order[];
  onCancel: (id: string) => void;
  onCreateOrder: () => void;
  showToast: (message: string) => void;
}) {
  const activeOrderCount = orders.filter((order) => order.statusClass !== 'cancelled').length;

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
      <div className="orders-list">
        {orders.map((order) => {
          const Icon = order.icon;
          const isCancelled = order.statusClass === 'cancelled';

          return (
            <article
              key={order.id}
              className="order-card"
              style={isCancelled ? { opacity: 0.38, filter: 'grayscale(.55)' } : undefined}
            >
              <span className="order-icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
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
              <button
                type="button"
                title="Посмотреть"
                onClick={() => showToast(`${order.title}: ${order.completeText}`)}
              >
                <Eye aria-hidden="true" />
              </button>
              <button type="button" title="Отменить" onClick={() => onCancel(order.id)} disabled={isCancelled}>
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

function RightPanel({
  timeline,
  letters,
  diplomacy,
  showToast,
}: {
  timeline: TimelineEvent[];
  letters: Letter[];
  diplomacy: DiplomacyRelation[];
  showToast: (message: string) => void;
}) {
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
        {timeline.map((event, index) => (
          <article key={`${event.title}-${event.time}-${index}`}>
            <span className={`event-icon ${event.tone}`}>{event.icon}</span>
            <div>
              <h3>{event.title}</h3>
              <p>{event.text}</p>
            </div>
            <time>{event.time}</time>
          </article>
        ))}
      </section>

      <section className="mail-panel framed-panel compact">
        <div className="panel-heading">
          <h2>
            Входящие письма <span>{letters.length}</span>
          </h2>
          <button type="button" aria-label="Написать письмо" onClick={() => showToast('Написать письмо')}>
            Написать
          </button>
        </div>
        {letters.map((letter, index) => (
          <article key={`${letter.from}-${letter.subject}-${index}`}>
            <span className={`letter-seal ${letter.tone}`}>✉</span>
            <div>
              <h3>{letter.from}</h3>
              <p>Тема: {letter.subject}</p>
            </div>
            <time>{letter.time}</time>
          </article>
        ))}
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
          {diplomacy.map((item) => (
            <li key={item.name}>
              <span className={`flag ${item.flag}`} />
              <b>{item.name}</b>
              <em className={item.tone}>{item.status}</em>
              <strong>{item.score > 0 ? `+${item.score}` : item.score}</strong>
            </li>
          ))}
        </ul>
      </section>
    </motion.aside>
  );
}

export default App;
