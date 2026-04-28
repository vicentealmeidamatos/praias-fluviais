import puppeteer from 'puppeteer';
const url = process.argv[2];
const scrollY = parseInt(process.argv[3] || '0');
const out = process.argv[4] || './temporary screenshots/mobile.png';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => {
  document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
});
await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('Saved: ' + out);
