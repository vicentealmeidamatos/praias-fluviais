// Capture a viewport after clicking a tab + scrolling.
// Usage: node shot-tab.mjs <url> <tabBtnId> <scrollY> <outPath>
import puppeteer from 'puppeteer';
const url = process.argv[2];
const tabBtn = process.argv[3];
const scrollY = parseInt(process.argv[4] || '0');
const out = process.argv[5] || './temporary screenshots/tab.png';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.click('#' + tabBtn);
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => {
  document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
});
await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('Saved: ' + out);
