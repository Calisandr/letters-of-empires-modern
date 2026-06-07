import { FormEvent, KeyboardEvent, MouseEvent, memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { oncePerTurnQuickActions } from './game/engine';
import { formatClock, formatResourceTrend, formatResourceValue } from './game/formatters';
import { playerCountry } from './game/initialState';
import { gameReducer } from './game/reducer';
import { loadGameState, saveGameState } from './game/storage';
import type {
  ChatMessage,
  DiplomacyRelation,
  Letter,
  Order,
  OrderIconKey,
  QuickActionId,
  ResourceState,
  TimelineEvent,
} from './game/types';

type ToastState = {
  message: string;
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

const quickActions: Array<{ id: QuickActionId; label: string; icon: LucideIcon; toast?: string }> = [
  { id: 'compose-letter', label: 'Написать письмо', icon: Mail },
  { id: 'create-order', label: 'Создать приказ', icon: Flag },
  { id: 'manage-lands', label: 'Управление землями', icon: Landmark },
  { id: 'trade-routes', label: 'Торговые маршруты', icon: Anchor },
  { id: 'recruit-army', label: 'Набор войск', icon: Shield },
  { id: 'diplomacy', label: 'Дипломатия', icon: Handshake, toast: 'Дипломатические переговоры' },
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
  const [gameState, dispatchGame] = useReducer(gameReducer, undefined, loadGameState);
  const [activeNav, setActiveNav] = useState('Карта мира');
  const [routesVisible, setRoutesVisible] = useState(true);
  const [mapModeIndex, setMapModeIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [chatInput, setChatInput] = useState('');
  const [activeChatTab, setActiveChatTab] = useState('Мировой чат');
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<string | null>(null);
  const [pendingQuickAction, setPendingQuickAction] = useState<QuickActionId | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(18 * 3600 + 42 * 60 + 31);
  const [toast, setToast] = useState<ToastState | null>(null);
  const {
    resources,
    orders,
    timelineEvents,
    letters,
    diplomacy,
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
    saveGameState(gameState);
  }, [gameState]);

  useEffect(() => {
    if (gameState.lastNotice) showToast(gameState.lastNotice.message);
  }, [gameState.lastNotice, showToast]);

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

  const selectCountry = useCallback((country: SVGElement) => {
    const sourceName = country.dataset.name || '';
    const name = countryNames[sourceName] || sourceName;
    const status = country.dataset.status || 'common';

    if (selectedCountryRef.current && selectedCountryRef.current !== country) {
      selectedCountryRef.current.classList.remove('selected');
    }

    country.classList.add('selected');
    selectedCountryRef.current = country;

    dispatchGame({
      type: 'SELECT_COUNTRY',
      country: {
        key: sourceName,
        name,
        status,
      },
    });
  }, []);

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
  }, [selectCountry, zoom]);

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

  const confirmPendingQuickAction = () => {
    if (!pendingQuickAction) return;
    runQuickAction(pendingQuickAction);
    setPendingQuickAction(null);
  };

  const cancelOrder = (id: string) => {
    dispatchGame({ type: 'CANCEL_ORDER', id });
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
      <div className={appClassName} data-routes={routesVisible ? 'on' : 'off'}>
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
              onKeyDown={handleMapKeyDown}
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
          onComposeLetter={() => handleQuickAction('compose-letter')}
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
      text: `Во входящих сейчас ${mailCount} писем. Новые ответы приходят после дипломатических действий и завершения приказов.`,
      action: 'Кнопка "Написать" справа отправляет исходящее письмо через GameState.',
    },
    Уведомления: {
      text: 'Здесь собираются важные игровые изменения: завершение хода, результаты приказов, дипломатические ответы.',
      action: 'Последние события уже отражаются в хронике мира справа.',
    },
    Помощь: {
      text: 'Совет понимает обычные сообщения и игровые команды: построить, развить, отправить, укрепить, начать переговоры.',
      action: 'Абсурдные команды блокируются fallback-арбитром и не ломают баланс.',
    },
    'Профиль правителя': {
      text: `Правитель России управляет партией через приказы, письма, дипломатию и выбранную цель на карте: ${selectedCountryName}.`,
      action: 'Состояние партии сохраняется автоматически после игровых действий.',
    },
    Настройки: {
      text: 'Автосохранение партии включено. Карта, ходы, приказы, письма и ресурсы сохраняются в браузере.',
      action: 'Расширенные настройки графики и мобильный режим лучше вынести в следующий этап.',
    },
    'Карта мира': {
      text: `Карта выбирает цель для приказов и дипломатии. Текущая цель: ${selectedCountryName}.`,
      action: 'Страны можно выбирать мышью или клавиатурой через Enter.',
    },
    Письма: {
      text: `Панель писем справа связана с GameState. Входящих сейчас: ${mailCount}.`,
      action: 'Исходящие письма идут в хронику, а входящие появляются как ответы мира.',
    },
    Приказы: {
      text: `Активных приказов: ${orderCount}/5. Создание приказа теперь открывает подтверждение и проверку движка.`,
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
      action: 'Следующий слой: отдельные цели и поведение стран.',
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
          const Icon = orderIcons[order.iconKey];
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
                aria-label={`Посмотреть приказ: ${order.title}`}
                onClick={() => showToast(`${order.title}: ${order.completeText}`)}
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
          <dd>Ресурсы и лимит приказов проверит движок</dd>
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
  onComposeLetter,
  showToast,
}: {
  timeline: TimelineEvent[];
  letters: Letter[];
  diplomacy: DiplomacyRelation[];
  onComposeLetter: () => void;
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
          <button type="button" aria-label="Написать письмо" onClick={onComposeLetter}>
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
