// One-shot screenshot helper for the badge celebration.
// Usage: node scripts/_screenshot-badge.mjs <tier> [icon] [name] [desc]
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const [, , tierArg = 'ouro', icon = 'trophy', name = 'Lenda das Águas',
       desc = 'Carimbou 100 praias fluviais'] = process.argv;
const queueSize = Number(process.env.QUEUE || 0);

const dir = './temporary screenshots';
if (!existsSync(dir)) mkdirSync(dir);
const existing = readdirSync(dir).filter(f => f.startsWith('screenshot-'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0'));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const file = join(dir, `screenshot-${next}-badge-${tierArg}.png`);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/artigos.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 600));

await page.evaluate(({ tier, icon, name, desc, queueSize }) => {
  // Stub confetti so the test page doesn't need the lib loaded
  if (!window.confetti) window.confetti = () => {};
  const make = (i) => ({
    id: `test-${i}`, name, desc, icon, tier,
  });
  // First push shows immediately; the rest queue behind it.
  AuthUtils.celebrateBadge(make(1));
  for (let i = 1; i <= queueSize; i++) AuthUtils.celebrateBadge(make(i + 1));
}, { tier: tierArg, icon, name, desc, queueSize });

await new Promise(r => setTimeout(r, 1400));
await page.screenshot({ path: file });
await browser.close();
console.log(`Saved ${file}`);
