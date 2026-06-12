import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const screenshotPath = 'tmp/playwright/modern-dashboard.png';
let server = null;
const usePreviewServer = process.argv.includes('--preview');
let baseUrl = usePreviewServer ? '' : process.env.SMOKE_URL || '';
const tinyAvatarPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/l5J0uQAAAABJRU5ErkJggg==',
  'base64',
);

if (!baseUrl) {
  server = usePreviewServer
    ? await preview({
        logLevel: 'error',
        preview: {
          host: '127.0.0.1',
          port: 0,
        },
      })
    : await createServer({
        logLevel: 'error',
        server: {
          host: '127.0.0.1',
          port: 0,
        },
      });

  if ('listen' in server && typeof server.listen === 'function') {
    await server.listen();
  }

  baseUrl = server.resolvedUrls?.local[0] || '';
}

if (!baseUrl) {
  throw new Error('Smoke test could not resolve an application URL');
}

await mkdir('tmp/playwright', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];
const failures = [];

async function closeServer(serverToClose) {
  if (!serverToClose) return;
  if ('close' in serverToClose && typeof serverToClose.close === 'function') {
    await serverToClose.close();
    return;
  }
  if (serverToClose.httpServer?.close) {
    await new Promise((resolve, reject) => {
      serverToClose.httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function readLayoutDiagnostics() {
  return page.evaluate(() => {
    const isVisible = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box
        ? {
            width: box.width,
            height: box.height,
            top: box.top,
            bottom: box.bottom,
            left: box.left,
            right: box.right,
          }
        : null;
    };
    const chatMessages = document.querySelector('.chat-messages');
    const chatPanel = rect('.chat-panel');
    const map = rect('.map-section');
    const rightPanel = rect('.right-panel');

    return {
      title: document.title,
      brand: document.querySelector('.brand-text')?.textContent?.trim() || '',
      appClasses: document.querySelector('.app-shell')?.className || '',
      nav: [...document.querySelectorAll('.primary-nav .nav-link')].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim() || '',
      ),
      countryCount: document.querySelectorAll('.country').length,
      map,
      rightPanel,
      chatPanel,
      quickActionsVisible: isVisible('.quick-actions'),
      ordersPanelVisible: isVisible('.orders-panel'),
      diplomacyPanelVisible: isVisible('.diplomacy-panel'),
      turnFlowVisible: isVisible('.turn-flow'),
      starterPromptsVisible: isVisible('.council-starter-prompts'),
      chatOverflowY: chatMessages ? getComputedStyle(chatMessages).overflowY : '',
      chatScrollHeight: chatMessages?.scrollHeight || 0,
      chatClientHeight: chatMessages?.clientHeight || 0,
      timelineRows: document.querySelectorAll('.timeline-panel article').length,
      mailRows: document.querySelectorAll('.mail-panel article').length,
      visibleRightPanels: [...document.querySelectorAll('.right-panel .framed-panel')].filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && box.height > 0 && box.width > 0;
      }).length,
      mailBadge: document.querySelector('.primary-nav .pill')?.textContent?.trim() || '',
    };
  });
}

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

page.on('pageerror', (error) => {
  consoleErrors.push(error.message);
});

await page.addInitScript(() => {
  window.localStorage.removeItem('letters-of-empires:game:v1');
  window.sessionStorage.clear();
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app-shell.minimal-shell');
  await page.waitForSelector('.world-svg');

  const loadedScripts = await page.evaluate(() => [...document.scripts].map((script) => script.src));
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

  const initialLayout = await readLayoutDiagnostics();

  await page.getByLabel('Профиль правителя').click();
  await page.waitForSelector('.profile-dialog');
  await page.locator('.profile-dialog input[aria-describedby="profileNameHint"]').fill('АндрейПравитель');
  await page.locator('.profile-dialog textarea').fill('Веду империю через письма, совет и карту.');
  await page.locator('.profile-dialog input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: tinyAvatarPng,
  });
  await page.waitForFunction(() =>
    document.querySelector('.profile-avatar-large img')?.getAttribute('src')?.startsWith('data:image/webp'),
  );
  const profileDialog = await page.evaluate(() => ({
    title: document.querySelector('.profile-dialog h2')?.textContent?.trim() || '',
    nameValue: document.querySelector('.profile-dialog input[aria-describedby="profileNameHint"]')?.value || '',
    counter: document.querySelector('.profile-field span b')?.textContent?.trim() || '',
    avatarType: document.querySelector('.profile-avatar-large img')?.getAttribute('src')?.slice(0, 15) || '',
    previewName: document.querySelector('.profile-preview-card h3')?.textContent?.trim() || '',
  }));
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.waitForFunction(() => !document.querySelector('.profile-dialog'));
  const profileAfterSave = await page.evaluate(() => {
    const topbarAvatar = document.querySelector('.profile-chip img');
    const leftAvatar = document.querySelector('.ruler-block img');
    const stateFlag = document.querySelector('.state-flag .flag');
    const rect = (node) => {
      const box = node?.getBoundingClientRect();
      return box ? { width: box.width, height: box.height } : null;
    };

    return {
      topbarName: document.querySelector('.profile-chip strong')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      leftName: document.querySelector('.ruler-block strong')?.textContent?.trim() || '',
      topbarAvatar: topbarAvatar?.getAttribute('src')?.slice(0, 15) || '',
      leftAvatar: leftAvatar?.getAttribute('src')?.slice(0, 15) || '',
      topbarAvatarBox: rect(topbarAvatar),
      leftAvatarBox: rect(leftAvatar),
      stateFlagBox: rect(stateFlag),
    };
  });

  await page.locator('#mapMode').click();
  await page.locator('.map-mode-menu button').nth(2).click();
  const mapModeTitle = await page.locator('#mapMode').textContent();

  await page.locator('#zoomIn').click();
  await page.waitForTimeout(120);
  const zoomTransform = await page.locator('#mapZoomLayer').evaluate((node) => getComputedStyle(node).transform);

  await page.locator('.country[data-name="France"]').evaluate((node) => node.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
  })));
  const selectedCountry = await page.evaluate(() => ({
    selected: document.querySelector('.country.selected')?.getAttribute('data-name') || '',
    intelTitle: document.querySelector('.country-intel strong')?.textContent?.trim() || '',
  }));

  await page.locator('.country-intel .country-intel-close').click();
  await page.waitForFunction(() => !document.querySelector('.country-intel'));
  const selectedAfterClose = await page.locator('.country.selected').count();

  await page.getByRole('tab', { name: 'Мир' }).click();
  for (let index = 0; index < 14; index += 1) {
    await page.locator('#chatInput').fill(`Публичное заявление ${index + 1}: Россия подтверждает спокойный канал.`);
    await page.locator('#chatForm').evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(25);
  }

  const chatScrollDiagnostics = await page.evaluate(() => {
    const messages = document.querySelector('.chat-messages');
    if (!messages) return { exists: false };
    messages.scrollTop = messages.scrollHeight;

    return {
      exists: true,
      overflowY: getComputedStyle(messages).overflowY,
      scrollHeight: messages.scrollHeight,
      clientHeight: messages.clientHeight,
      scrollTop: messages.scrollTop,
      messageCount: messages.querySelectorAll('p').length,
    };
  });

  await page.getByRole('tab', { name: 'Совет' }).click();
  await page.locator('#chatInput').fill('Совет, разведай Турцию и предложи безопасный план без резкой эскалации.');
  await page.locator('#chatForm').evaluate((form) => form.requestSubmit());
  await page.waitForSelector('.council-decision-card');

  const councilDecision = await page.evaluate(() => {
    const card = document.querySelector('.council-decision-card');
    const box = card?.getBoundingClientRect();

    return {
      exists: Boolean(card),
      title: card?.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      summary: card?.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      buttons: [...(card?.querySelectorAll('button') || [])].map((node) =>
        node.textContent?.replace(/\s+/g, ' ').trim() || '',
      ),
      visibleHeight: box?.height || 0,
    };
  });

  await page.locator('.council-decision-card .plan-run').click();
  await page.waitForSelector('.operation-plan-dialog');
  const planDialog = await page.evaluate(() => ({
    title: document.querySelector('.operation-plan-dialog h2')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    buttons: [...document.querySelectorAll('.operation-plan-dialog button')].map((node) =>
      node.textContent?.replace(/\s+/g, ' ').trim() || '',
    ),
    visibleWidth: document.querySelector('.operation-plan-dialog')?.getBoundingClientRect().width || 0,
  }));
  await page.locator('.operation-plan-dialog .dialog-secondary.primary').click();
  await page.waitForTimeout(220);

  const afterPlanApprove = await page.evaluate(() => ({
    toast: document.querySelector('.toast.visible')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    context: document.querySelector('.chat-context')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    timelineTop: document.querySelector('.timeline-panel article h3')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  }));

  const finalLayout = await readLayoutDiagnostics();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  assert(!loadedScripts.some((src) => src.includes('/js/app.js')), 'legacy app.js script should not be loaded');
  assert(!legacyScriptResponse.servesLegacyJs, 'legacy /js/app.js should not serve old JS');
  assert(initialLayout.brand === 'Письма Империй', 'brand should render');
  assert(initialLayout.appClasses.includes('minimal-shell'), 'minimal shell class should be enabled');
  assert(initialLayout.nav.length === 3, 'primary navigation should be reduced to three items');
  assert(initialLayout.nav.some((item) => item.includes('Карта мира')), 'map nav item should remain');
  assert(initialLayout.nav.some((item) => item.includes('Совет')), 'council nav item should remain');
  assert(initialLayout.nav.some((item) => item.includes('Письма')), 'mail nav item should remain');
  assert(initialLayout.countryCount > 100, 'world map countries should render');
  assert(initialLayout.map?.height > 430, 'map should stay the dominant top surface');
  assert(initialLayout.chatPanel?.width > 900, 'chat should occupy the full lower center');
  assert(initialLayout.quickActionsVisible === false, 'left quick action block should be removed');
  assert(initialLayout.ordersPanelVisible === false, 'separate orders dashboard should be removed');
  assert(initialLayout.diplomacyPanelVisible === false, 'permanent diplomacy list should be removed');
  assert(initialLayout.turnFlowVisible === false, 'turn flow strip should be removed from the main screen');
  assert(initialLayout.starterPromptsVisible === false, 'starter prompt buttons should not crowd the chat');
  assert(initialLayout.chatOverflowY === 'auto' || initialLayout.chatOverflowY === 'scroll', 'chat messages should be scrollable');
  assert(initialLayout.visibleRightPanels === 2, 'right rail should show only summary and mail');
  assert(initialLayout.timelineRows >= 2, 'world summary should still show events');
  assert(initialLayout.mailRows >= 2, 'mail summary should still show letters');
  assert(profileDialog.title === 'Настройки профиля', 'profile dialog should open from ruler profile');
  assert(profileDialog.nameValue === 'АндрейПравитель', 'profile nickname should accept Cyrillic text');
  assert(profileDialog.counter.endsWith('/15'), 'profile nickname limit should be visible');
  assert(profileDialog.avatarType === 'data:image/webp', 'profile avatar should be converted to WebP data URL');
  assert(profileDialog.previewName === 'АндрейПравитель', 'profile preview should reflect nickname');
  assert(profileAfterSave.topbarName.includes('АндрейПравитель'), 'saved profile name should update topbar');
  assert(profileAfterSave.leftName === 'АндрейПравитель', 'saved profile name should update empire panel');
  assert(profileAfterSave.topbarAvatar === 'data:image/webp', 'saved profile avatar should update topbar');
  assert(profileAfterSave.leftAvatar === 'data:image/webp', 'saved profile avatar should update empire panel');
  assert(profileAfterSave.topbarAvatarBox?.width >= 32, 'saved profile avatar should be visible in topbar');
  assert(profileAfterSave.leftAvatarBox?.width >= 32, 'saved profile avatar should be visible in empire panel');
  assert(profileAfterSave.stateFlagBox?.width >= 150, 'state flag should fill the ruler flag frame');
  assert(mapModeTitle?.includes('Стратегическая карта'), 'map mode switch should work');
  assert(zoomTransform.includes('matrix') || zoomTransform.includes('1.12'), 'zoom should change map transform');
  assert(selectedCountry.selected === 'France', 'country click should select France');
  assert(selectedCountry.intelTitle === 'Франция', 'country intel should open for selected country');
  assert(selectedAfterClose === 0, 'closing country intel should clear selected country highlight');
  assert(chatScrollDiagnostics.exists, 'chat message list should exist');
  assert(chatScrollDiagnostics.messageCount >= 14, 'world chat should accept repeated messages');
  assert(chatScrollDiagnostics.scrollHeight > chatScrollDiagnostics.clientHeight, 'chat should have real scroll overflow');
  assert(chatScrollDiagnostics.scrollTop > 0, 'chat scroll position should be adjustable');
  assert(councilDecision.exists, 'council command should create a decision card');
  assert(councilDecision.title.length > 8, 'council decision should have a readable title');
  assert(councilDecision.summary.length > 30, 'council decision should explain the plan');
  assert(councilDecision.buttons.includes('Утвердить'), 'council decision should keep approve action');
  assert(councilDecision.buttons.includes('Уточнить'), 'council decision should keep refine action');
  assert(councilDecision.buttons.includes('Отложить'), 'council decision should keep dismiss action');
  assert(councilDecision.visibleHeight > 70, 'council decision card should be visible');
  assert(planDialog.title.length > 8, 'plan dossier should open from council decision');
  assert(planDialog.buttons.includes('Утвердить приказ'), 'plan dossier should allow approving the order');
  assert(planDialog.visibleWidth > 640, 'plan dossier should open as a readable modal');
  assert(afterPlanApprove.toast.includes('Приказ') || afterPlanApprove.context.includes('Приказы'), 'approving a plan should update game state');
  assert(finalLayout.quickActionsVisible === false, 'quick actions should stay removed after interactions');
  assert(finalLayout.ordersPanelVisible === false, 'orders panel should stay removed after interactions');
  assert(finalLayout.diplomacyPanelVisible === false, 'diplomacy panel should stay removed after interactions');
  assert(finalLayout.chatOverflowY === 'auto' || finalLayout.chatOverflowY === 'scroll', 'chat scroll should stay enabled');
  assert(consoleErrors.length === 0, 'browser console should have no errors');

  const result = {
    loaded: true,
    initialLayout,
    profileDialog,
    profileAfterSave,
    mapModeTitle,
    selectedCountry,
    chatScrollDiagnostics,
    councilDecision,
    planDialog,
    afterPlanApprove,
    finalLayout,
    consoleErrors,
    failures,
    screenshot: screenshotPath,
  };

  console.log(JSON.stringify(result, null, 2));

  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await closeServer(server);
}
