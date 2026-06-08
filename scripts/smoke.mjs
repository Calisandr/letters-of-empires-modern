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
    diplomacyNames: [...document.querySelectorAll('.diplomacy-panel li b')].map((node) =>
      node.textContent?.trim(),
    ),
  }));
  await page.getByRole('button', { name: 'Посол: Бразилия' }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.diplomacy-panel li b')].some((node) => node.textContent?.includes('Бразилия')),
  );
  await page.getByRole('button', { name: 'Разведка: Бразилия' }).click();
  await page.waitForTimeout(120);
  await page.waitForSelector('.operation-plan');
  const afterCountryIntelAction = await page.evaluate(() => ({
    goldText: [...document.querySelectorAll('.resource-list li')].find((node) =>
      node.textContent?.includes('Золото'),
    )?.textContent || '',
    diplomacyNames: [...document.querySelectorAll('.diplomacy-panel li b')].map((node) =>
      node.textContent?.trim(),
    ),
    intelText: document.querySelector('.country-intel-activity')?.textContent?.trim() || '',
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.trim() || '',
  }));
  const operationPlanDiagnostics = await page.evaluate(() => {
    const plans = [...document.querySelectorAll('.operation-plan')];
    const first = plans[0];

    return {
      count: plans.length,
      title: first?.querySelector('h3')?.textContent?.trim() || '',
      hasRunButton: Boolean(first?.querySelector('.plan-run')?.textContent?.includes('Запустить')),
      hasDismissButton: Boolean(first?.querySelector('.plan-dismiss')),
      meta: first?.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
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
      itemCount: list.querySelectorAll('li').length,
      overflowY: style.overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      needsScroll,
      canReachBottom: !needsScroll || after > before,
      contained: listRect.top >= panelRect.top - 1 && listRect.bottom <= panelRect.bottom + 1,
    };
  });

  await page.locator('.country-intel-close').click();
  await page.waitForFunction(() => document.querySelectorAll('.country-intel').length === 0);
  const countryIntelClosed = (await page.locator('.country-intel').count()) === 0;
  const countrySelectionAfterClose = await page.evaluate(() => ({
    selectedCount: document.querySelectorAll('.world-svg .country.selected').length,
    selectedNames: [...document.querySelectorAll('.world-svg .country.selected')].map((node) => node.dataset.name),
  }));
  await franceCountry.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.country-intel');

  await page.locator('#chatInput').fill('React smoke message');
  await page.locator('.chat-input .send').click();
  const chatText = await page.locator('.chat-messages').innerText();
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
  const letterResponseBefore = await page.evaluate(() => ({
    hasDetail: Boolean(document.querySelector('.letter-detail')),
    responseCount: document.querySelectorAll('.letter-response').length,
    firstResponse: document.querySelector('.letter-response span')?.textContent?.trim() || '',
  }));
  await page.locator('.letter-response').first().click();
  await page.waitForTimeout(120);
  const letterResponseAfter = await page.evaluate(() => ({
    answeredCount: document.querySelectorAll('.mail-item.answered').length,
    selectedStatus: document.querySelector('.letter-detail em')?.textContent?.trim() || '',
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.trim() || '',
    timelineHasResponse: [...document.querySelectorAll('.timeline-panel article h3')].some((node) =>
      node.textContent?.includes('Ответ отправлен') || node.textContent?.includes('торговый канал'),
    ),
    responseDisabled: Boolean(document.querySelector('.letter-response')?.disabled),
  }));

  await page.locator('.order-card').first().locator('button').last().click();
  const cancelledStyle = await page.locator('.order-card').first().evaluate((node) => ({
    opacity: getComputedStyle(node).opacity,
    filter: getComputedStyle(node).filter,
  }));
  await page.locator('.create-order').click();
  await page.waitForSelector('[role="dialog"]');
  const dialogOpened = await page.locator('[role="dialog"]').isVisible();
  await page.locator('[role="dialog"]').getByRole('button', { name: 'Подтвердить приказ' }).click();
  await page.waitForTimeout(120);
  const orderCounterAfterDialog = await page.locator('.orders-panel .panel-heading h2 span').textContent();

  const readRightPanelState = () =>
    page.evaluate(() => ({
      timelineTitles: [...document.querySelectorAll('.timeline-panel article h3')].map((node) =>
        node.textContent?.trim(),
      ),
      letterSubjects: [...document.querySelectorAll('.mail-panel article p')].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim(),
      ),
      mailCount: document.querySelectorAll('.mail-panel article').length,
    }));

  const beforeComposeLetter = await readRightPanelState();
  await page.locator('.quick-actions button').first().click();
  await page.waitForTimeout(120);
  const afterComposeLetter = await readRightPanelState();
  const composeButtonDisabled = await page.locator('.quick-actions button').first().isDisabled();
  const composeAction = {
    beforeComposeLetter,
    afterComposeLetter,
    composeButtonDisabled,
    inboxCountUnchanged: afterComposeLetter.mailCount === beforeComposeLetter.mailCount,
    noOutgoingInInbox: !afterComposeLetter.letterSubjects.some((subject) => subject?.includes('Исходящее')),
    sentTimelineCount: afterComposeLetter.timelineTitles.filter((title) => title === 'Письмо союзникам отправлено').length,
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
    const letter = rect('.letter-detail');
    const showAll = rect('.mail-panel .show-all');
    const timelinePanel = document.querySelector('.timeline-panel');
    const mailPanel = document.querySelector('.mail-panel');

    return {
      panelsStacked: ordered(timeline, mail) && ordered(mail, diplomacy),
      mailPartsStacked: ordered(mailList, letter) && ordered(letter, showAll),
      showAllInsideMail: Boolean(showAll && mail && showAll.bottom <= mail.bottom + 1),
      timelineOverflowY: timelinePanel ? getComputedStyle(timelinePanel).overflowY : '',
      mailOverflowY: mailPanel ? getComputedStyle(mailPanel).overflowY : '',
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
    resourcesChangedAfterAction:
      beforeGameAction.resources.join('|') !== afterLandManagement.resources.join('|'),
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
    diplomacyScrollDiagnostics,
    chatTabDiagnostics,
    letterResponseBefore,
    letterResponseAfter,
    chatAdded: chatText.includes('React smoke message'),
    cancelledStyle,
    dialogOpened,
    orderCounterAfterDialog,
    composeAction,
    rightPanelLayoutDiagnostics,
    timelineRowDiagnostics,
    gameCycle,
    toastDiagnostics,
    mailBadgeDiagnostics,
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
    !diplomacyScrollDiagnostics.exists ||
    !['auto', 'scroll'].includes(diplomacyScrollDiagnostics.overflowY) ||
    !diplomacyScrollDiagnostics.canReachBottom ||
    !diplomacyScrollDiagnostics.contained ||
    !result.chatAdded ||
    chatTabDiagnostics.activeText !== 'Альянс' ||
    !chatTabDiagnostics.allianceSelected ||
    !letterResponseBefore.hasDetail ||
    letterResponseBefore.responseCount < 2 ||
    letterResponseAfter.answeredCount < 1 ||
    !letterResponseAfter.responseDisabled ||
    !letterResponseAfter.timelineHasResponse ||
    !dialogOpened ||
    !orderCounterAfterDialog?.includes('(3/5)') ||
    !composeAction.composeButtonDisabled ||
    !composeAction.inboxCountUnchanged ||
    !composeAction.noOutgoingInInbox ||
    composeAction.sentTimelineCount !== 1 ||
    !rightPanelLayoutDiagnostics.panelsStacked ||
    !rightPanelLayoutDiagnostics.mailPartsStacked ||
    !rightPanelLayoutDiagnostics.showAllInsideMail ||
    rightPanelLayoutDiagnostics.timelineOverflowY === 'visible' ||
    rightPanelLayoutDiagnostics.mailOverflowY === 'visible' ||
    timelineRowDiagnostics.count < 3 ||
    timelineRowDiagnostics.minHeight < 50 ||
    !timelineRowDiagnostics.textFits ||
    !timelineRowDiagnostics.noOverlap ||
    !gameCycle.resourcesChangedAfterAction ||
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
    buttonNameDiagnostics.unnamedCount !== 0 ||
    consoleErrors.length > 0;

  console.log(JSON.stringify(result, null, 2));

  if (failed) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
