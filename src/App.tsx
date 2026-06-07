import { FormEvent, MouseEvent, memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  id: number;
  message: string;
};

type ChatMessage = {
  id: number;
  time: string;
  faction: string;
  flag: string;
  text: string;
};

type Order = {
  id: string;
  icon: LucideIcon;
  title: string;
  owner: string;
  target: string;
  status: string;
  statusClass: string;
  due: string;
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

const resources = [
  { label: 'Золото', value: '12 540', trend: '+1 250/ход' },
  { label: 'Дерево', value: '8 760', trend: '+720/ход' },
  { label: 'Камень', value: '6 410', trend: '+610/ход' },
  { label: 'Железо', value: '7 230', trend: '+560/ход' },
  { label: 'Зерно', value: '9 850', trend: '+1 100/ход' },
  { label: 'Население', value: '146.2M', trend: '+0.8%' },
];

const quickActions: Array<{ label: string; icon: LucideIcon; toast?: string }> = [
  { label: 'Написать письмо', icon: Mail },
  { label: 'Создать приказ', icon: Flag },
  { label: 'Управление землями', icon: Landmark },
  { label: 'Торговые маршруты', icon: Anchor },
  { label: 'Набор войск', icon: Shield },
  { label: 'Дипломатия', icon: Handshake, toast: 'Дипломатические переговоры' },
];

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

const orders: Order[] = [
  {
    id: 'trade-india',
    icon: Package,
    title: 'Отправить торговый караван в Индию',
    owner: 'Торговый совет',
    target: 'Дели',
    status: 'В пути',
    statusClass: 'moving',
    due: '2 дня',
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
  },
];

const timeline = [
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

const letters = [
  { tone: 'neutral', from: 'Франция', subject: 'Торговое предложение', time: '5 мин. назад' },
  { tone: 'red', from: 'Турция', subject: 'Дипломатический запрос', time: '32 мин. назад' },
  { tone: 'burgundy', from: 'Германия', subject: 'Военный союз', time: '1 час назад' },
  { tone: 'gold', from: 'Китай', subject: 'Граница и торговля', time: '2 часа назад' },
  { tone: 'blue', from: 'Аргентина', subject: 'Обмен ресурсами', time: '3 часа назад' },
];

const diplomacy = [
  { flag: 'china', name: 'Китай', status: 'Союзники', tone: 'ally', score: '+165' },
  { flag: 'india', name: 'Индия', status: 'Союзники', tone: 'ally', score: '+120' },
  { flag: 'france', name: 'Франция', status: 'Дружественные', tone: 'friendly', score: '+75' },
  { flag: 'turkey', name: 'Турция', status: 'Нейтральные', tone: 'neutral', score: '+10' },
  { flag: 'germany', name: 'Германия', status: 'Нейтральные', tone: 'neutral', score: '+5' },
  { flag: 'japan', name: 'Япония', status: 'Риск конфликта', tone: 'risk', score: '-25' },
  { flag: 'ukraine', name: 'Украина', status: 'Враждебные', tone: 'hostile', score: '-80' },
];

const formatClock = (value: number) => {
  const h = String(Math.floor(value / 3600)).padStart(2, '0');
  const m = String(Math.floor((value % 3600) / 60)).padStart(2, '0');
  const s = String(value % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

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
  const [cancelledOrders, setCancelledOrders] = useState<Set<string>>(() => new Set());
  const [secondsLeft, setSecondsLeft] = useState(18 * 3600 + 42 * 60 + 31);
  const [toast, setToast] = useState<ToastState | null>(null);

  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapSvgRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const selectedCountryRef = useRef<SVGElement | null>(null);
  const activeTooltipCountryRef = useRef<string | null>(null);
  const tooltipFrameRef = useRef<number | null>(null);
  const latestTooltipRef = useRef<{
    country: SVGElement;
    clientX: number;
    clientY: number;
  } | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);

  const showToast = (message: string) => {
    setToast({ id: Date.now(), message });
  };

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1700);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (tooltipFrameRef.current !== null) {
        window.cancelAnimationFrame(tooltipFrameRef.current);
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

  const cancelOrder = (id: string) => {
    setCancelledOrders((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    showToast('Приказ помечен к отмене');
  };

  return (
    <>
      <div className={appClassName} data-routes={routesVisible ? 'on' : 'off'}>
        <Topbar activeNav={activeNav} onNavClick={handleNavClick} showToast={showToast} />

        <EmpirePanel clock={formatClock(secondsLeft)} showToast={showToast} />

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
              cancelledOrders={cancelledOrders}
              onCancel={cancelOrder}
              showToast={showToast}
            />
          </section>
        </main>

        <RightPanel showToast={showToast} />
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            className="toast visible"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Topbar({
  activeNav,
  onNavClick,
  showToast,
}: {
  activeNav: string;
  onNavClick: (label: string) => void;
  showToast: (message: string) => void;
}) {
  const topActions = [
    { label: 'Поиск', icon: Search },
    { label: 'Корона', icon: Crown, className: 'crown' },
    { label: 'Почта', icon: Mail, badge: 5 },
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
        {navItems.map(({ label, badge, icon: Icon }) => (
          <button
            key={label}
            className={`nav-link ${activeNav === label ? 'active' : ''}`}
            type="button"
            onClick={() => onNavClick(label)}
          >
            <Icon aria-hidden="true" size={14} />
            {label}
            {badge ? <span className="pill">{badge}</span> : null}
          </button>
        ))}
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
  showToast,
}: {
  clock: string;
  showToast: (message: string) => void;
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
              <b>{resource.value}</b>
              <em>{resource.trend}</em>
            </li>
          ))}
        </ul>
        <div className="turn-info">
          <div>
            <small>Текущий ход</small>
            <strong>123</strong>
          </div>
          <div>
            <small>До конца хода</small>
            <strong id="turnClock">{clock}</strong>
          </div>
          <span className="hourglass">⌛</span>
        </div>
        <div className="section-title">Быстрые действия</div>
        <div className="quick-actions">
          {quickActions.map(({ label, icon: Icon, toast }) => (
            <button key={label} type="button" title={toast} onClick={() => showToast(toast || label)}>
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
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
  cancelledOrders,
  onCancel,
  showToast,
}: {
  cancelledOrders: Set<string>;
  onCancel: (id: string) => void;
  showToast: (message: string) => void;
}) {
  return (
    <motion.section
      className="orders-panel framed-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-heading">
        <h2>
          Текущие приказы <span>(3/5)</span>
        </h2>
      </div>
      <div className="orders-list">
        {orders.map((order) => {
          const Icon = order.icon;
          const isCancelled = cancelledOrders.has(order.id);

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
              <button type="button" title="Посмотреть" onClick={() => showToast(order.title)}>
                <Eye aria-hidden="true" />
              </button>
              <button type="button" title="Отменить" onClick={() => onCancel(order.id)}>
                <X aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      <button className="create-order" type="button" onClick={() => showToast('Создать приказ')}>
        <Plus aria-hidden="true" />
        Создать приказ
      </button>
    </motion.section>
  );
}

function RightPanel({ showToast }: { showToast: (message: string) => void }) {
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
        {timeline.map((event) => (
          <article key={event.title}>
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
            Входящие письма <span>5</span>
          </h2>
          <button type="button" aria-label="Написать письмо" onClick={() => showToast('Написать письмо')}>
            Написать
          </button>
        </div>
        {letters.map((letter) => (
          <article key={`${letter.from}-${letter.subject}`}>
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
              <strong>{item.score}</strong>
            </li>
          ))}
        </ul>
      </section>
    </motion.aside>
  );
}

export default App;
