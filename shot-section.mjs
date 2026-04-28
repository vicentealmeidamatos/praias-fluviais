import puppeteer from 'puppeteer';
const url = process.argv[2];
const selector = process.argv[3] || 'main';
const out = process.argv[4] || './temporary screenshots/section.png';
const width = parseInt(process.argv[5] || '1440');
const height = parseInt(process.argv[6] || '900');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
// Force all reveal-on-scroll elements visible (they use IntersectionObserver)
await page.evaluate(() => {
  document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('revealed'));
});
// Hide fixed/sticky headers/banners that overlap element screenshots
await page.addStyleTag({ content: '#main-header, #guest-banner, .bottom-nav { display: none !important; }' });
await new Promise(r => setTimeout(r, 500));
const el = await page.$(selector);
if (el) {
  await el.scrollIntoView({ block: 'start' });
  await new Promise(r => setTimeout(r, 300));
  const box = await el.boundingBox();
  if (box) {
    await page.screenshot({
      path: out,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      captureBeyondViewport: true,
    });
  } else {
    await el.screenshot({ path: out });
  }
} else {
  await page.screenshot({ path: out, fullPage: false });
}
await browser.close();
console.log('Saved: ' + out);
