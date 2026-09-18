const { chromium } = require('playwright-core');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT  = '/home/user/saas-crm-colchoes/output/playwright/';

(async () => {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  // Capturar erros do console
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${OUT}app-desktop.png`, fullPage: false });
  console.log('✓ app-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}app-mobile.png`, fullPage: false });
  console.log('✓ app-mobile.png');

  console.log('\n=== Erros no console ===');
  errors.forEach(e => console.log(' -', e.slice(0, 120)));
  if (!errors.length) console.log(' nenhum erro.');

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
