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

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = {
    loaded: true,
    initialTitle,
    countryCount,
    routesState,
    beforeZoom,
    afterZoom,
    tooltip,
    selectedRussia,
    chatAdded: chatText.includes('React smoke message'),
    cancelledStyle,
    consoleErrors,
    screenshot: screenshotPath,
  };

  const failed =
    countryCount < 30 ||
    routesState !== 'off' ||
    !afterZoom.includes('1.12') ||
    !selectedRussia ||
    !result.chatAdded ||
    consoleErrors.length > 0;

  console.log(JSON.stringify(result, null, 2));

  if (failed) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
