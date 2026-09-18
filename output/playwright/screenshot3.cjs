const { chromium } = require('playwright-core');
const path = require('path');

const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT  = '/home/user/saas-crm-colchoes/output/playwright/';
const HTML = `file://${path.resolve(OUT, 'dashboard-preview.html')}`;

async function shot(page, name, w, h, fullPage = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage });
  console.log(`✓ ${name}.png (${w}x${h}${fullPage?' full':''} )`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    headless: true,
  });

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(HTML, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500); // aguarda animações entrarem

  await shot(page, 'dash-desktop-1440',  1440, 900);
  await shot(page, 'dash-desktop-full',  1440, 900, true);  // página inteira
  await shot(page, 'dash-mobile-390',    390, 844);
  await shot(page, 'dash-tablet-768',    768, 1024);

  // Verificação de acessibilidade: cards clicáveis
  const interativos = await page.$$eval(
    'button, a[href], [onclick]',
    els => els.map(e => ({
      tag: e.tagName,
      text: (e.innerText || e.textContent || '').trim().slice(0, 50),
      visible: e.offsetWidth > 0 && e.offsetHeight > 0,
      size: `${e.offsetWidth}x${e.offsetHeight}`,
      cursor: window.getComputedStyle(e).cursor,
    }))
  );

  console.log('\n=== Elementos clicáveis no dashboard ===');
  let ocultosCount = 0;
  interativos.forEach(el => {
    const status = el.visible ? `✓ ${el.size}` : '✗ OCULTO';
    if (!el.visible) ocultosCount++;
    console.log(`[${status}] <${el.tag}> "${el.text}" cursor:${el.cursor}`);
  });
  console.log(`\nTotal: ${interativos.length} elementos | Ocultos: ${ocultosCount}`);

  if (errors.length) {
    console.log('\nErros:', errors);
  }

  await browser.close();
  console.log('\n✅ Done');
})().catch(e => { console.error(e.message); process.exit(1); });
