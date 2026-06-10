import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:5173/';
const screenshotPath = 'tmp/playwright/modern-dashboard.png';

await mkdir('tmp/playwright', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];

await page.addInitScript(() => {
  if (!window.sessionStorage.getItem('letters-of-empires:smoke-ready')) {
    window.localStorage.removeItem('letters-of-empires:game:v1');
    window.sessionStorage.setItem('letters-of-empires:smoke-ready', '1');
  }
});

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

page.on('pageerror', (error) => {
  consoleErrors.push(error.message);
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-shell');
  await page.waitForSelector('.world-svg');

  const countryCount = await page.locator('.country').count();
  const initialTitle = await page.locator('.brand-text').textContent();
  const loadedScripts = await page.evaluate(() => [...document.scripts].map((script) => script.src));
  const legacyScriptLoaded = loadedScripts.some((src) => src.includes('/js/app.js'));
  const legacyScriptResponse = await page.evaluate(async () => {
    const response = await fetch('/js/app.js', { cache: 'no-store' });
    const text = await response.text();

    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      servesLegacyJs:
        text.includes('function showToast') ||
        text.includes('querySelectorAll') ||
        text.includes('addEventListener'),
    };
  });

  await page.locator('#mapMode').click();
  await page.locator('.map-mode-menu button').nth(1).click();
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('trade-mode'));
  await page.locator('#mapMode').click();
  await page.locator('.map-mode-menu button').nth(2).click();
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('strategy-mode'));
  await page.waitForSelector('.map-signal-marker');
  const liveMapDiagnostics = await page.evaluate(() => {
    const markers = [...document.querySelectorAll('.map-signal-marker')];
    const markerLabels = markers.map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '');
    const ukraine = document.querySelector('.country[data-name="Ukraine"]');
    const india = document.querySelector('.country[data-name="India"]');

    return {
      markerCount: markers.length,
      linkCount: document.querySelectorAll('.map-live-link').length,
      markerLabels,
      hasUkraineMarker: markerLabels.some((label) => label.includes('Украина')),
      hasIndiaSignal: Boolean(india?.classList.contains('live-trade')),
      ukraineClass: ukraine?.getAttribute('class') || '',
      indiaClass: india?.getAttribute('class') || '',
    };
  });
  await page.locator('.map-signal-marker').filter({ hasText: 'Украина' }).click();
  await page.waitForFunction(() =>
    document.querySelector('.country[data-name="Ukraine"]')?.classList.contains('selected'),
  );
  const liveMarkerClickSelectedUkraine = await page
    .locator('.country[data-name="Ukraine"]')
    .evaluate((node) => node.classList.contains('selected'));

  await page.locator('#routeToggle').uncheck();
  const routesState = await page.locator('.app-shell').getAttribute('data-routes');
  await page.locator('.map-toolbar .tool-select').first().click();
  await page.locator('.map-layer-menu button').nth(1).click();
  const labelsLayerState = await page.locator('.map-canvas').getAttribute('data-layer-labels');

  const beforeZoom = await page.locator('#mapZoomLayer').evaluate((node) => getComputedStyle(node).transform);
  await page.locator('#zoomIn').click();
  const afterZoom = await page.locator('#mapZoomLayer').evaluate((node) => node.style.transform);

  await page.locator('.country[data-name="Russia"]').hover();
  await page.waitForSelector('.tooltip.visible');
  const tooltip = await page.locator('.tooltip').innerText();
  await page.locator('.country[data-name="Russia"]').click();
  await page.waitForFunction(() =>
    document.querySelector('.country[data-name="Russia"]')?.classList.contains('selected'),
  );
  const selectedRussia = await page
    .locator('.country[data-name="Russia"]')
    .evaluate((node) => node.classList.contains('selected'));
  const franceCountry = page.locator('.country[data-name="France"]');
  await franceCountry.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document.querySelector('.country[data-name="France"]')?.classList.contains('selected'),
  );
  const keyboardSelectedFrance = await franceCountry.evaluate((node) => ({
    selected: node.classList.contains('selected'),
    role: node.getAttribute('role'),
    label: node.getAttribute('aria-label'),
  }));

  const inspectCountryIntel = async (countryName) => {
    const country = page.locator(`.country[data-name="${countryName}"]`);
    await country.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (name) => document.querySelector(`.country[data-name="${name}"]`)?.classList.contains('selected'),
      countryName,
    );
    return page.evaluate(() => {
      const flag = document.querySelector('.country-intel .flag');
      const flagStyle = flag ? getComputedStyle(flag) : null;
      return {
        title: document.querySelector('.country-intel strong')?.textContent?.trim() || '',
        flagClass: flag?.className.toString() || '',
        flagTitle: flag?.getAttribute('title') || '',
        flagBackgroundImage: flagStyle?.backgroundImage || '',
        visibleBeforeClose: Boolean(document.querySelector('.country-intel')),
      };
    });
  };

  const algeriaIntel = await inspectCountryIntel('Algeria');
  const brazilIntel = await inspectCountryIntel('Brazil');
  const greenlandIntel = await inspectCountryIntel('Greenland');
  const countryIntelFlagDiagnostics = {
    algeriaIntel,
    brazilIntel,
    greenlandIntel,
  };
  const countryIntelFlagsWork = [algeriaIntel, brazilIntel, greenlandIntel].every((intel) =>
    intel.visibleBeforeClose &&
    intel.flagClass.includes('flag-svg') &&
    intel.flagClass.includes('fi-') &&
    intel.flagBackgroundImage.includes('url('),
  );
  const countryIntelStillUsesEmojiFallback = [algeriaIntel, brazilIntel, greenlandIntel].some((intel) =>
    intel.flagClass.includes('emoji-flag') || intel.flagBackgroundImage === 'none',
  );
  const countryIntelShowsTextCode = await page.evaluate(() => {
    const flag = document.querySelector('.country-intel .flag');
    return {
      text: flag?.textContent?.trim() || '',
      pseudoText: flag ? getComputedStyle(flag, '::before').content + getComputedStyle(flag, '::after').content : '',
    };
  });

  await inspectCountryIntel('Brazil');
  const beforeCountryIntelAction = await page.evaluate(() => ({
    goldText: [...document.querySelectorAll('.resource-list li')].find((node) =>
      node.textContent?.includes('Золото'),
    )?.textContent || '',
    diplomacyNames: [...document.querySelectorAll('.diplomacy-row > b')].map((node) =>
      node.textContent?.trim(),
    ),
  }));
  await page.getByRole('button', { name: 'Посол: Бразилия' }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.diplomacy-row > b')].some((node) => node.textContent?.includes('Бразилия')),
  );
  await page.getByRole('button', { name: 'Разведка: Бразилия' }).click();
  await page.waitForTimeout(120);
  await page.waitForSelector('.council-priority, .operation-plan');
  const afterCountryIntelAction = await page.evaluate(() => ({
    goldText: [...document.querySelectorAll('.resource-list li')].find((node) =>
      node.textContent?.includes('Золото'),
    )?.textContent || '',
    diplomacyNames: [...document.querySelectorAll('.diplomacy-row > b')].map((node) =>
      node.textContent?.trim(),
    ),
    intelText: document.querySelector('.country-intel-activity')?.textContent?.trim() || '',
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.trim() || '',
  }));
  const operationPlanDiagnostics = await page.evaluate(() => {
    const plans = [...document.querySelectorAll('.council-priority, .operation-plan')];
    const first = plans[0];

    return {
      count: plans.length,
      title: first?.querySelector('h3')?.textContent?.trim() || '',
      hasRunButton: Boolean(first?.querySelector('.plan-run')?.textContent?.includes('Утвердить')),
      hasDismissButton: Boolean(first?.querySelector('.plan-dismiss')),
      meta:
        first?.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() ||
        [...(first?.querySelectorAll('.council-priority-facts b') || [])]
          .map((node) => node.textContent?.trim() || '')
          .join(' · '),
    };
  });
  const countryIntelActionDiagnostics = {
    beforeCountryIntelAction,
    afterCountryIntelAction,
    operationPlanDiagnostics,
    diplomacyHasBrazil: afterCountryIntelAction.diplomacyNames.includes('Бразилия'),
    goldChanged: beforeCountryIntelAction.goldText !== afterCountryIntelAction.goldText,
    intelUpdated: afterCountryIntelAction.intelText.includes('Разведка'),
  };

  const diplomacyScrollDiagnostics = await page.evaluate(() => {
    const panel = document.querySelector('.diplomacy-panel');
    const list = document.querySelector('.diplomacy-panel ul');
    if (!panel || !list) {
      return { exists: false };
    }

    const before = list.scrollTop;
    list.scrollTop = list.scrollHeight;
    const after = list.scrollTop;
    list.scrollTop = 0;
    const style = getComputedStyle(list);
    const panelRect = panel.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const needsScroll = list.scrollHeight > list.clientHeight + 1;

    return {
      exists: true,
      itemCount: list.children.length,
      overflowY: style.overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      needsScroll,
      canReachBottom: !needsScroll || after > before,
      contained: listRect.top >= panelRect.top - 1 && listRect.bottom <= panelRect.bottom + 1,
    };
  });

  const diplomacyDossierRow = page.locator('.diplomacy-row').first();
  if ((await diplomacyDossierRow.getAttribute('aria-expanded')) !== 'true') {
    await diplomacyDossierRow.click();
  }
  await page.waitForSelector('.diplomacy-dialog');
  const diplomacyDossierDiagnostics = await page.evaluate(() => {
    const row = document.querySelector('.diplomacy-row[aria-expanded="true"]') || document.querySelector('.diplomacy-row');
    const dialog = document.querySelector('.diplomacy-dialog');
    const rightPanel = document.querySelector('.right-panel');
    const meter = dialog?.querySelector('.dialog-meter');
    const activity = dialog?.querySelector('.diplomacy-dialog-activity');
    const metrics = [...(dialog?.querySelectorAll('.diplomacy-dialog-metrics dd') || [])].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim(),
    );
    const dialogRect = dialog?.getBoundingClientRect();
    const rightPanelRect = rightPanel?.getBoundingClientRect();
    const textNodes = [...(dialog?.querySelectorAll('p, li, dd, button, small') || [])];
    const smallTextNodes = textNodes.filter((node) => Number.parseFloat(getComputedStyle(node).fontSize) < 12);
    const overflowingNodes = [...(dialog?.querySelectorAll('*') || [])].filter(
      (node) => node.scrollWidth > node.clientWidth + 2,
    );

    return {
      exists: Boolean(dialog),
      role: dialog?.getAttribute('role') || '',
      modal: dialog?.getAttribute('aria-modal') || '',
      rowExpanded: row?.getAttribute('aria-expanded') === 'true',
      meterText: meter?.textContent?.replace(/\s+/g, ' ').trim() || '',
      activityText: activity?.textContent?.replace(/\s+/g, ' ').trim() || '',
      metrics,
      goalCount: dialog?.querySelectorAll('.diplomacy-dialog-goals li').length || 0,
      visibleHeight: dialogRect?.height || 0,
      visibleWidth: dialogRect?.width || 0,
      outsideRightPanel: Boolean(dialogRect && rightPanelRect && dialogRect.left < rightPanelRect.left - 12),
      closeButtonExists: Boolean(dialog?.querySelector('.dialog-close')),
      smallTextCount: smallTextNodes.length,
      overflowCount: overflowingNodes.length,
    };
  });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.diplomacy-dialog').length === 0);
  const diplomacyDossierCloseDiagnostics = {
    closed: (await page.locator('.diplomacy-dialog').count()) === 0,
    expandedRows: await page.locator('.diplomacy-row[aria-expanded="true"]').count(),
  };

  await page.locator('.country-intel-close').click();
  await page.waitForFunction(() => document.querySelectorAll('.country-intel').length === 0);
  const countryIntelClosed = (await page.locator('.country-intel').count()) === 0;
  const countrySelectionAfterClose = await page.evaluate(() => ({
    selectedCount: document.querySelectorAll('.world-svg .country.selected').length,
    selectedNames: [...document.querySelectorAll('.world-svg .country.selected')].map((node) => node.dataset.name),
  }));

  await page.locator('.timeline-row-button').first().click();
  await page.waitForSelector('.chronicle-dialog');
  const chronicleHighlightLabel = await page
    .locator('.world-pulse-row .timeline-kind')
    .first()
    .textContent();
  const chronicleDialogDiagnostics = await page.evaluate(() => {
    const dialog = document.querySelector('.chronicle-dialog');
    const rightPanel = document.querySelector('.right-panel');
    const dialogRect = dialog?.getBoundingClientRect();
    const rightPanelRect = rightPanel?.getBoundingClientRect();
    const textNodes = [...(dialog?.querySelectorAll('p, dd, button, small') || [])];
    const smallTextNodes = textNodes.filter((node) => Number.parseFloat(getComputedStyle(node).fontSize) < 12);
    const overflowingNodes = [...(dialog?.querySelectorAll('*') || [])].filter(
      (node) => node.scrollWidth > node.clientWidth + 2,
    );

    return {
      exists: Boolean(dialog),
      role: dialog?.getAttribute('role') || '',
      modal: dialog?.getAttribute('aria-modal') || '',
      title: dialog?.querySelector('h2')?.textContent?.trim() || '',
      metrics: dialog?.querySelectorAll('.chronicle-dialog-metrics dd').length || 0,
      meaningText: dialog?.querySelector('.chronicle-dialog-meaning p')?.textContent?.trim() || '',
      visibleWidth: dialogRect?.width || 0,
      visibleHeight: dialogRect?.height || 0,
      outsideRightPanel: Boolean(dialogRect && rightPanelRect && dialogRect.left < rightPanelRect.left - 12),
      closeButtonExists: Boolean(dialog?.querySelector('.dialog-close')),
      smallTextCount: smallTextNodes.length,
      overflowCount: overflowingNodes.length,
    };
  });
  await page.locator('.chronicle-dialog .dialog-close').click();
  await page.waitForFunction(() => document.querySelectorAll('.chronicle-dialog').length === 0);
  const chronicleDialogClosed = (await page.locator('.chronicle-dialog').count()) === 0;

  await page.locator('.timeline-panel .panel-heading button').click();
  await page.waitForSelector('.chronicle-archive-dialog');
  const chronicleArchiveDiagnostics = await page.evaluate(() => {
    const dialog = document.querySelector('.chronicle-archive-dialog');
    const rightPanel = document.querySelector('.right-panel');
    const dialogRect = dialog?.getBoundingClientRect();
    const rightPanelRect = rightPanel?.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.chronicle-archive-row')];
    const rowBoxes = rows.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    });
    const smallTextNodes = [...(dialog?.querySelectorAll('p, time, button, small') || [])].filter(
      (node) => Number.parseFloat(getComputedStyle(node).fontSize) < 12,
    );
    const overflowingNodes = [...(dialog?.querySelectorAll('*') || [])].filter(
      (node) => node.scrollWidth > node.clientWidth + 2,
    );

    return {
      exists: Boolean(dialog),
      role: dialog?.getAttribute('role') || '',
      modal: dialog?.getAttribute('aria-modal') || '',
      rowCount: rows.length,
      minRowHeight: rowBoxes.reduce((min, row) => Math.min(min, row.height), Number.POSITIVE_INFINITY),
      visibleWidth: dialogRect?.width || 0,
      outsideRightPanel: Boolean(dialogRect && rightPanelRect && dialogRect.left < rightPanelRect.left - 12),
      smallTextCount: smallTextNodes.length,
      overflowCount: overflowingNodes.length,
    };
  });
  await page.locator('.chronicle-archive-row').first().click();
  await page.waitForSelector('.chronicle-dialog');
  const chronicleArchiveOpensEntry = (await page.locator('.chronicle-dialog').count()) === 1;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.chronicle-dialog').length === 0);
  const chronicleArchiveClosed = (await page.locator('.chronicle-archive-dialog').count()) === 0;

  await franceCountry.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.country-intel');

  await page.locator('#chatInput').fill('Разведать Турцию');
  await page.locator('.chat-input .send').click();
  await page.waitForSelector('.council-decision-card');
  const chatText = await page.locator('.chat-messages').innerText();
  const councilDirectiveDiagnostics = await page.evaluate(() => {
    const card = document.querySelector('.council-decision-card');
    const planTitles = [...document.querySelectorAll('.council-priority h3, .operation-plan h3')].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim() || '',
    );
    const buttons = [...(card?.querySelectorAll('button') || [])].map((button) =>
      button.textContent?.replace(/\s+/g, ' ').trim() || '',
    );
    const textNodes = [...(card?.querySelectorAll('h3, p, dt, dd, button, span, b') || [])];
    const overflowingNodes = [...(card?.querySelectorAll('*') || [])].filter(
      (node) => node.scrollWidth > node.clientWidth + 2 && node.tagName !== 'H3',
    );
    const cardBox = card?.getBoundingClientRect();
    const chatPanelBox = document.querySelector('.chat-panel')?.getBoundingClientRect();

    return {
      exists: Boolean(card),
      roleLabel: card?.getAttribute('aria-label') || '',
      title: card?.querySelector('h3')?.textContent?.trim() || '',
      summary: card?.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      metrics: [...(card?.querySelectorAll('dd') || [])].map((node) => node.textContent?.trim() || ''),
      buttons,
      planTitles,
      advisorReply: [...document.querySelectorAll('.chat-messages p')].at(-1)?.textContent?.replace(/\s+/g, ' ').trim() || '',
      contained: Boolean(cardBox && chatPanelBox && cardBox.top >= chatPanelBox.top - 1 && cardBox.bottom <= chatPanelBox.bottom + 1),
      smallTextCount: textNodes.filter((node) => Number.parseFloat(getComputedStyle(node).fontSize) < 10.5).length,
      overflowCount: overflowingNodes.length,
      overflowSamples: overflowingNodes.slice(0, 4).map((node) => ({
        tag: node.tagName,
        className: node.className?.toString?.() || '',
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      })),
    };
  });
  await page.locator('.council-decision-card .plan-dismiss').click();
  await page.waitForFunction(() =>
    ![...document.querySelectorAll('.council-priority h3, .operation-plan h3')].some((node) =>
      node.textContent?.includes('Турция'),
    ),
  );
  const councilDirectiveDismissed = await page.evaluate(() => ({
    planStillVisible: [...document.querySelectorAll('.council-priority h3, .operation-plan h3')].some((node) =>
      node.textContent?.includes('Турция'),
    ),
    cardStillVisible: Boolean(document.querySelector('.council-decision-card h3')?.textContent?.includes('Турция')),
  }));
  await page.locator('.chat-tabs button').filter({ hasText: 'Альянс' }).click();
  const chatTabDiagnostics = await page.evaluate(() => {
    const active = document.querySelector('.chat-tabs button.active');
    const alliance = [...document.querySelectorAll('.chat-tabs button')].find((button) =>
      button.textContent?.includes('Альянс'),
    );
    return {
      activeText: active?.textContent?.trim() || '',
      allianceSelected: alliance?.getAttribute('aria-selected') === 'true',
    };
  });
  await page.locator('.mail-row-button').first().click();
  await page.waitForSelector('.letter-dialog');
  const letterResponseBefore = await page.evaluate(() => {
    const dialog = document.querySelector('.letter-dialog');
    const rightPanel = document.querySelector('.right-panel');
    const dialogRect = dialog?.getBoundingClientRect();
    const rightPanelRect = rightPanel?.getBoundingClientRect();
    const responseButtons = [...document.querySelectorAll('.letter-dialog-response')];
    const textNodes = [...(dialog?.querySelectorAll('p, button, small, span') || [])];
    const smallTextNodes = textNodes.filter((node) => Number.parseFloat(getComputedStyle(node).fontSize) < 12);
    const overflowingNodes = [...(dialog?.querySelectorAll('*') || [])].filter(
      (node) => node.scrollWidth > node.clientWidth + 2,
    );

    return {
      hasDialog: Boolean(dialog),
      role: dialog?.getAttribute('role') || '',
      modal: dialog?.getAttribute('aria-modal') || '',
      responseCount: responseButtons.length,
      firstResponse: responseButtons[0]?.querySelector('span')?.textContent?.trim() || '',
      visibleWidth: dialogRect?.width || 0,
      visibleHeight: dialogRect?.height || 0,
      outsideRightPanel: Boolean(dialogRect && rightPanelRect && dialogRect.left < rightPanelRect.left - 12),
      closeButtonExists: Boolean(dialog?.querySelector('.dialog-close')),
      smallTextCount: smallTextNodes.length,
      overflowCount: overflowingNodes.length,
    };
  });
  await page.locator('.letter-dialog-response').first().click();
  await page.waitForTimeout(120);
  const letterResponseAfter = await page.evaluate(() => ({
    answeredCount: document.querySelectorAll('.mail-item.answered').length,
    selectedStatus: document.querySelector('.letter-dialog em')?.textContent?.trim() || '',
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.trim() || '',
    timelineHasResponse: [...document.querySelectorAll('.timeline-panel article h3')].some((node) =>
      node.textContent?.includes('Ответ отправлен') || node.textContent?.includes('торговый канал'),
    ),
    responseDisabled: Boolean(document.querySelector('.letter-dialog-response')?.disabled),
  }));
  await page.locator('.letter-dialog .dialog-close').click();
  await page.waitForFunction(() => document.querySelectorAll('.letter-dialog').length === 0);
  const letterDialogClosed = (await page.locator('.letter-dialog').count()) === 0;

  const orderRemovalBefore = await page.evaluate(() => ({
    count: document.querySelectorAll('.order-card').length,
    heading: document.querySelector('.orders-panel .panel-heading h2 span')?.textContent || '',
    firstTitle: document.querySelector('.order-card h3')?.textContent?.trim() || '',
  }));
  await page.locator('.order-card').first().locator('button').last().click();
  await page.waitForTimeout(120);
  const orderRemovalAfter = await page.evaluate(() => ({
    count: document.querySelectorAll('.order-card').length,
    heading: document.querySelector('.orders-panel .panel-heading h2 span')?.textContent || '',
    firstTitle: document.querySelector('.order-card h3')?.textContent?.trim() || '',
    cancelledVisible: [...document.querySelectorAll('.order-card .status')].some((node) =>
      node.textContent?.includes('Отмен'),
    ),
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.trim() || '',
    timelineHasCancel: [...document.querySelectorAll('.timeline-panel article h3')].some((node) =>
      node.textContent?.includes('Приказ отменен'),
    ),
  }));
  const orderRemovalDiagnostics = {
    before: orderRemovalBefore,
    after: orderRemovalAfter,
    removedFromList: orderRemovalAfter.count === Math.max(0, orderRemovalBefore.count - 1),
    firstChanged: orderRemovalBefore.count <= 1 || orderRemovalAfter.firstTitle !== orderRemovalBefore.firstTitle,
    logged: orderRemovalAfter.timelineHasCancel,
  };
  const orderCounterBeforeDialog = await page.locator('.orders-panel .panel-heading h2 span').textContent();
  const proposalCountBeforeDialog = await page.locator('.council-priority, .operation-plan').count();
  await page.locator('.create-order').click();
  await page.waitForSelector('[role="dialog"]');
  const dialogOpened = await page.locator('[role="dialog"]').isVisible();
  await page.locator('[role="dialog"]').getByRole('button', { name: 'Подтвердить приказ' }).click();
  await page.waitForTimeout(120);
  const orderCounterAfterDialog = await page.locator('.orders-panel .panel-heading h2 span').textContent();
  const proposalCountAfterDialog = await page.locator('.council-priority, .operation-plan').count();
  const proposalTitleAfterDialog = await page.locator('.council-priority h3, .operation-plan h3').first().textContent();

  const readRightPanelState = () =>
    page.evaluate(() => ({
      timelineTitles: [...document.querySelectorAll('.timeline-panel article h3')].map((node) =>
        node.textContent?.trim(),
      ),
      letterSubjects: [...document.querySelectorAll('.mail-panel article p')].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
      mailCount: document.querySelectorAll('.mail-panel article').length,
      operationPlanTitles: [...document.querySelectorAll('.council-priority h3, .operation-plan h3')].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    }));

  const beforeComposeLetter = await readRightPanelState();
  await page.locator('.quick-actions button').first().click();
  await page.waitForTimeout(120);
  const afterComposeLetter = await readRightPanelState();
  const composeButtonDisabled = await page.locator('.quick-actions button').first().isDisabled();
  const quickCouncilTemplateDiagnostics = await page.evaluate(() => {
    const activeNav = document.querySelector('.primary-nav .active')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const activeChatTab = document.querySelector('.chat-tabs button.active')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const firstButton = document.querySelector('.quick-actions button');
    const firstButtonSmall = firstButton?.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const latestCouncilMessage =
      [...document.querySelectorAll('.chat-messages p')]
        .at(-1)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() || '';
    const cardTitle = document.querySelector('.council-decision-card h3')?.textContent?.replace(/\s+/g, ' ').trim() || '';

    return {
      activeNav,
      activeChatTab,
      firstButtonText: firstButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      firstButtonSmall,
      firstButtonAria: firstButton?.getAttribute('aria-label') || '',
      latestCouncilMessage,
      cardTitle,
    };
  });
  const composeAction = {
    beforeComposeLetter,
    afterComposeLetter,
    composeButtonDisabled,
    quickCouncilTemplateDiagnostics,
    inboxCountUnchanged: afterComposeLetter.mailCount === beforeComposeLetter.mailCount,
    noOutgoingInInbox: !afterComposeLetter.letterSubjects.some((subject) => subject?.includes('Исходящее')),
    proposalCountChanged: afterComposeLetter.operationPlanTitles.length > beforeComposeLetter.operationPlanTitles.length,
    preparedTimelineCount: afterComposeLetter.timelineTitles.filter((title) => title === 'Совет подготовил предложение').length,
  };

  const rightPanelLayoutDiagnostics = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
      };
    };
    const ordered = (first, second) => Boolean(first && second && first.bottom <= second.top + 1);

    const timeline = rect('.timeline-panel');
    const mail = rect('.mail-panel');
    const diplomacy = rect('.diplomacy-panel');
    const mailList = rect('.mail-list');
    const showAll = rect('.mail-panel .show-all');
    const timelinePanel = document.querySelector('.timeline-panel');
    const mailPanel = document.querySelector('.mail-panel');

    return {
      panelsStacked: ordered(timeline, mail) && ordered(mail, diplomacy),
      mailPartsStacked: ordered(mailList, showAll),
      showAllInsideMail: Boolean(showAll && mail && showAll.bottom <= mail.bottom + 1),
      timelineOverflowY: timelinePanel ? getComputedStyle(timelinePanel).overflowY : '',
      mailOverflowY: mailPanel ? getComputedStyle(mailPanel).overflowY : '',
    };
  });

  const mailPanelReadabilityDiagnostics = await page.evaluate(() => {
    const list = document.querySelector('.mail-list');
    const showAll = document.querySelector('.mail-panel .show-all');
    const mailPanel = document.querySelector('.mail-panel');
    if (!list || !showAll || !mailPanel) {
      return { exists: false };
    }

    const listRect = list.getBoundingClientRect();
    const showAllRect = showAll.getBoundingClientRect();
    const mailPanelRect = mailPanel.getBoundingClientRect();
    const rowBoxes = [...document.querySelectorAll('.mail-row-button')].map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    });
    const orderedRows = rowBoxes.every((row, index) => {
      const next = rowBoxes[index + 1];
      return !next || row.bottom <= next.top + 1;
    });
    const fullyVisibleRows = rowBoxes.filter((row) => row.top >= listRect.top - 1 && row.bottom <= listRect.bottom + 1);

    return {
      exists: true,
      listOverflowY: getComputedStyle(list).overflowY,
      rowCount: rowBoxes.length,
      minRowHeight: rowBoxes.reduce((min, row) => Math.min(min, row.height), Number.POSITIVE_INFINITY),
      orderedRows,
      fullyVisibleRowCount: fullyVisibleRows.length,
      hasInlineDetail: Boolean(document.querySelector('.mail-panel .letter-detail')),
      hasInlineResponses: Boolean(document.querySelector('.mail-panel .letter-response-list')),
      showAllInsidePanel: showAllRect.bottom <= mailPanelRect.bottom + 1,
      listBeforeButton: listRect.bottom <= showAllRect.top + 1,
      listHeight: listRect.height,
    };
  });

  const timelineRowDiagnostics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.timeline-panel article')].map((node) => {
      const row = node.getBoundingClientRect();
      const title = node.querySelector('h3')?.getBoundingClientRect();
      const body = node.querySelector('p')?.getBoundingClientRect();
      const time = node.querySelector('time')?.getBoundingClientRect();

      return {
        height: row.height,
        textFits:
          (!title || title.top >= row.top - 1 && title.bottom <= row.bottom + 1) &&
          (!body || body.top >= row.top - 1 && body.bottom <= row.bottom + 1) &&
          (!time || time.top >= row.top - 1 && time.bottom <= row.bottom + 1),
      };
    });
    const noOverlap = rows.every((_, index) => {
      const current = document.querySelectorAll('.timeline-panel article')[index]?.getBoundingClientRect();
      const next = document.querySelectorAll('.timeline-panel article')[index + 1]?.getBoundingClientRect();
      return !current || !next || current.bottom <= next.top + 1;
    });

    return {
      count: rows.length,
      minHeight: rows.reduce((min, row) => Math.min(min, row.height), Number.POSITIVE_INFINITY),
      textFits: rows.every((row) => row.textFits),
      noOverlap,
    };
  });

  const readGameState = () =>
    page.evaluate(() => ({
      resources: [...document.querySelectorAll('.resource-list li')].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
      turn: document.querySelector('.turn-info strong')?.textContent || '',
      timelineTop: document.querySelector('.timeline-panel article h3')?.textContent || '',
      orderCounter: document.querySelector('.orders-panel .panel-heading h2 span')?.textContent || '',
      operationPlanCount: document.querySelectorAll('.council-priority, .operation-plan').length,
      operationPlanTop: document.querySelector('.council-priority h3, .operation-plan h3')?.textContent?.trim() || '',
    }));

  const beforeGameAction = await readGameState();
  await page.locator('.quick-actions button').nth(2).click();
  await page.waitForTimeout(120);
  const afterLandManagement = await readGameState();
  await page.locator('.end-turn-button').dblclick();
  await page.waitForTimeout(120);
  const afterEndTurn = await readGameState();
  const orderCounterMoveDiagnostics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.order-countermove')].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim() || '',
    );

    return {
      count: rows.length,
      first: rows[0] || '',
      hasChance: rows.some((text) => text.includes('шанс')),
      hasPressure: rows.some((text) => text.includes('давление')),
    };
  });
  await page.waitForSelector('.strategic-response');
  const strategicResponseBefore = await page.evaluate(() => {
    const responses = [...document.querySelectorAll('.strategic-response')];

    return {
      count: responses.length,
      firstTitle: responses[0]?.querySelector('b')?.textContent?.trim() || '',
      firstButton: responses[0]?.querySelector('button')?.textContent?.trim() || '',
      hasEnabledButton: responses.some((response) => !response.querySelector('button')?.disabled),
    };
  });
  await page.locator('.strategic-response button').first().click();
  await page.waitForTimeout(160);
  const afterStrategicResponse = await readGameState();
  const strategicResponseAfter = await page.evaluate(() => {
    const responses = [...document.querySelectorAll('.strategic-response')];
    const firstButton = responses[0]?.querySelector('button');

    return {
      firstUsed: responses[0]?.classList.contains('used') || false,
      firstButtonText: firstButton?.textContent?.trim() || '',
      firstButtonDisabled: Boolean(firstButton?.disabled),
      toast: document.querySelector('.toast')?.textContent || '',
    };
  });
  await page.getByLabel('Закрыть отчет хода').click();
  await page.waitForTimeout(80);
  await page.locator('.order-card').nth(1).locator('button').first().click();
  const orderDetailsVisible = (await page.locator('.order-expanded').count()) > 0;
  const composeButtonUnlockedAfterTurn = !(await page.locator('.quick-actions button').first().isDisabled());
  const savedTurnAfterReload = await (async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell');
    return page.locator('.turn-info strong').first().textContent();
  })();
  const countryIntentAfterReload = await page.evaluate(() => {
    const intent = document.querySelector('.country-intent');
    const text = intent?.textContent?.replace(/\s+/g, ' ').trim() || '';

    return {
      text,
      hasIntentBlock: Boolean(intent),
      hasTurnIntent: text.includes('уверенность') || text.includes('цель:') || text.includes('Намерение'),
    };
  });
  const buttonNameDiagnostics = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll('button')].filter((button) => {
      const label = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '';
      return !label.trim();
    });
    return {
      unnamedCount: unnamed.length,
      unnamedClasses: unnamed.map((button) => button.className.toString()),
    };
  });
  const gameCycle = {
    beforeGameAction,
    afterLandManagement,
    afterEndTurn,
    afterStrategicResponse,
    strategicResponseBefore,
    strategicResponseAfter,
    orderCounterMoveDiagnostics,
    orderDetailsVisible,
    composeButtonUnlockedAfterTurn,
    savedTurnAfterReload,
    countryIntentAfterReload,
    proposalChangedAfterAction:
      afterLandManagement.operationPlanCount > beforeGameAction.operationPlanCount,
    turnAdvanced: Number(afterEndTurn.turn) === Number(beforeGameAction.turn) + 1,
    resourcesChangedAfterTurn:
      afterLandManagement.resources.join('|') !== afterEndTurn.resources.join('|'),
    strategicResponseChangedState:
      afterStrategicResponse.orderCounter !== afterEndTurn.orderCounter ||
      afterStrategicResponse.resources.join('|') !== afterEndTurn.resources.join('|'),
  };

  await page.locator('.nav-link').last().dblclick();
  await page.waitForTimeout(90);
  const toastDiagnostics = await page.evaluate(() => ({
    count: document.querySelectorAll('.toast').length,
    visibleCount: document.querySelectorAll('.toast.visible').length,
    text: document.querySelector('.toast')?.textContent || '',
  }));
  const mailBadgeDiagnostics = await page.evaluate(() => {
    const navMail = [...document.querySelectorAll('.nav-link')].find((node) =>
      node.textContent?.includes('Письма'),
    );
    const topMail = document.querySelector('.top-actions button[aria-label="Почта"]');
    const panelCount = document.querySelector('.mail-panel h2 span')?.textContent || '';

    return {
      navBadge: navMail?.querySelector('.pill')?.textContent || '',
      topBadge: topMail?.querySelector('b')?.textContent || '',
      panelCount,
    };
  });
  const empirePulseDiagnostics = await page.evaluate(() => {
    const pulse = document.querySelector('.empire-pulse');
    const rows = [...(pulse?.querySelectorAll('div') || [])].map((node) => {
      const box = node.getBoundingClientRect();
      const label = node.querySelector('span');
      const value = node.querySelector('b');

      return {
        height: box.height,
        labelText: label?.textContent?.trim() || '',
        valueText: value?.textContent?.trim() || '',
        labelFontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0,
        valueFontSize: value ? Number.parseFloat(getComputedStyle(value).fontSize) : 0,
      };
    });

    return {
      exists: Boolean(pulse),
      rowCount: rows.length,
      rows,
      hasInlineNote: Boolean(pulse?.querySelector('p')),
    };
  });
  const turnObjectiveDiagnostics = await page.evaluate(() => {
    const card = document.querySelector('.empire-card');
    const objective = document.querySelector('.turn-objective');
    const title = objective?.querySelector('h2');
    const summary = objective?.querySelector('p');
    const action = objective?.querySelector('small');
    const meter = objective?.querySelector('.turn-objective-meter i');
    const objectiveBox = objective?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    const textNodes = [title, summary, action].filter(Boolean);

    return {
      exists: Boolean(objective),
      title: title?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summary: summary?.textContent?.replace(/\s+/g, ' ').trim() || '',
      action: action?.textContent?.replace(/\s+/g, ' ').trim() || '',
      aria: objective?.getAttribute('aria-label') || '',
      tone:
        objective?.classList.contains('danger')
          ? 'danger'
          : objective?.classList.contains('warning')
            ? 'warning'
            : objective?.classList.contains('opportunity')
              ? 'opportunity'
              : objective?.classList.contains('steady')
                ? 'steady'
                : '',
      meterWidth: meter?.getBoundingClientRect().width || 0,
      height: objectiveBox?.height || 0,
      contained: Boolean(cardBox && objectiveBox && objectiveBox.top >= cardBox.top - 1 && objectiveBox.bottom <= cardBox.bottom + 1),
      textReadable: textNodes.every((node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 10.5),
      overflowCount: [...(objective?.querySelectorAll('*') || [])].filter(
        (node) => node.scrollWidth > node.clientWidth + 2 && node.tagName !== 'H2',
      ).length,
    };
  });
  const quickActionsFitDiagnostics = await page.evaluate(() => {
    const card = document.querySelector('.empire-card');
    const actions = document.querySelector('.quick-actions');
    if (!card || !actions) {
      return { exists: false };
    }

    const cardBox = card.getBoundingClientRect();
    const actionBox = actions.getBoundingClientRect();
    const buttons = [...actions.querySelectorAll('button')].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        status: node.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        aria: node.getAttribute('aria-label') || '',
      };
    });

    return {
      exists: true,
      buttonCount: buttons.length,
      minButtonHeight: buttons.reduce((min, button) => Math.min(min, button.height), Number.POSITIVE_INFINITY),
      allButtonsInsideCard: buttons.every((button) => button.top >= cardBox.top - 1 && button.bottom <= cardBox.bottom + 1),
      allButtonsInsideActions: buttons.every(
        (button) => button.top >= actionBox.top - 1 && button.bottom <= actionBox.bottom + 1,
      ),
      actionsInsideCard: actionBox.top >= cardBox.top - 1 && actionBox.bottom <= cardBox.bottom + 1,
      actionsNeedScroll: actions.scrollHeight > actions.clientHeight + 1,
      statuses: buttons.map((button) => button.status),
      ariaFilled: buttons.every((button) => button.aria.length > 20),
    };
  });

  const diplomacyRelationBadgeDiagnostics = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('.diplomacy-row .relation-score')].map((node) => {
      const box = node.getBoundingClientRect();
      const label = node.querySelector('span')?.getBoundingClientRect();
      const value = node.querySelector('b')?.getBoundingClientRect();

      return {
        width: box.width,
        height: box.height,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        labelAndValueInline: Boolean(label && value && Math.abs(label.top - value.top) < 3),
        overflows: node.scrollWidth > node.clientWidth + 1,
      };
    });

    return {
      count: badges.length,
      minWidth: badges.reduce((min, badge) => Math.min(min, badge.width), Number.POSITIVE_INFINITY),
      maxHeight: badges.reduce((max, badge) => Math.max(max, badge.height), 0),
      allInline: badges.every((badge) => badge.labelAndValueInline),
      anyOverflow: badges.some((badge) => badge.overflows),
      samples: badges.slice(0, 4),
    };
  });

  const ordersProposalLayoutDiagnostics = await page.evaluate(() => {
    const panel = document.querySelector('.orders-panel');
    const create = document.querySelector('.orders-panel .create-order');
    const list = document.querySelector('.operation-plan-list');
    const priority = document.querySelector('.council-priority');
    const priorityBox = priority?.getBoundingClientRect();
    const plans = [...document.querySelectorAll('.operation-plan')].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        height: box.height,
        actionCount: node.querySelectorAll('.operation-plan-actions button').length,
        actionRowVisible: Boolean(node.querySelector('.operation-plan-actions')?.getBoundingClientRect().height),
      };
    });

    const panelBox = panel?.getBoundingClientRect();
    const createBox = create?.getBoundingClientRect();
    const priorityButtons = [...(priority?.querySelectorAll('button') || [])].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim() || '',
    );

    return {
      exists: Boolean(panel && create),
      priorityExists: Boolean(priority),
      priorityLabel: priority?.getAttribute('aria-label') || '',
      priorityTitle: priority?.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      priorityReason: priority?.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      priorityMetricCount: priority?.querySelectorAll('.council-priority-facts li').length || 0,
      priorityButtons,
      priorityInsidePanel: Boolean(
        panelBox && priorityBox && priorityBox.top >= panelBox.top - 1 && priorityBox.bottom <= panelBox.bottom + 1,
      ),
      createInsidePanel: Boolean(panelBox && createBox && createBox.bottom <= panelBox.bottom + 1),
      createVisibleHeight: createBox?.height || 0,
      planCount: plans.length + (priority ? 1 : 0),
      minPlanHeight: plans.reduce((min, plan) => Math.min(min, plan.height), Number.POSITIVE_INFINITY),
      firstPlanHasActions: (plans[0]?.actionCount === 3 && plans[0]?.actionRowVisible) || priorityButtons.length >= 3,
      listOverflowY: list ? getComputedStyle(list).overflowY : '',
      listCanScroll: list ? list.scrollHeight >= list.clientHeight : false,
    };
  });

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = {
    loaded: true,
    initialTitle,
    legacyScriptLoaded,
    legacyScriptResponse,
    countryCount,
    liveMapDiagnostics,
    liveMarkerClickSelectedUkraine,
    routesState,
    labelsLayerState,
    beforeZoom,
    afterZoom,
    tooltip,
    selectedRussia,
    keyboardSelectedFrance,
    countryIntelFlagDiagnostics,
    countryIntelFlagsWork,
    countryIntelStillUsesEmojiFallback,
    countryIntelShowsTextCode,
    countryIntelActionDiagnostics,
    countryIntelClosed,
    countrySelectionAfterClose,
    chronicleHighlightLabel,
    chronicleDialogDiagnostics,
    chronicleDialogClosed,
    chronicleArchiveDiagnostics,
    chronicleArchiveOpensEntry,
    chronicleArchiveClosed,
    diplomacyScrollDiagnostics,
    diplomacyDossierDiagnostics,
    diplomacyDossierCloseDiagnostics,
    councilDirectiveDiagnostics,
    councilDirectiveDismissed,
    chatTabDiagnostics,
    letterResponseBefore,
    letterResponseAfter,
    letterDialogClosed,
    chatAdded: chatText.includes('Разведать Турцию'),
    orderRemovalDiagnostics,
    orderCounterBeforeDialog,
    dialogOpened,
    orderCounterAfterDialog,
    proposalCountBeforeDialog,
    proposalCountAfterDialog,
    proposalTitleAfterDialog,
    composeAction,
    rightPanelLayoutDiagnostics,
    mailPanelReadabilityDiagnostics,
    timelineRowDiagnostics,
    gameCycle,
    toastDiagnostics,
    mailBadgeDiagnostics,
    empirePulseDiagnostics,
    turnObjectiveDiagnostics,
    quickActionsFitDiagnostics,
    diplomacyRelationBadgeDiagnostics,
    ordersProposalLayoutDiagnostics,
    consoleErrors,
    screenshot: screenshotPath,
  };

  const failed =
    legacyScriptLoaded ||
    legacyScriptResponse.servesLegacyJs ||
    countryCount < 30 ||
    liveMapDiagnostics.markerCount < 3 ||
    liveMapDiagnostics.linkCount < 1 ||
    !liveMapDiagnostics.hasUkraineMarker ||
    !liveMapDiagnostics.hasIndiaSignal ||
    !liveMapDiagnostics.ukraineClass.includes('live-') ||
    !liveMarkerClickSelectedUkraine ||
    routesState !== 'off' ||
    !afterZoom.includes('1.12') ||
    !selectedRussia ||
    !keyboardSelectedFrance.selected ||
    keyboardSelectedFrance.role !== 'button' ||
    !keyboardSelectedFrance.label?.includes('Франция') ||
    !countryIntelFlagsWork ||
    countryIntelStillUsesEmojiFallback ||
    countryIntelShowsTextCode.text ||
    countryIntelShowsTextCode.pseudoText.includes('DZ') ||
    countryIntelShowsTextCode.pseudoText.includes('BR') ||
    !countryIntelActionDiagnostics.diplomacyHasBrazil ||
    !countryIntelActionDiagnostics.goldChanged ||
    !countryIntelActionDiagnostics.intelUpdated ||
    countryIntelActionDiagnostics.operationPlanDiagnostics.count < 1 ||
    !countryIntelActionDiagnostics.operationPlanDiagnostics.hasRunButton ||
    !countryIntelActionDiagnostics.operationPlanDiagnostics.hasDismissButton ||
    !countryIntelClosed ||
    countrySelectionAfterClose.selectedCount !== 0 ||
    chronicleHighlightLabel !== 'Главное событие' ||
    !chronicleDialogDiagnostics.exists ||
    chronicleDialogDiagnostics.role !== 'dialog' ||
    chronicleDialogDiagnostics.modal !== 'true' ||
    chronicleDialogDiagnostics.title.length < 4 ||
    chronicleDialogDiagnostics.metrics < 3 ||
    chronicleDialogDiagnostics.meaningText.length < 40 ||
    chronicleDialogDiagnostics.visibleHeight < 330 ||
    chronicleDialogDiagnostics.visibleWidth < 640 ||
    !chronicleDialogDiagnostics.outsideRightPanel ||
    !chronicleDialogDiagnostics.closeButtonExists ||
    chronicleDialogDiagnostics.smallTextCount > 0 ||
    chronicleDialogDiagnostics.overflowCount > 0 ||
    !chronicleDialogClosed ||
    !chronicleArchiveDiagnostics.exists ||
    chronicleArchiveDiagnostics.role !== 'dialog' ||
    chronicleArchiveDiagnostics.modal !== 'true' ||
    chronicleArchiveDiagnostics.rowCount < 3 ||
    chronicleArchiveDiagnostics.minRowHeight < 58 ||
    chronicleArchiveDiagnostics.visibleWidth < 620 ||
    !chronicleArchiveDiagnostics.outsideRightPanel ||
    chronicleArchiveDiagnostics.smallTextCount > 0 ||
    chronicleArchiveDiagnostics.overflowCount > 0 ||
    !chronicleArchiveOpensEntry ||
    !chronicleArchiveClosed ||
    !diplomacyScrollDiagnostics.exists ||
    !['auto', 'scroll'].includes(diplomacyScrollDiagnostics.overflowY) ||
    !diplomacyScrollDiagnostics.canReachBottom ||
    !diplomacyScrollDiagnostics.contained ||
    !diplomacyDossierDiagnostics.exists ||
    diplomacyDossierDiagnostics.role !== 'dialog' ||
    diplomacyDossierDiagnostics.modal !== 'true' ||
    !diplomacyDossierDiagnostics.rowExpanded ||
    !diplomacyDossierDiagnostics.meterText.includes('/100') ||
    diplomacyDossierDiagnostics.activityText.length < 20 ||
    diplomacyDossierDiagnostics.metrics.length < 3 ||
    diplomacyDossierDiagnostics.visibleHeight < 360 ||
    diplomacyDossierDiagnostics.visibleWidth < 680 ||
    !diplomacyDossierDiagnostics.outsideRightPanel ||
    !diplomacyDossierDiagnostics.closeButtonExists ||
    diplomacyDossierDiagnostics.smallTextCount > 0 ||
    diplomacyDossierDiagnostics.overflowCount > 0 ||
    !diplomacyDossierCloseDiagnostics.closed ||
    diplomacyDossierCloseDiagnostics.expandedRows !== 0 ||
    !result.chatAdded ||
    !councilDirectiveDiagnostics.exists ||
    councilDirectiveDiagnostics.roleLabel !== 'Решение Совета' ||
    !councilDirectiveDiagnostics.title.includes('Турция') ||
    councilDirectiveDiagnostics.summary.length < 30 ||
    councilDirectiveDiagnostics.metrics.length < 4 ||
    !councilDirectiveDiagnostics.metrics.some((metric) => metric.includes('%')) ||
    !councilDirectiveDiagnostics.metrics.some((metric) => metric.includes('ход')) ||
    !councilDirectiveDiagnostics.buttons.includes('Утвердить') ||
    !councilDirectiveDiagnostics.buttons.includes('Уточнить') ||
    !councilDirectiveDiagnostics.buttons.includes('Отложить') ||
    !councilDirectiveDiagnostics.planTitles.some((title) => title.includes('Турция')) ||
    !councilDirectiveDiagnostics.advisorReply.includes('подготовил предложение') ||
    !councilDirectiveDiagnostics.contained ||
    councilDirectiveDiagnostics.smallTextCount > 0 ||
    councilDirectiveDiagnostics.overflowCount > 0 ||
    councilDirectiveDismissed.planStillVisible ||
    councilDirectiveDismissed.cardStillVisible ||
    chatTabDiagnostics.activeText !== 'Альянс' ||
    !chatTabDiagnostics.allianceSelected ||
    !letterResponseBefore.hasDialog ||
    letterResponseBefore.role !== 'dialog' ||
    letterResponseBefore.modal !== 'true' ||
    letterResponseBefore.responseCount < 2 ||
    letterResponseBefore.visibleHeight < 330 ||
    letterResponseBefore.visibleWidth < 640 ||
    !letterResponseBefore.outsideRightPanel ||
    !letterResponseBefore.closeButtonExists ||
    letterResponseBefore.smallTextCount > 0 ||
    letterResponseBefore.overflowCount > 0 ||
    letterResponseAfter.answeredCount < 1 ||
    !letterResponseAfter.responseDisabled ||
    !letterResponseAfter.timelineHasResponse ||
    !letterDialogClosed ||
    !orderRemovalDiagnostics.removedFromList ||
    !orderRemovalDiagnostics.firstChanged ||
    orderRemovalDiagnostics.after.cancelledVisible ||
    !orderRemovalDiagnostics.logged ||
    !dialogOpened ||
    orderCounterAfterDialog !== orderCounterBeforeDialog ||
    proposalCountAfterDialog <= proposalCountBeforeDialog ||
    !proposalTitleAfterDialog?.includes('Развить инфраструктуру') ||
    !composeAction.composeButtonDisabled ||
    !composeAction.inboxCountUnchanged ||
    !composeAction.noOutgoingInInbox ||
    !composeAction.proposalCountChanged ||
    composeAction.preparedTimelineCount < 1 ||
    !composeAction.quickCouncilTemplateDiagnostics.activeNav.includes('Совет') ||
    composeAction.quickCouncilTemplateDiagnostics.activeChatTab !== 'Совет' ||
    composeAction.quickCouncilTemplateDiagnostics.firstButtonSmall !== 'подготовлено' ||
    !composeAction.quickCouncilTemplateDiagnostics.firstButtonAria.includes('текущем ходу') ||
    !composeAction.quickCouncilTemplateDiagnostics.latestCouncilMessage.includes('рабочее предложение') ||
    !composeAction.quickCouncilTemplateDiagnostics.cardTitle.includes('Письмо союзникам') ||
    !rightPanelLayoutDiagnostics.panelsStacked ||
    !rightPanelLayoutDiagnostics.mailPartsStacked ||
    !rightPanelLayoutDiagnostics.showAllInsideMail ||
    rightPanelLayoutDiagnostics.timelineOverflowY === 'visible' ||
    rightPanelLayoutDiagnostics.mailOverflowY === 'visible' ||
    !mailPanelReadabilityDiagnostics.exists ||
    !['auto', 'scroll'].includes(mailPanelReadabilityDiagnostics.listOverflowY) ||
    mailPanelReadabilityDiagnostics.minRowHeight < 38 ||
    !mailPanelReadabilityDiagnostics.orderedRows ||
    mailPanelReadabilityDiagnostics.fullyVisibleRowCount < 2 ||
    mailPanelReadabilityDiagnostics.hasInlineDetail ||
    mailPanelReadabilityDiagnostics.hasInlineResponses ||
    !mailPanelReadabilityDiagnostics.showAllInsidePanel ||
    !mailPanelReadabilityDiagnostics.listBeforeButton ||
    mailPanelReadabilityDiagnostics.listHeight < 90 ||
    timelineRowDiagnostics.count < 3 ||
    timelineRowDiagnostics.minHeight < 50 ||
    !timelineRowDiagnostics.textFits ||
    !timelineRowDiagnostics.noOverlap ||
    !gameCycle.proposalChangedAfterAction ||
    !gameCycle.turnAdvanced ||
    !gameCycle.resourcesChangedAfterTurn ||
    gameCycle.orderCounterMoveDiagnostics.count < 1 ||
    !gameCycle.orderCounterMoveDiagnostics.hasChance ||
    !gameCycle.orderDetailsVisible ||
    gameCycle.strategicResponseBefore.count < 1 ||
    !gameCycle.strategicResponseBefore.hasEnabledButton ||
    !gameCycle.strategicResponseAfter.firstUsed ||
    !gameCycle.strategicResponseAfter.firstButtonDisabled ||
    !gameCycle.strategicResponseChangedState ||
    !gameCycle.composeButtonUnlockedAfterTurn ||
    gameCycle.savedTurnAfterReload !== gameCycle.afterEndTurn.turn ||
    !gameCycle.countryIntentAfterReload.hasIntentBlock ||
    !gameCycle.countryIntentAfterReload.hasTurnIntent ||
    toastDiagnostics.count !== 1 ||
    toastDiagnostics.visibleCount !== 1 ||
    mailBadgeDiagnostics.navBadge !== mailBadgeDiagnostics.panelCount ||
    mailBadgeDiagnostics.topBadge !== mailBadgeDiagnostics.panelCount ||
    !empirePulseDiagnostics.exists ||
    empirePulseDiagnostics.rowCount < 3 ||
    empirePulseDiagnostics.hasInlineNote ||
    empirePulseDiagnostics.rows.some((row) => row.height < 20 || row.labelFontSize < 11 || row.valueFontSize < 11.8) ||
    !turnObjectiveDiagnostics.exists ||
    turnObjectiveDiagnostics.title.length < 8 ||
    turnObjectiveDiagnostics.summary.length < 20 ||
    turnObjectiveDiagnostics.action.length < 20 ||
    turnObjectiveDiagnostics.aria !== 'Цель текущего хода' ||
    !['danger', 'warning', 'opportunity', 'steady'].includes(turnObjectiveDiagnostics.tone) ||
    turnObjectiveDiagnostics.meterWidth < 8 ||
    turnObjectiveDiagnostics.height < 66 ||
    !turnObjectiveDiagnostics.contained ||
    !turnObjectiveDiagnostics.textReadable ||
    turnObjectiveDiagnostics.overflowCount > 0 ||
    !quickActionsFitDiagnostics.exists ||
    quickActionsFitDiagnostics.buttonCount < 6 ||
    quickActionsFitDiagnostics.minButtonHeight < 24 ||
    !quickActionsFitDiagnostics.allButtonsInsideCard ||
    !quickActionsFitDiagnostics.allButtonsInsideActions ||
    !quickActionsFitDiagnostics.actionsInsideCard ||
    quickActionsFitDiagnostics.actionsNeedScroll ||
    !quickActionsFitDiagnostics.ariaFilled ||
    !quickActionsFitDiagnostics.statuses.includes('шаблон') ||
    diplomacyRelationBadgeDiagnostics.count < 3 ||
    diplomacyRelationBadgeDiagnostics.minWidth < 68 ||
    diplomacyRelationBadgeDiagnostics.maxHeight > 38 ||
    !diplomacyRelationBadgeDiagnostics.allInline ||
    diplomacyRelationBadgeDiagnostics.anyOverflow ||
    !ordersProposalLayoutDiagnostics.exists ||
    !ordersProposalLayoutDiagnostics.priorityExists ||
    ordersProposalLayoutDiagnostics.priorityLabel !== 'Рекомендация Совета' ||
    ordersProposalLayoutDiagnostics.priorityTitle.length < 8 ||
    ordersProposalLayoutDiagnostics.priorityReason.length < 20 ||
    ordersProposalLayoutDiagnostics.priorityMetricCount < 4 ||
    !ordersProposalLayoutDiagnostics.priorityButtons.includes('Утвердить') ||
    !ordersProposalLayoutDiagnostics.priorityButtons.includes('Уточнить') ||
    !ordersProposalLayoutDiagnostics.priorityButtons.includes('Отложить') ||
    !ordersProposalLayoutDiagnostics.priorityInsidePanel ||
    !ordersProposalLayoutDiagnostics.createInsidePanel ||
    ordersProposalLayoutDiagnostics.createVisibleHeight < 32 ||
    ordersProposalLayoutDiagnostics.planCount < 1 ||
    ordersProposalLayoutDiagnostics.minPlanHeight < 68 ||
    !ordersProposalLayoutDiagnostics.firstPlanHasActions ||
    !['auto', 'scroll'].includes(ordersProposalLayoutDiagnostics.listOverflowY) ||
    buttonNameDiagnostics.unnamedCount !== 0 ||
    consoleErrors.length > 0;

  console.log(JSON.stringify(result, null, 2));

  if (failed) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
