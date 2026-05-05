import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';
const dir = './temporary screenshots';

if (!existsSync(dir)) mkdirSync(dir);

// Auto-increment screenshot number
const existing = readdirSync(dir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0'));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const filename = label ? `screenshot-${next}-${label}.png` : `screenshot-${next}.png`;
const filepath = join(dir, filename);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200)); // Wait for animations
// Scroll through page to trigger lazy-loaded images
await page.evaluate(() => new Promise((resolve) => {
  let y = 0;
  const step = () => {
    window.scrollBy(0, 600);
    y += 600;
    if (y < document.body.scrollHeight) setTimeout(step, 80);
    else { window.scrollTo(0, 0); setTimeout(resolve, 400); }
  };
  step();
}));
// Force-reveal all entrance items so fullPage screenshot captures final states
await page.evaluate(() => {
  document.querySelectorAll('.reveal-up, .reveal-fade').forEach(el => {
    el.style.transitionDelay = '0ms';
    el.classList.add('is-visible');
  });
  if (window.gsap) {
    try { window.gsap.globalTimeline.progress(1); } catch (e) {}
  }
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: filepath, fullPage: true });
await browser.close();

console.log(`Screenshot saved: ${filepath}`);
