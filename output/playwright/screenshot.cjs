const { chromium } = require('playwright-core');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT  = '/home/user/saas-crm-colchoes/output/playwright/';

async function shot(page, name, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
  console.log(`✓ ${name}.png (${w}x${h})`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await shot(page, 'login-desktop', 1440, 900);
  await shot(page, 'login-mobile', 390, 844);

  // Listar elementos interativos e verificar acessibilidade
  const interativos = await page.$$eval(
    'a[href], button, [role="button"], input, [onclick]',
    els => els.map(e => ({
      tag: e.tagName,
      text: (e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().slice(0, 60),
      visible: e.offsetWidth > 0 && e.offsetHeight > 0,
      cursor: window.getComputedStyle(e).cursor,
      rect: { w: e.offsetWidth, h: e.offsetHeight },
    }))
  );

  console.log('\n=== Elementos interativos (tela de login) ===');
  interativos.forEach(el => {
    const vis = el.visible ? '✓ visível' : '✗ OCULTO';
    const size = `${el.rect.w}x${el.rect.h}`;
    console.log(`[${vis}] <${el.tag}> "${el.text}" [${size}]`);
  });

  await browser.close();
  console.log('\n✅ Screenshots salvas em output/playwright/');
})().catch(e => { console.error(e); process.exit(1); });
