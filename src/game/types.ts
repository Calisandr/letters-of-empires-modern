export type ResourceId = 'gold' | 'wood' | 'stone' | 'iron' | 'grain' | 'population';

export type QuickActionId =
  | 'compose-letter'
  | 'create-order'
  | 'manage-lands'
  | 'trade-routes'
  | 'recruit-army'
  | 'diplomacy';

export type CountryIntelActionId = 'send-envoy' | 'trade-mission' | 'gather-intel' | 'prepare-operation';

export type DiplomacyTone = 'ally' | 'friendly' | 'neutral' | 'risk' | 'hostile';
export type ResourceFormat = 'integer' | 'population';
export type OrderStatusClass = 'moving' | 'progress' | 'cancelled' | 'completed' | 'failed';
export type OrderIconKey = 'package' | 'swords' | 'pickaxe' | 'anchor' | 'shield' | 'landmark' | 'mail';
export type ActionStatusKind = 'idle' | 'loading' | 'success' | 'error';
export type NationFocus = 'trade' | 'military' | 'industry' | 'diplomacy' | 'defense';
export type WorldEventTone = 'blue' | 'green' | 'bronze' | 'red';
export type WorldEventImpact = 'trade' | 'military' | 'diplomacy' | 'economy' | 'stability' | 'threat';

export type ResourceState = {
  id: ResourceId;
  label: string;
  value: number;
  perTurn: number;
  format: ResourceFormat;
};

export type ResourceDelta = Partial<Record<ResourceId, number>>;

export type Order = {
  id: string;
  iconKey: OrderIconKey;
  title: string;
  owner: string;
  target: string;
  status: string;
  statusClass: OrderStatusClass;
  due: string;
  remainingTurns: number;
  totalTurns: number;
  cost?: ResourceDelta;
  reward?: ResourceDelta;
  diplomacyDelta?: Record<string, number>;
  completeText: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  successChance?: number;
  failureText?: string;
  failureCost?: ResourceDelta;
  failureDiplomacyDelta?: Record<string, number>;
};

export type OrderDraft = Omit<Order, 'id' | 'status' | 'statusClass' | 'due'>;

export type TimelineEvent = {
  icon: string;
  tone: string;
  title: string;
  text: string;
  time: string;
};

export type Letter = {
  tone: string;
  from: string;
  subject: string;
  time: string;
};

export type DiplomacyRelation = {
  flag: string;
  name: string;
  status: string;
  tone: DiplomacyTone;
  score: number;
};

export type NationProfile = {
  id: string;
  name: string;
  flag: string;
  focus: NationFocus;
  economy: number;
  army: number;
  stability: number;
  treasury: number;
  grain: number;
  relation: number;
  threat: number;
  pressure: number;
  goals: string[];
  lastAction: string;
};

export type ChatMessage = {
  id: string;
  time: string;
  faction: string;
  flag: string;
  text: string;
};

export type SelectedCountry = {
  key: string;
  name: string;
  status: string;
};

export type GameNotice = {
  id: number;
  message: string;
  kind: ActionStatusKind;
};

export type ActionStatus = {
  kind: ActionStatusKind;
  message: string;
};

export type WorldEvent = {
  id: string;
  turn: number;
  actor: string;
  flag: string;
  title: string;
  text: string;
  tone: WorldEventTone;
  impact: WorldEventImpact;
};

export type CompletedOrderReport = {
  title: string;
  target: string;
  succeeded: boolean;
  text: string;
};

export type TurnReport = {
  turn: number;
  summary: string;
  completedOrders: CompletedOrderReport[];
  worldEvents: WorldEvent[];
  resourceDelta: ResourceDelta;
  diplomacyDelta: Record<string, number>;
  warnings: string[];
  opportunities: string[];
};

export type GameState = {
  version: number;
  resources: ResourceState[];
  orders: Order[];
  timelineEvents: TimelineEvent[];
  letters: Letter[];
  diplomacy: DiplomacyRelation[];
  nations: NationProfile[];
  worldEvents: WorldEvent[];
  worldTension: number;
  lastTurnReport: TurnReport | null;
  chatMessages: ChatMessage[];
  quickActionTurns: Partial<Record<QuickActionId, number>>;
  turnNumber: number;
  selectedCountry: SelectedCountry | null;
  nextActionId: number;
  lastNotice: GameNotice | null;
  actionStatus: ActionStatus;
};

export type AiActionJudgement =
  | 'impossible'
  | 'possible_safe'
  | 'possible_risky'
  | 'possible_reckless'
  | 'partial_success'
  | 'failure_with_consequences';

export type EngineEffect = {
  kind: 'blocked' | 'event-only' | 'create-order' | 'resource-delta' | 'diplomacy-delta';
  reason?: string;
  eventTitle?: string;
  eventText?: string;
  order?: OrderDraft;
  resourceDelta?: ResourceDelta;
  diplomacyDelta?: Record<string, number>;
  letter?: Letter;
};

export type AiArbitrationDecision = {
  feasibility: 'blocked' | 'attemptable';
  judgement: AiActionJudgement;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasoningSummary: string;
  playerFacingResult: string;
  engineEffect: EngineEffect;
};

export type GameAction =
  | { type: 'SELECT_COUNTRY'; country: SelectedCountry }
  | { type: 'SUBMIT_COUNCIL_MESSAGE'; text: string; time: string }
  | { type: 'RUN_QUICK_ACTION'; id: QuickActionId }
  | { type: 'RUN_COUNTRY_INTEL_ACTION'; id: CountryIntelActionId; country: SelectedCountry }
  | { type: 'CANCEL_ORDER'; id: string }
  | { type: 'END_TURN' };
