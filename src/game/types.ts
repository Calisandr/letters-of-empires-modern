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
export type NationIntentType = 'trade' | 'diplomacy' | 'military' | 'defense' | 'industry' | 'covert';
export type NationIntentVisibility = 'open' | 'guarded' | 'hidden';
export type WorldEventTone = 'blue' | 'green' | 'bronze' | 'red';
export type WorldEventImpact = 'trade' | 'military' | 'diplomacy' | 'economy' | 'stability' | 'threat';
export type NationMetricId = 'economy' | 'army' | 'stability' | 'treasury' | 'grain' | 'relation' | 'threat' | 'pressure';
export type StrategicResponseKind =
  | 'secure-trade'
  | 'open-diplomacy'
  | 'counter-threat'
  | 'stabilize-realm'
  | 'industrial-contract'
  | 'recon-intent';
export type ChatChannel = 'council' | 'world' | 'alliance';

export type ResourceState = {
  id: ResourceId;
  label: string;
  value: number;
  perTurn: number;
  format: ResourceFormat;
};

export type ResourceDelta = Partial<Record<ResourceId, number>>;
export type NationDelta = Partial<Record<NationMetricId, number>>;

export type OrderCounterMoveSeverity = 'low' | 'medium' | 'high';

export type OrderCounterMove = {
  actor: string;
  title: string;
  text: string;
  severity: OrderCounterMoveSeverity;
  chanceDelta: number;
  pressureDelta: number;
};

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
  nationDelta?: Record<string, NationDelta>;
  failureNationDelta?: Record<string, NationDelta>;
  letter?: Letter;
  counterPressure?: number;
  lastCounterMove?: OrderCounterMove;
};

export type OrderDraft = Omit<Order, 'id' | 'status' | 'statusClass' | 'due'>;

export type OperationPlanKind = 'trade' | 'diplomacy' | 'countermeasure' | 'raid' | 'stability' | 'military' | 'infrastructure';
export type OperationPlanOrigin = 'council' | 'intel' | 'turn-report';

export type OperationPlan = {
  id: string;
  kind: OperationPlanKind;
  target: string;
  title: string;
  summary: string;
  advisor: string;
  iconKey: OrderIconKey;
  owner: string;
  durationTurns: number;
  riskLevel: NonNullable<Order['riskLevel']>;
  successChance: number;
  createdTurn: number;
  expiresTurn: number;
  cost: ResourceDelta;
  reward?: ResourceDelta;
  diplomacyDelta?: Record<string, number>;
  nationDelta?: Record<string, NationDelta>;
  failureCost?: ResourceDelta;
  failureDiplomacyDelta?: Record<string, number>;
  failureNationDelta?: Record<string, NationDelta>;
  completeText: string;
  failureText: string;
  letter?: Letter;
  origin?: OperationPlanOrigin;
  sourceText?: string;
  refinements?: number;
};

export type TimelineEvent = {
  icon: string;
  tone: string;
  title: string;
  text: string;
  time: string;
};

export type Letter = {
  id?: string;
  tone: string;
  from: string;
  subject: string;
  time: string;
  body?: string;
  status?: 'open' | 'answered';
  answeredBy?: string;
  responses?: LetterResponseOption[];
};

export type LetterResponseTone = 'support' | 'neutral' | 'warning' | 'danger';

export type LetterResponseOption = {
  id: string;
  label: string;
  summary: string;
  tone: LetterResponseTone;
  resourceDelta?: ResourceDelta;
  diplomacyDelta?: Record<string, number>;
  nationDelta?: Record<string, NationDelta>;
  timelineTitle: string;
  timelineText: string;
};

export type DiplomacyRelation = {
  flag: string;
  name: string;
  status: string;
  tone: DiplomacyTone;
  score: number;
};

export type NationIntent = {
  type: NationIntentType;
  target: string;
  title: string;
  summary: string;
  confidence: number;
  visibility: NationIntentVisibility;
  pressureDelta: number;
  threatDelta: number;
  diplomacyDelta: number;
  resourceDelta?: ResourceDelta;
  eventTone: WorldEventTone;
  eventImpact: WorldEventImpact;
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
  currentIntent?: NationIntent;
};

export type ChatMessage = {
  id: string;
  channel: ChatChannel;
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

export type StrategicResponse = {
  id: string;
  kind: StrategicResponseKind;
  target: string;
  title: string;
  description: string;
  actionLabel: string;
  tone: 'opportunity' | 'warning' | 'danger' | 'stability';
  used?: boolean;
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
  strategicResponses?: StrategicResponse[];
};

export type GameState = {
  version: number;
  resources: ResourceState[];
  orders: Order[];
  operationPlans: OperationPlan[];
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
  | { type: 'CLEAR_SELECTED_COUNTRY' }
  | { type: 'SUBMIT_CHAT_MESSAGE'; channel: ChatChannel; text: string; time: string }
  | { type: 'SUBMIT_COUNCIL_MESSAGE'; text: string; time: string }
  | { type: 'RUN_QUICK_ACTION'; id: QuickActionId; time?: string }
  | { type: 'RUN_COUNTRY_INTEL_ACTION'; id: CountryIntelActionId; country: SelectedCountry }
  | { type: 'RUN_STRATEGIC_RESPONSE'; id: string }
  | { type: 'RUN_OPERATION_PLAN'; id: string }
  | { type: 'REFINE_OPERATION_PLAN'; id: string }
  | { type: 'DISMISS_OPERATION_PLAN'; id: string }
  | { type: 'RESPOND_TO_LETTER'; letterId: string; responseId: string }
  | { type: 'CANCEL_ORDER'; id: string }
  | { type: 'END_TURN' };
