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
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('trade-mode'));
  await page.locator('#mapMode').click();
  await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('strategy-mode'));

  await page.locator('#routeToggle').uncheck();
  const routesState = await page.locator('.app-shell').getAttribute('data-routes');

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

  await page.locator('#chatInput').fill('React smoke message');
  await page.locator('.chat-input .send').click();
  const chatText = await page.locator('.chat-messages').innerText();

  await page.locator('.order-card').first().locator('button').last().click();
  const cancelledStyle = await page.locator('.order-card').first().evaluate((node) => ({
    opacity: getComputedStyle(node).opacity,
    filter: getComputedStyle(node).filter,
  }));

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
  await page.locator('.end-turn-button').click();
  await page.waitForTimeout(120);
  const afterEndTurn = await readGameState();
  const composeButtonUnlockedAfterTurn = !(await page.locator('.quick-actions button').first().isDisabled());
  const gameCycle = {
    beforeGameAction,
    afterLandManagement,
    afterEndTurn,
    composeButtonUnlockedAfterTurn,
    resourcesChangedAfterAction:
      beforeGameAction.resources.join('|') !== afterLandManagement.resources.join('|'),
    turnAdvanced: Number(afterEndTurn.turn) === Number(beforeGameAction.turn) + 1,
    resourcesChangedAfterTurn:
      afterLandManagement.resources.join('|') !== afterEndTurn.resources.join('|'),
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
    routesState,
    beforeZoom,
    afterZoom,
    tooltip,
    selectedRussia,
    chatAdded: chatText.includes('React smoke message'),
    cancelledStyle,
    composeAction,
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
    routesState !== 'off' ||
    !afterZoom.includes('1.12') ||
    !selectedRussia ||
    !result.chatAdded ||
    !composeAction.composeButtonDisabled ||
    !composeAction.inboxCountUnchanged ||
    !composeAction.noOutgoingInInbox ||
    composeAction.sentTimelineCount !== 1 ||
    !gameCycle.resourcesChangedAfterAction ||
    !gameCycle.turnAdvanced ||
    !gameCycle.resourcesChangedAfterTurn ||
    !gameCycle.composeButtonUnlockedAfterTurn ||
    toastDiagnostics.count !== 1 ||
    toastDiagnostics.visibleCount !== 1 ||
    mailBadgeDiagnostics.navBadge !== mailBadgeDiagnostics.panelCount ||
    mailBadgeDiagnostics.topBadge !== mailBadgeDiagnostics.panelCount ||
    consoleErrors.length > 0;

  console.log(JSON.stringify(result, null, 2));

  if (failed) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
