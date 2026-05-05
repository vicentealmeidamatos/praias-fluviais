# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CLAUDE.md mandate:** Before writing any frontend code, invoke the `frontend-design` skill (per project rule). Do NOT auto-commit — only commit when the user explicitly asks (project rule overrides default skill behaviour).

**Goal:** Refazer totalmente o `<main>` da homepage (mantendo apenas o hero) com 11 secções dedicadas em estilo "híbrido editorial", scroll-driven, modernas e mobile-first.

**Architecture:** Eliminar o sistema page-turn da homepage. Substituir por scroll vertical com transições GSAP/ScrollTrigger (parallax, clip-path reveals, sticky-pin, masks). Cada secção tem personalidade visual distinta. Sistema de Praias em Destaque é semanal: pool de IDs em `settings.json` + override opcional em `settings.json`, com PRNG determinístico baseado em ISO week number quando não há override. Painel admin recebe duas novas secções para gerir o pool e os 3 atuais.

**Tech Stack:** HTML estático, Tailwind CDN, GSAP 3.12.5 + ScrollTrigger, Leaflet 1.9.4, Lucide Icons, JSON em `data/`, Supabase (já wired). Sem novos pacotes.

**Reference spec:** [docs/superpowers/specs/2026-05-02-homepage-redesign-design.md](../specs/2026-05-02-homepage-redesign-design.md)

---

## File Map

**Novos:**
- `js/featured-beaches.js` — selector determinístico semanal + leitura de override

**Modificados:**
- `index.html` — `<main>` reescrito (linhas 254-781 atuais), inline `<style>` ampliado, novo `<script>` de animações GSAP
- `data/settings.json` — adicionar `homeFeaturedPool` e `homeFeaturedCurrent`
- `admin.html` — duas novas entradas de menu (se aplicável; o ficheiro é só um shell)
- `js/admin.js` — duas novas secções de admin com lógica CRUD

**Sem alterações:**
- Hero, header, mobile menu, footer, bottom-nav (mantidos no `index.html`)
- `js/page-turn.js`, `css/page-turn.css` — usados em outras páginas
- `data/beaches.json`, `data/articles.json`, `data/products.json` — apenas leitura

---

## Pre-flight (executar uma vez antes de qualquer task)

- [ ] **Invocar a skill `frontend-design`** antes de escrever qualquer HTML/CSS de secção (CLAUDE.md exige).
- [ ] **Confirmar que o servidor local está a correr** em `http://localhost:3000` (`node serve.mjs`). Não matar entre tasks (regra do utilizador).
- [ ] **Backup mental do hero atual** (linhas 269-374 do `index.html`): mantém-se exatamente igual, incluindo as bolhas, stats, e CTAs. Não tocar.
- [ ] **Não auto-committar.** Pedir ao utilizador antes de commits.

---

## Task 1: Adicionar campos `homeFeaturedPool` e `homeFeaturedCurrent` ao `settings.json`

**Files:**
- Modify: `data/settings.json`

- [ ] **Step 1: Ler o `settings.json` atual e identificar onde adicionar os campos**

Ler o ficheiro inteiro. Os novos campos vão ficar a seguir ao `featuredBeaches` existente (que NÃO se mexe — é usado por outros sistemas).

- [ ] **Step 2: Adicionar os dois campos**

Após a linha que fecha o `featuredBeaches` (`]`), inserir:

```json
"homeFeaturedPool": [
  "praia-fluvial-de-loriga",
  "praia-fluvial-de-avo",
  "albufeira-do-azibo",
  "praia-fluvial-de-geres"
],
"homeFeaturedCurrent": null,
```

Pré-preencher o pool inicial com IDs de praias que tenham foto/ficheiro real (usar os mesmos IDs do `featuredBeaches` como ponto de partida — o admin pode depois alargar). Verificar que cada ID existe em `data/beaches.json` antes de gravar.

- [ ] **Step 3: Validar que o JSON ainda é válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/settings.json'))" && echo OK`
Expected: `OK`

---

## Task 2: Criar `js/featured-beaches.js`

**Files:**
- Create: `js/featured-beaches.js`

- [ ] **Step 1: Criar o ficheiro com o módulo completo**

```javascript
/**
 * featured-beaches.js
 * Selecciona 3 praias para a secção "Praias em Destaque" da homepage.
 *
 * Lógica:
 *  1. Se settings.homeFeaturedCurrent.weekKey === ISO week atual → usa esses IDs (override admin)
 *  2. Caso contrário → escolhe 3 IDs deterministicamente do settings.homeFeaturedPool
 *     usando o número da semana ISO como seed do PRNG (mulberry32). Todos os
 *     visitantes dentro da mesma semana veem as mesmas 3 praias.
 *
 * Expõe globalmente: window.FeaturedBeaches.pickThree(settings, beaches)
 *   → devolve array de 3 objetos beach (ou menos se o pool for pequeno).
 */
(function () {
  function getISOWeekKey(date = new Date()) {
    // ISO 8601 week: Thursday-anchored. Chave formato "YYYY-Www" (ex.: "2026-W18").
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    const rand = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function seedFromWeekKey(weekKey) {
    let h = 2166136261;
    for (let i = 0; i < weekKey.length; i++) {
      h = (h ^ weekKey.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  function pickThree(settings, beaches) {
    if (!settings || !Array.isArray(beaches)) return [];
    const weekKey = getISOWeekKey();

    const override = settings.homeFeaturedCurrent;
    if (override && override.weekKey === weekKey && Array.isArray(override.beachIds) && override.beachIds.length) {
      return override.beachIds
        .map(id => beaches.find(b => b.id === id))
        .filter(Boolean)
        .slice(0, 3);
    }

    const pool = Array.isArray(settings.homeFeaturedPool) ? settings.homeFeaturedPool : [];
    const validIds = pool.filter(id => beaches.some(b => b.id === id));
    if (!validIds.length) return [];

    const shuffled = seededShuffle(validIds, seedFromWeekKey(weekKey));
    return shuffled.slice(0, 3)
      .map(id => beaches.find(b => b.id === id))
      .filter(Boolean);
  }

  window.FeaturedBeaches = {
    getISOWeekKey,
    pickThree,
  };
})();
```

- [ ] **Step 2: Verificar a sintaxe do ficheiro**

Run: `node -c js/featured-beaches.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Verificar manualmente a lógica num browser console (opcional, durante implementação)**

Abrir DevTools no `index.html`, colar `FeaturedBeaches.getISOWeekKey()` — deve devolver string tipo `"2026-W18"`.

---

## Task 3: Preparar `index.html` — remover `<main>` antigo, manter hero, criar scaffold

**Files:**
- Modify: `index.html` (linhas 254-781 do estado atual)

- [ ] **Step 1: Localizar exatamente os limites a modificar**

A secção a apagar começa em `<main id="main" style="background-color:#003A40;">` (linha ~254) até `</main>` (linha ~781). Dentro disso:
- Manter: a secção `<section ... id="page-hero">` (linhas 269-374) — copiar verbatim
- Apagar: tudo o resto (page-indicator, magazine-container wrappers, todas as outras secções)

- [ ] **Step 2: Substituir o conteúdo de `<main>` pelo novo scaffold**

```html
<!-- ─── Main Content ─── -->
<main id="main" class="bg-praia-sand-50">

  <!-- ═══════════════════════════════════════ -->
  <!-- 1. HERO (mantido — copiar 1:1 do estado anterior) -->
  <!-- ═══════════════════════════════════════ -->
  <section class="hero-bg relative flex items-center justify-center min-h-screen" id="page-hero">
    <!-- COPIAR exatamente o conteúdo do hero atual: noise overlay, bolhas, content (logo+stats+CTAs) -->
    <!-- NÃO ALTERAR uma vírgula -->
  </section>

  <!-- 2. REDE DE PRAIAS -->
  <section id="sec-rede" class="section section-light"></section>

  <!-- 3. PASSAPORTE DIGITAL -->
  <section id="sec-passaporte" class="section section-dark-deep"></section>

  <!-- 4. PRAIA FLUVIAL DO ANO -->
  <section id="sec-ano" class="section section-dark"></section>

  <!-- 5. PRAIAS EM DESTAQUE -->
  <section id="sec-destaques" class="section section-light section-photo"></section>

  <!-- 6. ONDE ENCONTRAR (DUPLA C/ TABS) -->
  <section id="sec-onde" class="section section-dark"></section>

  <!-- 7. LOJA -->
  <section id="sec-loja" class="section section-light"></section>

  <!-- 8. DESCONTOS -->
  <section id="sec-descontos" class="section section-yellow"></section>

  <!-- 9. NOVIDADES -->
  <section id="sec-artigos" class="section section-light"></section>

  <!-- 10. COMUNIDADE -->
  <section id="sec-comunidade" class="section section-dark"></section>

  <!-- 11. CONTACTOS -->
  <section id="sec-contactos" class="section section-dark-deep"></section>

</main>
```

(Cada `<section>` será preenchida nas tasks seguintes — começar por ficheiro vazio é intencional para verificar que nada partiu antes de adicionar conteúdo.)

- [ ] **Step 3: Adicionar classes utilitárias base no `<style>` do head**

Adicionar dentro do `<style>` existente (logo após o bloco actual de `.hero-bg`):

```css
/* ── Section base ── */
.section {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
.section-light { background: #FAF8F5; color: #003A40; }
.section-dark { background: linear-gradient(180deg, #003A40 0%, #002A2E 100%); color: #fff; }
.section-dark-deep { background: linear-gradient(180deg, #002A2E 0%, #001f23 100%); color: #fff; }
.section-yellow { background: linear-gradient(135deg, #F5B800 0%, #FFEB3B 100%); color: #003A40; }
.section-photo { isolation: isolate; }
.section-pad { padding: clamp(64px, 9vw, 130px) 0; }

/* Eyebrow / label */
.eyebrow {
  display: inline-block;
  font-family: 'Poppins', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.eyebrow-light { color: #0288D1; }
.eyebrow-dark  { color: #FFEB3B; }

/* Reveal helpers (GSAP toma conta a partir daqui) */
.reveal-up { opacity: 0; transform: translateY(28px); }
.reveal-fade { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .reveal-up, .reveal-fade { opacity: 1 !important; transform: none !important; }
}

/* Wave divider */
.wave-divider {
  display: block;
  width: 100%;
  height: 64px;
  margin: 0;
  pointer-events: none;
}
```

- [ ] **Step 4: Remover scripts que já não são necessários**

No final do `<body>`, retirar `<script src="js/page-turn.js"></script>` (a homepage já não usa o sistema page-turn). Manter todos os outros scripts.

- [ ] **Step 5: Adicionar `<script src="js/featured-beaches.js"></script>`** logo após o `<script src="js/content-loader.js">` no `<head>`.

- [ ] **Step 6: Verificar visualmente**

Abrir `http://localhost:3000`. Esperado: hero idêntico ao anterior, depois 10 caixas de cor sólida (sand/teal/yellow alternantes) vazias até final da página. Sem JS errors na console.

Tirar screenshot: `node screenshot.mjs http://localhost:3000`
Ler o PNG resultante e confirmar que o hero está intacto.

---

## Task 4: Secção "Rede de Praias" (sec-rede)

**Files:**
- Modify: `index.html` (dentro de `<section id="sec-rede">`)

- [ ] **Step 1: Inserir HTML da secção**

Substituir `<section id="sec-rede" class="section section-light"></section>` por:

```html
<section id="sec-rede" class="section section-light section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <div class="relative max-w-7xl mx-auto px-6">
    <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
      <!-- Texto -->
      <div class="rede-text">
        <span class="eyebrow eyebrow-light reveal-up">Rede de Praias</span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] mt-3 mb-5 reveal-up">
          Encontre a praia<br><span class="text-praia-yellow-600">perto de si</span>
        </h2>
        <p class="text-praia-sand-700 text-lg leading-relaxed-plus mb-8 max-w-lg reveal-up">
          Mais de 200 praias fluviais e zonas balneares no nosso mapa. Filtre por região, serviços ou qualidade da água — e siga as direções num clique.
        </p>
        <ul class="space-y-4 mb-10">
          <li class="flex items-center gap-4 reveal-up">
            <div class="w-11 h-11 rounded-xl bg-praia-teal-800 flex items-center justify-center flex-shrink-0">
              <i data-lucide="navigation" class="w-5 h-5 text-praia-yellow-400"></i>
            </div>
            <span class="text-praia-sand-800 text-base">Geolocalização para descobrir praias à sua volta</span>
          </li>
          <li class="flex items-center gap-4 reveal-up">
            <div class="w-11 h-11 rounded-xl bg-praia-teal-800 flex items-center justify-center flex-shrink-0">
              <i data-lucide="sliders-horizontal" class="w-5 h-5 text-praia-yellow-400"></i>
            </div>
            <span class="text-praia-sand-800 text-base">Filtros: bar, grelhadores, nadador-salvador, acessibilidades</span>
          </li>
          <li class="flex items-center gap-4 reveal-up">
            <div class="w-11 h-11 rounded-xl bg-praia-teal-800 flex items-center justify-center flex-shrink-0">
              <i data-lucide="route" class="w-5 h-5 text-praia-yellow-400"></i>
            </div>
            <span class="text-praia-sand-800 text-base">Direções no Google Maps ou Waze com um toque</span>
          </li>
        </ul>
        <a href="rede.html" class="btn-primary inline-flex items-center gap-3 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered hover:bg-praia-teal-900">
          <i data-lucide="map" class="w-5 h-5"></i>
          Explorar a Rede
        </a>
      </div>

      <!-- Mini-map -->
      <div class="rede-map relative">
        <div class="absolute -inset-4 bg-praia-yellow-400/20 rounded-3xl blur-2xl"></div>
        <div id="home-mini-map" class="relative w-full aspect-[4/3] rounded-2xl shadow-layered-lg border border-praia-teal-800/10 overflow-hidden bg-white"></div>
        <div class="absolute inset-0 rounded-2xl pointer-events-none" style="box-shadow: inset 0 0 50px rgba(0,58,64,0.18);"></div>
        <span class="absolute -top-4 -right-4 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-full shadow-layered">200+ praias</span>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Atualizar a inicialização do mini-mapa**

No script inline existente que cria `mini-map`, mudar o ID. No bloco `document.getElementById('mini-map')` substituir por `document.getElementById('home-mini-map')`. Manter a lógica de `L.map`, tile-layer, sample beaches, e `markerIcon` exatamente como está. A regra `#mini-map` no CSS pode ser duplicada para `#home-mini-map`:

No `<style>` substituir/duplicar:

```css
#home-mini-map { border-radius: 16px; overflow: hidden; }
#home-mini-map .leaflet-tile-pane { filter: saturate(0.6) brightness(0.9); }
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção rede com texto à esquerda, mini-mapa à direita com ~18 markers amarelos visíveis. Sem console errors.

---

## Task 5: Secção "Passaporte Digital" (sec-passaporte)

**Files:**
- Modify: `index.html` (dentro de `<section id="sec-passaporte">`)

- [ ] **Step 1: Inserir HTML da secção**

```html
<section id="sec-passaporte" class="section section-dark-deep section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <!-- Bolhas decorativas -->
  <div class="bubble w-2 h-2"     style="left:8%;  --delay:0.5s; --dur:9s;  --drift:10px;"></div>
  <div class="bubble w-1.5 h-1.5" style="left:22%; --delay:2s;   --dur:7s;  --drift:-8px;"></div>
  <div class="bubble w-2.5 h-2.5" style="left:74%; --delay:1.5s; --dur:8s;  --drift:11px;"></div>
  <div class="bubble w-1 h-1"     style="left:90%; --delay:3s;   --dur:6s;  --drift:-6px;"></div>

  <div class="relative max-w-7xl mx-auto px-6">
    <div class="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
      <!-- Mockup passaporte (esquerda) -->
      <div class="passport-visual relative reveal-up">
        <div class="aspect-[4/5] max-w-md mx-auto relative">
          <!-- Capa do passaporte (placeholder visual) -->
          <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-praia-teal-700 to-praia-teal-900 shadow-2xl rotate-[-4deg] origin-bottom-left">
            <div class="absolute inset-0 rounded-3xl border border-praia-yellow-400/30"></div>
            <div class="absolute top-8 left-8 right-8 flex flex-col items-center text-center">
              <i data-lucide="stamp" class="w-12 h-12 text-praia-yellow-400 mb-3"></i>
              <div class="font-display text-praia-yellow-400 text-xs uppercase tracking-[0.3em]">Passaporte</div>
              <div class="font-display text-white text-xl font-bold mt-1">Praias Fluviais</div>
              <div class="font-display text-white/40 text-[11px] uppercase tracking-widest mt-2">República Portuguesa</div>
            </div>
            <!-- Carimbos faux -->
            <div class="absolute bottom-10 left-8 right-8 grid grid-cols-3 gap-3">
              <div class="aspect-square rounded-full border-2 border-praia-yellow-400/60 flex items-center justify-center text-praia-yellow-400 stamp-mock"><i data-lucide="check" class="w-5 h-5"></i></div>
              <div class="aspect-square rounded-full border-2 border-praia-yellow-400/60 flex items-center justify-center text-praia-yellow-400 stamp-mock" style="--d:.3s;"><i data-lucide="check" class="w-5 h-5"></i></div>
              <div class="aspect-square rounded-full border-2 border-white/20 flex items-center justify-center text-white/30 stamp-mock" style="--d:.6s;"><i data-lucide="dot" class="w-5 h-5"></i></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Texto (direita) -->
      <div>
        <span class="eyebrow eyebrow-dark reveal-up">Passaporte Digital</span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight mt-3 mb-5 reveal-up">
          Coleccione carimbos<br>pelo país
        </h2>
        <p class="text-white/65 text-lg leading-relaxed-plus mb-8 max-w-lg reveal-up">
          Em cada praia que visita, ganhe um carimbo digital. Desbloqueie badges, partilhe o seu progresso, e mostre a sua aventura.
        </p>
        <ul class="space-y-3 mb-10">
          <li class="flex items-center gap-3 text-white/85 reveal-up"><i data-lucide="map-pin" class="w-4 h-4 text-praia-yellow-400"></i> 200+ praias para visitar</li>
          <li class="flex items-center gap-3 text-white/85 reveal-up"><i data-lucide="award" class="w-4 h-4 text-praia-yellow-400"></i> Badges de conquista por região</li>
          <li class="flex items-center gap-3 text-white/85 reveal-up"><i data-lucide="qr-code" class="w-4 h-4 text-praia-yellow-400"></i> Carimbo físico + digital via QR</li>
        </ul>
        <a href="passaporte.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
          <i data-lucide="stamp" class="w-5 h-5"></i>
          O Meu Passaporte
        </a>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS para o stamp animado**

```css
.stamp-mock {
  animation: stamp-pop 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: var(--d, 0s);
  opacity: 0;
  transform: scale(0.6);
}
@keyframes stamp-pop {
  0% { opacity: 0; transform: scale(0.6); }
  60% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000` (com offset para chegar à secção, ou rolar manualmente).
Expected: secção dark com mockup do passaporte à esquerda (rotação leve, carimbos animados) e texto + CTA à direita.

---

## Task 6: Secção "Praia Fluvial do Ano" (sec-ano) — com timeline

**Files:**
- Modify: `index.html` (dentro de `<section id="sec-ano">`)

- [ ] **Step 1: Inserir HTML da secção**

```html
<section id="sec-ano" class="section section-dark section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <!-- bolhas -->
  <div class="bubble w-2.5 h-2.5" style="left:10%; --delay:1s;   --dur:9s;  --drift:10px;"></div>
  <div class="bubble w-2 h-2"     style="left:38%; --delay:0s;   --dur:8s;  --drift:-8px;"></div>
  <div class="bubble w-3 h-3"     style="left:65%; --delay:3s;   --dur:10s; --drift:14px;"></div>
  <div class="bubble w-1.5 h-1.5" style="left:88%; --delay:2s;   --dur:7s;  --drift:-6px;"></div>

  <div class="relative max-w-7xl mx-auto px-6">
    <div class="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
      <!-- Esquerda -->
      <div>
        <span class="inline-flex items-center gap-2 bg-praia-yellow-400/10 border border-praia-yellow-400/25 rounded-full px-4 py-1.5 mb-6 reveal-up">
          <i data-lucide="trophy" class="w-4 h-4 text-praia-yellow-400"></i>
          <span class="font-display text-xs uppercase tracking-wider text-praia-yellow-400 font-semibold">Galardão Anual</span>
        </span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight mb-5 reveal-up">
          Praia Fluvial do Ano <span class="text-praia-yellow-400">2026</span>
        </h2>
        <p class="text-white/65 text-lg leading-relaxed-plus mb-3 max-w-lg reveal-up">
          Todos os anos milhares de portugueses elegem a sua praia favorita. Uma celebração das mais belas zonas balneares do interior.
        </p>
        <p class="text-white/40 text-sm mb-10 reveal-up">
          <i data-lucide="calendar" class="w-4 h-4 inline-block mr-1 -mt-0.5"></i>
          Votação aberta até 31 Outubro 2026
        </p>
        <a href="votar.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
          <i data-lucide="vote" class="w-5 h-5"></i>
          Votar Agora
        </a>
      </div>

      <!-- Direita: timeline -->
      <div class="relative pl-2">
        <div class="absolute left-7 top-2 bottom-2 w-0.5 timeline-track" style="background: linear-gradient(to bottom, #FFEB3B 0%, rgba(255,235,59,0.15) 100%);"></div>

        <div class="relative pl-16 mb-8 reveal-up">
          <div class="absolute left-5 top-1.5 w-5 h-5 rounded-full bg-praia-yellow-400 border-4 border-praia-teal-800 shadow-lg ring-4 ring-praia-yellow-400/20"></div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <span class="font-display text-[11px] uppercase tracking-wider text-praia-yellow-400 font-bold">2025 · Vencedora</span>
            <h3 class="font-display text-xl font-bold text-white mt-1">Zona de Fruição Ribeirinha da Carriça</h3>
            <p class="text-white/50 text-sm mt-1">São João da Serra · Oliveira de Frades</p>
          </div>
        </div>
        <div class="relative pl-16 mb-8 reveal-up">
          <div class="absolute left-5 top-1.5 w-5 h-5 rounded-full bg-praia-yellow-400/60 border-4 border-praia-teal-800"></div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <span class="font-display text-[11px] uppercase tracking-wider text-praia-yellow-400/80 font-bold">2024 · 7.175 votos</span>
            <h3 class="font-display text-lg font-bold text-white/90 mt-1">Praia Fluvial de Avô</h3>
            <p class="text-white/40 text-sm mt-1">Oliveira do Hospital</p>
          </div>
        </div>
        <div class="relative pl-16 mb-8 reveal-up">
          <div class="absolute left-5 top-1.5 w-5 h-5 rounded-full bg-praia-yellow-400/40 border-4 border-praia-teal-800"></div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <span class="font-display text-[11px] uppercase tracking-wider text-praia-yellow-400/60 font-bold">2023 · 7.357 votos</span>
            <h3 class="font-display text-lg font-bold text-white/80 mt-1">Praia Fluvial do Vimieiro</h3>
            <p class="text-white/40 text-sm mt-1">Penacova · Coimbra</p>
          </div>
        </div>
        <div class="relative pl-16 reveal-up">
          <div class="absolute left-5 top-1.5 w-5 h-5 rounded-full bg-praia-blue-400/70 border-4 border-praia-teal-800"></div>
          <div class="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <span class="font-display text-[11px] uppercase tracking-wider text-praia-blue-400 font-bold">Revelação Norte 2024</span>
            <h3 class="font-display text-lg font-bold text-white/85 mt-1">Praia do Cavadinho</h3>
            <p class="text-white/40 text-sm mt-1">Braga</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção dark com timeline à direita, 4 entradas com marcadores na linha vertical amarela.

---

## Task 7: Secção "Praias em Destaque" (sec-destaques) — com lógica de pool

**Files:**
- Modify: `index.html` (dentro de `<section id="sec-destaques">` + script inline)

- [ ] **Step 1: Inserir HTML da secção**

```html
<section id="sec-destaques" class="section section-light section-photo section-pad">
  <div class="absolute inset-0 -z-10 destaques-bg"></div>
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>

  <div class="relative max-w-7xl mx-auto px-6">
    <div class="text-center mb-14">
      <span class="eyebrow eyebrow-light reveal-up">Esta Semana</span>
      <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-praia-teal-800 tracking-tight mt-3 reveal-up">
        Praias em <span class="text-praia-yellow-600">Destaque</span>
      </h2>
      <p class="text-praia-sand-700 text-lg max-w-xl mx-auto mt-4 reveal-up">
        Três praias escolhidas para si, que mudam a cada segunda-feira.
      </p>
    </div>

    <div id="destaques-grid" class="grid md:grid-cols-3 gap-6 md:gap-8">
      <!-- Cards são preenchidos via JS, com 3 skeletons inicialmente -->
      <div class="destaque-skel rounded-2xl bg-praia-sand-200 aspect-[4/5]"></div>
      <div class="destaque-skel rounded-2xl bg-praia-sand-200 aspect-[4/5]"></div>
      <div class="destaque-skel rounded-2xl bg-praia-sand-200 aspect-[4/5]"></div>
    </div>

    <div class="text-center mt-10">
      <a href="rede.html" class="inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider hover:text-praia-yellow-600 transition-colors duration-300">
        Ver Todas as Praias <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS**

```css
.destaques-bg {
  background: linear-gradient(180deg, #FAF8F5 0%, #F5F0E8 100%);
}
.destaques-bg::before {
  content: "";
  position: absolute; inset: 0;
  background-image: url('img/noise-texture.svg');
  opacity: 0.4;
  mix-blend-mode: multiply;
}
.destaque-skel {
  animation: skel-pulse 1.4s ease-in-out infinite;
}
@keyframes skel-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}
.destaque-card { transition: transform .45s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow .45s ease; }
.destaque-card:hover { transform: translateY(-6px); }
```

- [ ] **Step 3: Adicionar script inline para carregar e renderizar**

Adicionar no bloco de scripts inline existente, após o counter animation block:

```javascript
// ── Destaques (3 praias rotativas) ──
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('destaques-grid');
  if (!grid || !window.FeaturedBeaches) return;

  try {
    const [settings, beaches] = await Promise.all([
      fetch('data/settings.json').then(r => r.json()),
      fetch('data/beaches.json').then(r => r.json()),
    ]);
    const picks = window.FeaturedBeaches.pickThree(settings, beaches);
    if (!picks.length) {
      grid.innerHTML = '<p class="col-span-3 text-center text-praia-sand-600 py-8">Sem praias em destaque esta semana.</p>';
      return;
    }
    grid.innerHTML = picks.map(b => `
      <a href="praia.html?id=${encodeURIComponent(b.id)}" class="destaque-card group block rounded-2xl overflow-hidden bg-white shadow-layered">
        <div class="relative aspect-[4/3] overflow-hidden">
          <img src="${b.thumbnail || (b.photos && b.photos[0]) || 'https://placehold.co/800x600/003A40/FFEB3B?text=Praia'}"
               alt="${b.name}" loading="lazy"
               class="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110">
          <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-900/65 to-transparent"></div>
          <div class="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
            ${b.services?.blueFlag ? '<span class="badge badge-blue-flag"><i data-lucide="flag" class="w-3 h-3"></i>Bandeira Azul</span>' : ''}
            ${b.services?.goldQuality ? '<span class="badge badge-gold"><i data-lucide="award" class="w-3 h-3"></i>Qualidade Ouro</span>' : ''}
            ${b.services?.accessible ? '<span class="badge badge-accessible"><i data-lucide="accessibility" class="w-3 h-3"></i>Acessível</span>' : ''}
          </div>
        </div>
        <div class="p-5">
          <span class="font-display text-[11px] uppercase tracking-wider text-praia-teal-500 font-semibold">${b.river || 'Rio'}</span>
          <h3 class="font-display text-lg font-bold text-praia-teal-800 leading-snug mt-1 group-hover:text-praia-teal-600 transition-colors">${b.name}</h3>
          <p class="text-sm text-praia-sand-600 mt-1">${b.municipality || ''}${b.district ? ' · ' + b.district : ''}</p>
        </div>
      </a>
    `).join('');
    lucide.createIcons();
  } catch (e) {
    console.error('Falha ao carregar praias em destaque', e);
    grid.innerHTML = '<p class="col-span-3 text-center text-praia-sand-600 py-8">Não foi possível carregar as praias em destaque.</p>';
  }
});
```

- [ ] **Step 4: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: 3 cards com fotos das 3 praias do pool actual. Hover faz lift + zoom da imagem. Console sem errors.

- [ ] **Step 5: Verificar a rotação determinística**

Console DevTools → `FeaturedBeaches.getISOWeekKey()` deve devolver `"2026-W18"` (ou o número correcto da semana actual). Confirmar que os 3 IDs são sempre os mesmos em refresh dentro da mesma semana.

---

## Task 8: Secção "Onde Encontrar" (sec-onde) — DUPLA com tabs

**Files:**
- Modify: `index.html` (dentro de `<section id="sec-onde">`)

- [ ] **Step 1: Inserir HTML da secção**

```html
<section id="sec-onde" class="section section-dark section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <div class="absolute inset-0 -z-10 onde-bg"></div>

  <div class="relative max-w-6xl mx-auto px-6">
    <div class="text-center mb-10">
      <span class="eyebrow eyebrow-dark reveal-up">Onde Encontrar</span>
      <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mt-3 reveal-up">
        Levante o Guia, carimbe o Passaporte
      </h2>
    </div>

    <!-- Tabs -->
    <div class="onde-tabs flex justify-center gap-2 mb-10 reveal-up" role="tablist">
      <button type="button" class="onde-tab active" data-tab="guia" role="tab" aria-selected="true">
        <i data-lucide="book-open" class="w-4 h-4"></i> Levantar o Guia
      </button>
      <button type="button" class="onde-tab" data-tab="passaporte" role="tab" aria-selected="false">
        <i data-lucide="stamp" class="w-4 h-4"></i> Carimbar o Passaporte
      </button>
    </div>

    <!-- Painéis -->
    <div class="onde-panels relative">
      <div class="onde-panel" data-panel="guia">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p class="text-white/70 text-lg leading-relaxed-plus mb-6">
              Levante o Guia das Praias Fluviais em <strong class="text-praia-yellow-400">250+ pontos</strong> espalhados por todo o país: postos de turismo, hotéis, lojas parceiras e quiosques.
            </p>
            <ul class="space-y-3 text-white/80 mb-8">
              <li class="flex items-center gap-3"><i data-lucide="map-pin" class="w-4 h-4 text-praia-yellow-400"></i> Mapa interactivo com pontos por concelho</li>
              <li class="flex items-center gap-3"><i data-lucide="hand" class="w-4 h-4 text-praia-yellow-400"></i> Recolha gratuita</li>
              <li class="flex items-center gap-3"><i data-lucide="navigation" class="w-4 h-4 text-praia-yellow-400"></i> Direções no Google Maps</li>
            </ul>
            <a href="onde-encontrar-guia.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
              <i data-lucide="map" class="w-5 h-5"></i> Ver Pontos
            </a>
          </div>
          <div class="hidden lg:block aspect-[4/5] rounded-2xl bg-gradient-to-br from-praia-teal-700 to-praia-teal-900 flex items-center justify-center shadow-2xl border border-white/10 relative overflow-hidden">
            <i data-lucide="book-open" class="w-32 h-32 text-praia-yellow-400/15 absolute"></i>
            <div class="relative z-10 text-center px-8">
              <div class="font-display text-praia-yellow-400 text-xs uppercase tracking-[0.3em] mb-3">Guia 2026</div>
              <div class="font-display text-white text-3xl font-bold leading-tight">Praias<br>Fluviais</div>
              <div class="font-display text-white/40 text-[11px] uppercase tracking-widest mt-4">Edição Anual</div>
            </div>
          </div>
        </div>
      </div>

      <div class="onde-panel hidden" data-panel="passaporte">
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p class="text-white/70 text-lg leading-relaxed-plus mb-6">
              Carimbe o seu Passaporte nas próprias praias e em <strong class="text-praia-yellow-400">parceiros oficiais</strong>: bares, cafés e postos de turismo.
            </p>
            <ul class="space-y-3 text-white/80 mb-8">
              <li class="flex items-center gap-3"><i data-lucide="stamp" class="w-4 h-4 text-praia-yellow-400"></i> Carimbo físico nas praias</li>
              <li class="flex items-center gap-3"><i data-lucide="qr-code" class="w-4 h-4 text-praia-yellow-400"></i> QR digital nos parceiros</li>
              <li class="flex items-center gap-3"><i data-lucide="award" class="w-4 h-4 text-praia-yellow-400"></i> Desbloqueie badges por região</li>
            </ul>
            <a href="onde-encontrar-passaporte.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
              <i data-lucide="map-pin" class="w-5 h-5"></i> Ver Locais de Carimbo
            </a>
          </div>
          <div class="hidden lg:block aspect-[4/5] rounded-2xl bg-gradient-to-br from-praia-blue-600 to-praia-teal-900 flex items-center justify-center shadow-2xl border border-white/10 relative overflow-hidden">
            <i data-lucide="stamp" class="w-32 h-32 text-praia-yellow-400/15 absolute"></i>
            <div class="relative z-10 text-center px-8">
              <div class="font-display text-praia-yellow-400 text-xs uppercase tracking-[0.3em] mb-3">Passaporte</div>
              <div class="font-display text-white text-3xl font-bold leading-tight">Carimbe<br>Cada Visita</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS**

```css
.onde-bg {
  background: linear-gradient(180deg, #003A40 0%, #002A2E 100%);
}
.onde-tabs { background: rgba(255,255,255,0.06); border-radius: 999px; padding: 4px; backdrop-filter: blur(8px); }
.onde-tab {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'Poppins', sans-serif; font-size: 13px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: 11px 22px; border-radius: 999px;
  color: rgba(255,255,255,0.65); border: 0; background: transparent; cursor: pointer;
  transition: color .25s ease, background .25s ease;
}
.onde-tab:hover { color: #fff; }
.onde-tab.active { background: #FFEB3B; color: #003A40; box-shadow: 0 6px 20px rgba(255,235,59,0.3); }
.onde-panel { transition: opacity .45s ease, transform .45s ease; }
.onde-panel.hidden { display: none; }
.onde-panel.entering { opacity: 0; transform: translateX(20px); }
```

- [ ] **Step 3: Adicionar script inline para os tabs**

```javascript
// ── Onde Encontrar tabs ──
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.onde-tab');
  const panels = document.querySelectorAll('.onde-panel');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabs.forEach(t => {
        t.classList.toggle('active', t === btn);
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      panels.forEach(p => {
        const show = p.dataset.panel === target;
        if (show) {
          p.classList.remove('hidden');
          p.classList.add('entering');
          requestAnimationFrame(() => p.classList.remove('entering'));
        } else {
          p.classList.add('hidden');
        }
      });
    });
  });
});
```

- [ ] **Step 4: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção dark com 2 tabs no topo. Clicar em "Carimbar" troca o painel com fade/slide. Mockup à direita visível em desktop.

---

## Task 9: Secção "Loja" (sec-loja)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir HTML da secção**

```html
<section id="sec-loja" class="section section-light section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>

  <div class="relative max-w-7xl mx-auto px-6">
    <div class="flex items-end justify-between mb-10">
      <div>
        <span class="eyebrow eyebrow-light reveal-up">Loja</span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-praia-teal-800 tracking-tight mt-3 reveal-up">
          Leve o <span class="text-praia-yellow-600">Guia</span> consigo
        </h2>
      </div>
      <a href="loja.html" class="hidden md:inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider hover:text-praia-yellow-600 transition-colors duration-300">
        Ver Loja <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </a>
    </div>

    <div id="loja-grid" class="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-6">
      <div class="aspect-[3/4] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
      <div class="aspect-[3/4] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
      <div class="aspect-[3/4] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
      <div class="aspect-[3/4] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
    </div>

    <div class="md:hidden text-center mt-8">
      <a href="loja.html" class="inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider">
        Ver Loja Completa <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar script inline para carregar produtos**

```javascript
// ── Loja (4 produtos em destaque) ──
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('loja-grid');
  if (!grid) return;
  try {
    const products = await fetch('data/products.json').then(r => r.json());
    const featured = (products || []).filter(p => p.active !== false).slice(0, 4);
    if (!featured.length) { grid.parentElement.style.display = 'none'; return; }
    grid.innerHTML = featured.map(p => {
      const price = (typeof p.price === 'number') ? (p.price / 100).toFixed(2).replace('.', ',') + ' €' : '';
      const img = (p.images && p.images[0]) || p.image || 'https://placehold.co/600x800/FAF8F5/003A40?text=Produto';
      return `
        <a href="produto.html?id=${encodeURIComponent(p.id)}" class="destaque-card group block rounded-2xl overflow-hidden bg-white shadow-layered">
          <div class="relative aspect-[3/4] overflow-hidden bg-praia-sand-100">
            <img src="${img}" alt="${p.name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105">
          </div>
          <div class="p-4">
            <h3 class="font-display text-sm md:text-base font-bold text-praia-teal-800 leading-snug">${p.name}</h3>
            <p class="text-praia-yellow-600 font-display font-bold text-lg mt-1">${price}</p>
          </div>
        </a>
      `;
    }).join('');
    lucide.createIcons();
  } catch (e) {
    console.error('Falha ao carregar produtos', e);
    grid.parentElement.style.display = 'none';
  }
});
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção clara com 4 produtos em grid. Hover faz scale leve.

---

## Task 10: Secção "Descontos" (sec-descontos)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir HTML**

```html
<section id="sec-descontos" class="section section-yellow section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <div class="descontos-pattern absolute inset-0 pointer-events-none"></div>

  <div class="relative max-w-6xl mx-auto px-6 text-center">
    <span class="eyebrow reveal-up" style="color:#003A40;">Vantagens</span>
    <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-praia-teal-800 tracking-tight mt-3 reveal-up">
      Mais de 250 descontos<br>por todo o país
    </h2>
    <p class="text-praia-teal-800/75 text-lg max-w-xl mx-auto mt-4 reveal-up">
      Apresente o Guia ou o Passaporte e usufrua de vantagens exclusivas em alojamentos, restaurantes, atividades e muito mais.
    </p>

    <div id="descontos-logos" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 mt-12 mb-12">
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
      <div class="aspect-square rounded-xl bg-white/40 backdrop-blur-sm border border-praia-teal-800/10 destaque-skel"></div>
    </div>

    <a href="descontos.html" class="btn-primary inline-flex items-center gap-3 bg-praia-teal-800 text-white font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered hover:bg-praia-teal-900">
      <i data-lucide="ticket-percent" class="w-5 h-5"></i>
      Ver Descontos
    </a>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS do pattern de fundo**

```css
.descontos-pattern {
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent 0,
      transparent 60px,
      rgba(0,58,64,0.04) 60px,
      rgba(0,58,64,0.04) 80px
    );
}
```

- [ ] **Step 3: Adicionar script para carregar logos de parceiros**

```javascript
// ── Descontos (logos parceiros) ──
document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('descontos-logos');
  if (!grid) return;
  try {
    const data = await fetch('data/descontos.json').then(r => r.json());
    const list = (data || []).slice(0, 6);
    if (!list.length) { grid.style.display = 'none'; return; }
    grid.innerHTML = list.map(d => `
      <div class="aspect-square rounded-xl bg-white border border-praia-teal-800/10 flex items-center justify-center p-5 shadow-layered hover:shadow-layered-lg transition-shadow duration-300">
        ${d.logo
          ? `<img src="${d.logo}" alt="${d.name || 'Parceiro'}" class="max-w-full max-h-full object-contain">`
          : `<span class="font-display text-xs uppercase tracking-wider text-praia-teal-800/70 text-center">${d.name || 'Parceiro'}</span>`
        }
      </div>
    `).join('');
  } catch (e) {
    console.error('Falha ao carregar descontos', e);
    grid.style.display = 'none';
  }
});
```

- [ ] **Step 4: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção amarela com pattern subtil, heading, 6 logos de parceiros e CTA central.

---

## Task 11: Secção "Novidades / Artigos" (sec-artigos)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir HTML**

```html
<section id="sec-artigos" class="section section-light section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>

  <div class="relative max-w-7xl mx-auto px-6 mb-10">
    <div class="flex items-end justify-between">
      <div>
        <span class="eyebrow eyebrow-light reveal-up">Novidades</span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-praia-teal-800 tracking-tight mt-3 reveal-up">
          Histórias do interior<br>de Portugal
        </h2>
      </div>
      <a href="artigos.html" class="hidden md:inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider hover:text-praia-yellow-600 transition-colors duration-300">
        Ver Todos <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </a>
    </div>
  </div>

  <div id="artigos-scroll" class="cards-scroll flex gap-6 overflow-x-auto pl-6 pr-6 pb-6 max-w-[100vw]">
    <div class="flex-shrink-0 w-72 md:w-80 aspect-[4/5] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
    <div class="flex-shrink-0 w-72 md:w-80 aspect-[4/5] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
    <div class="flex-shrink-0 w-72 md:w-80 aspect-[4/5] rounded-2xl bg-praia-sand-200 destaque-skel"></div>
  </div>

  <div class="md:hidden text-center mt-6 px-6">
    <a href="artigos.html" class="inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider">
      Ver Todas as Novidades <i data-lucide="arrow-right" class="w-4 h-4"></i>
    </a>
  </div>
</section>
```

- [ ] **Step 2: Adicionar script inline**

```javascript
// ── Novidades (até 5 artigos publicados) ──
document.addEventListener('DOMContentLoaded', async () => {
  const scroll = document.getElementById('artigos-scroll');
  if (!scroll) return;
  try {
    const data = await fetch('data/articles.json').then(r => r.json());
    const list = (data || [])
      .filter(a => a.status !== 'rascunho' && a.published !== false)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
    if (!list.length) { scroll.parentElement.style.display = 'none'; return; }
    scroll.innerHTML = list.map(a => `
      <a href="artigo.html?slug=${encodeURIComponent(a.slug)}" class="destaque-card flex-shrink-0 w-72 md:w-80 lg:w-96 rounded-2xl overflow-hidden bg-white shadow-layered group">
        <div class="relative h-48 md:h-56 overflow-hidden">
          <img src="${a.cover || a.image || 'https://placehold.co/800x600/003A40/FFEB3B?text=Artigo'}" alt="${a.title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110">
          <div class="absolute inset-0 bg-gradient-to-t from-praia-teal-800/70 to-transparent"></div>
          ${a.featured ? '<span class="badge badge-blue-flag absolute top-4 left-4"><i data-lucide="star" class="w-3 h-3"></i> Destaque</span>' : ''}
        </div>
        <div class="p-5 md:p-6">
          <h3 class="font-display text-lg font-bold text-praia-teal-800 leading-snug mb-2 group-hover:text-praia-teal-600 transition-colors duration-300">${a.title}</h3>
          <p class="text-sm text-praia-sand-600 leading-relaxed-plus">${a.excerpt || ''}</p>
        </div>
      </a>
    `).join('');
    lucide.createIcons();
  } catch (e) {
    console.error('Falha ao carregar artigos', e);
    scroll.parentElement.style.display = 'none';
  }
});
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: scroll horizontal com 5 cards de artigo, fotos, gradient overlay, scroll snap funcional.

---

## Task 12: Secção "Comunidade" (sec-comunidade)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir HTML**

```html
<section id="sec-comunidade" class="section section-dark section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <!-- Light rays subtis -->
  <div class="rays absolute inset-0 pointer-events-none"></div>

  <div class="relative max-w-6xl mx-auto px-6">
    <div class="grid lg:grid-cols-5 gap-12 items-center">
      <!-- Mockup review (esquerda, 2/5) -->
      <div class="lg:col-span-2 reveal-up">
        <div class="bg-white text-praia-sand-900 rounded-2xl shadow-2xl p-6 max-w-sm mx-auto rotate-[-2deg]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-praia-yellow-400 to-praia-blue-400 flex items-center justify-center font-display font-bold text-praia-teal-800">MS</div>
            <div>
              <div class="font-display font-bold text-sm">Maria S.</div>
              <div class="text-xs text-praia-sand-600">há 3 dias · Praia da Carriça</div>
            </div>
          </div>
          <div class="flex gap-1 mb-3 review-stars">
            <i data-lucide="star" class="w-4 h-4" data-star="1" style="fill:#FFEB3B;color:#FFEB3B;"></i>
            <i data-lucide="star" class="w-4 h-4" data-star="2" style="fill:#FFEB3B;color:#FFEB3B;"></i>
            <i data-lucide="star" class="w-4 h-4" data-star="3" style="fill:#FFEB3B;color:#FFEB3B;"></i>
            <i data-lucide="star" class="w-4 h-4" data-star="4" style="fill:#FFEB3B;color:#FFEB3B;"></i>
            <i data-lucide="star" class="w-4 h-4" data-star="5" style="fill:#FFEB3B;color:#FFEB3B;"></i>
          </div>
          <p class="text-sm leading-relaxed">Um lugar mágico, água cristalina e com sombra natural. O bar tem petiscos óptimos e o pessoal é simpático. Voltamos com certeza!</p>
        </div>
      </div>

      <!-- Texto (direita, 3/5) -->
      <div class="lg:col-span-3">
        <span class="eyebrow eyebrow-dark reveal-up">Comunidade</span>
        <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight mt-3 mb-5 reveal-up">
          Partilhe a sua<br>experiência
        </h2>
        <p class="text-white/70 text-lg leading-relaxed-plus mb-6 max-w-lg reveal-up">
          Em cada página de praia pode escrever um comentário, dar estrelas, e ler avaliações de outros visitantes. As suas dicas ajudam quem chega a seguir.
        </p>
        <div class="flex flex-wrap gap-3 mb-10">
          <span class="inline-flex items-center gap-2 bg-white/8 border border-white/15 rounded-full px-4 py-2 text-white/85 text-sm reveal-up">
            <i data-lucide="message-square" class="w-4 h-4 text-praia-yellow-400"></i> Comentários
          </span>
          <span class="inline-flex items-center gap-2 bg-white/8 border border-white/15 rounded-full px-4 py-2 text-white/85 text-sm reveal-up">
            <i data-lucide="star" class="w-4 h-4 text-praia-yellow-400"></i> Estrelas
          </span>
          <span class="inline-flex items-center gap-2 bg-white/8 border border-white/15 rounded-full px-4 py-2 text-white/85 text-sm reveal-up">
            <i data-lucide="award" class="w-4 h-4 text-praia-yellow-400"></i> Badges
          </span>
        </div>
        <a href="rede.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full shadow-layered-yellow">
          <i data-lucide="map-pinned" class="w-5 h-5"></i>
          Explorar Praias
        </a>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS dos rays e stars**

```css
.rays {
  background:
    radial-gradient(ellipse at 20% 0%, rgba(255,235,59,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(2,136,209,0.07) 0%, transparent 55%);
}
.review-stars i {
  opacity: 0;
  transform: scale(0.5);
  animation: star-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.review-stars i[data-star="1"] { animation-delay: 0.15s; }
.review-stars i[data-star="2"] { animation-delay: 0.25s; }
.review-stars i[data-star="3"] { animation-delay: 0.35s; }
.review-stars i[data-star="4"] { animation-delay: 0.45s; }
.review-stars i[data-star="5"] { animation-delay: 0.55s; }
@keyframes star-pop { to { opacity: 1; transform: scale(1); } }
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: secção dark, mockup de review à esquerda (rotação leve), texto + chips + CTA à direita. Estrelas iluminam-se em sequência ao entrar.

---

## Task 13: Secção "Contactos + Redes Sociais" (sec-contactos)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Inserir HTML**

```html
<section id="sec-contactos" class="section section-dark-deep section-pad">
  <div class="noise-overlay absolute inset-0 pointer-events-none"></div>
  <div class="relative max-w-3xl mx-auto px-6 text-center">
    <span class="eyebrow eyebrow-dark reveal-up">Falar Connosco</span>
    <h2 class="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mt-3 reveal-up">
      Estamos a um <span class="text-praia-yellow-400">clique</span>
    </h2>
    <p class="text-white/65 text-lg leading-relaxed-plus max-w-xl mx-auto mt-4 mb-10 reveal-up">
      Tem uma sugestão, uma dúvida, ou quer ser parceiro? Adoramos ouvi-lo.
    </p>

    <a href="contactos.html" class="btn-primary inline-flex items-center gap-3 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-10 py-5 rounded-full shadow-layered-yellow text-base">
      <i data-lucide="mail" class="w-5 h-5"></i>
      Ir para Contactos
    </a>

    <div class="flex items-center justify-center gap-4 mt-12 mb-6">
      <span class="h-px w-16 bg-white/15"></span>
      <span class="font-display text-xs uppercase tracking-[0.2em] text-white/45">ou siga-nos</span>
      <span class="h-px w-16 bg-white/15"></span>
    </div>

    <div class="flex items-center justify-center gap-4">
      <a href="https://www.facebook.com/praiasfluviais" target="_blank" rel="noopener noreferrer" aria-label="Facebook" class="social-pulse w-14 h-14 rounded-full bg-white/8 border border-white/15 flex items-center justify-center text-white/80 hover:bg-praia-yellow-400 hover:text-praia-teal-800 hover:border-praia-yellow-400 transition-colors duration-300">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
      </a>
      <a href="https://www.instagram.com/guiadaspraiasfluviais" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="social-pulse w-14 h-14 rounded-full bg-white/8 border border-white/15 flex items-center justify-center text-white/80 hover:bg-praia-yellow-400 hover:text-praia-teal-800 hover:border-praia-yellow-400 transition-colors duration-300">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
      </a>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Adicionar CSS do pulse**

```css
.social-pulse { animation: social-breath 3.4s ease-in-out infinite; }
.social-pulse:hover { animation: none; }
.social-pulse:nth-of-type(2) { animation-delay: 1.7s; }
@keyframes social-breath {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@media (prefers-reduced-motion: reduce) {
  .social-pulse { animation: none; }
}
```

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Expected: última secção dark com CTA central, divisor "ou siga-nos", 2 ícones grandes redondos a respirar, footer logo abaixo intacto.

---

## Task 14: Animações GSAP ScrollTrigger globais

**Files:**
- Modify: `index.html` (adicionar bloco final de script)

- [ ] **Step 1: Adicionar bloco de inicialização GSAP**

Adicionar antes do `</body>` (depois dos outros scripts inline):

```html
<script>
(() => {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal-up, .reveal-fade').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // ── Reveal-up universal (com stagger por secção) ──
  document.querySelectorAll('.section').forEach(section => {
    const items = section.querySelectorAll('.reveal-up, .reveal-fade');
    if (!items.length) return;
    gsap.to(items, {
      opacity: 1, y: 0,
      duration: 0.8,
      ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      stagger: 0.08,
      scrollTrigger: {
        trigger: section,
        start: 'top 78%',
        once: true,
      }
    });
  });

  // ── Parallax leve em mockups e imagens decorativas ──
  document.querySelectorAll('.passport-visual, .rede-map, .destaque-card img').forEach(el => {
    gsap.to(el, {
      yPercent: -8,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('.section') || el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      }
    });
  });

  // ── Sticky-pin Rede de Praias (apenas desktop ≥1024) ──
  if (window.matchMedia('(min-width: 1024px)').matches) {
    const rede = document.getElementById('sec-rede');
    if (rede) {
      ScrollTrigger.create({
        trigger: rede,
        start: 'top top',
        end: '+=50%',
        pin: '.rede-text',
        pinSpacing: false,
      });
    }
  }

  // ── Timeline draw em "Praia do Ano" ──
  const track = document.querySelector('#sec-ano .timeline-track');
  if (track) {
    gsap.fromTo(track, { scaleY: 0, transformOrigin: 'top' }, {
      scaleY: 1, ease: 'none',
      scrollTrigger: { trigger: '#sec-ano', start: 'top 70%', end: 'bottom 60%', scrub: true }
    });
  }

  ScrollTrigger.refresh();
})();
</script>
```

- [ ] **Step 2: Substituir o JS de `data-reveal-delay` antigo (se ainda existir)**

Procurar por `reveal-on-scroll` no `index.html` — se aparecer fora do hero, substituir por `reveal-up`. O hero mantém-se como está. As outras secções já usam `reveal-up` (definido nas tasks anteriores).

- [ ] **Step 3: Verificar visualmente em desktop**

Run: `node screenshot.mjs http://localhost:3000`
Scroll devagar a partir do hero, observar:
- Cada secção: elementos a entrar com fade + slide-up + stagger
- Timeline da Praia do Ano: linha amarela desenha-se conforme scroll
- Passport mockup: parallax leve enquanto scroll
- Rede de Praias: texto fica pinned enquanto o mapa rola ao lado (desktop)

- [ ] **Step 4: Verificar mobile**

Resize do browser para 375px. Garantir que não há overflow horizontal e que o sticky-pin não está activo (matchMedia bloqueia <1024px).

- [ ] **Step 5: Verificar `prefers-reduced-motion`**

DevTools → Rendering → "Emulate prefers-reduced-motion: reduce". Refresh. Tudo deve aparecer estaticamente sem animações.

---

## Task 15: QA Mobile + Responsive fixes

**Files:**
- Modify: `index.html` (CSS no `<style>`)

- [ ] **Step 1: Tirar screenshot mobile**

Run: `node _diag-mobile.mjs` (ou `node screenshot.mjs http://localhost:3000` com viewport mobile — verificar `_diag-mobile.mjs` para o comando exacto). Capturar cada secção em viewport 375x812.

- [ ] **Step 2: Identificar problemas comuns e corrigir**

Adicionar no `<style>` do head:

```css
/* Mobile fine-tuning */
@media (max-width: 768px) {
  .section-pad { padding: 64px 0; }
  #sec-rede .grid, #sec-passaporte .grid, #sec-ano .grid, #sec-onde .grid, #sec-comunidade .grid { gap: 32px; }
  #sec-passaporte .passport-visual .aspect-\[4\/5\] { max-width: 280px; }
  .onde-tabs { flex-direction: column; gap: 4px; padding: 6px; }
  .onde-tab { width: 100%; justify-content: center; }
  #sec-comunidade .lg\:col-span-2 .rotate-\[-2deg\] { transform: rotate(-1deg); margin-bottom: 24px; }
}

/* Garantir que ninguém faz overflow horizontal */
html, body { overflow-x: hidden; }
```

- [ ] **Step 3: Verificar bottom-nav não tapa CTAs**

A última secção (Contactos) deve ter `padding-bottom` extra em mobile para o `bottom-nav` (h-16 = 64px) não tapar o CTA. Adicionar:

```css
@media (max-width: 1024px) {
  #sec-contactos { padding-bottom: 96px; }
}
```

- [ ] **Step 4: Verificar carregamento de imagens**

Confirmar que todas as imagens dinâmicas (Praias em Destaque, Loja, Artigos) têm `loading="lazy"`. Já está no código das tasks anteriores. Confirmar.

- [ ] **Step 5: Re-screenshot**

Re-correr captures mobile e desktop. Confirmar que não há layout shifts ao scroll, sem overflow-x, sem console warnings/errors.

---

## Task 16: Admin — Secção "Pool de Praias em Destaque"

**Files:**
- Modify: `admin.html` (adicionar entrada de menu se relevante)
- Modify: `js/admin.js` (lógica CRUD da nova secção)

- [ ] **Step 1: Localizar a estrutura do admin**

Ler `js/admin.js` linhas 1700-2000 para perceber o padrão das secções existentes (ex.: `featuredBeaches`). Cada secção:
1. Tem uma função `renderXxx(state)` que devolve HTML
2. Está registada num router/tab system
3. Salva via uma função `saveXxx(state, payload)`

- [ ] **Step 2: Adicionar a função `renderHomeFeaturedPool`**

Localizar onde estão registadas as outras secções (procurar por `featuredBeaches` em `admin.js`). Adicionar a nova secção a seguir, no mesmo padrão. Esboço da função:

```javascript
function renderHomeFeaturedPool(state) {
  const beaches = state.data.beaches || [];
  const settings = state.data.settings || {};
  const pool = settings.homeFeaturedPool || [];

  return `
    <section class="admin-section">
      <header class="admin-section-header">
        <h2>Pool de Praias em Destaque (Homepage)</h2>
        <p class="admin-section-desc">Praias elegíveis para a secção "Praias em Destaque" da homepage. As 3 mostradas são escolhidas semanalmente a partir desta lista.</p>
      </header>
      <div class="admin-card">
        <div class="admin-grid-pool">
          ${beaches.map(b => `
            <label class="admin-pool-item">
              <input type="checkbox" data-pool-id="${b.id}" ${pool.includes(b.id) ? 'checked' : ''}>
              <span>${escHtml(b.name)} <small>${escHtml(b.municipality || '')}</small></span>
            </label>
          `).join('')}
        </div>
        <div class="admin-actions">
          <button type="button" class="btn-primary" data-action="save-home-pool">Guardar Pool</button>
        </div>
      </div>
    </section>
  `;
}

function bindHomeFeaturedPool() {
  const btn = document.querySelector('[data-action="save-home-pool"]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const checks = document.querySelectorAll('[data-pool-id]:checked');
    const ids = Array.from(checks).map(c => c.dataset.poolId);
    state.data.settings.homeFeaturedPool = ids;
    saveSettings();
    showToast('Pool guardado.');
  });
}
```

- [ ] **Step 3: Adicionar CSS para o grid de checkboxes**

No `css/admin.css`:

```css
.admin-grid-pool {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px 16px;
  max-height: 480px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #e5e0d8;
  border-radius: 8px;
}
.admin-pool-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
}
.admin-pool-item:hover { background: #f5f0e8; }
.admin-pool-item small { color: #888; margin-left: 4px; }
```

- [ ] **Step 4: Registar a secção no router do admin**

Localizar onde estão listadas as tabs/sections (procurar por outras chamadas a `renderFeaturedBeaches` ou similar). Adicionar entrada:

```javascript
{ id: 'home-pool', label: 'Pool Homepage', icon: 'star', render: renderHomeFeaturedPool, bind: bindHomeFeaturedPool }
```

- [ ] **Step 5: Verificar manualmente**

Abrir `admin.html`, autenticar-se, navegar para a nova secção. Marcar/desmarcar praias, gravar. Recarregar admin → ver que persistiu. Abrir `data/settings.json` exportado → confirmar que `homeFeaturedPool` foi atualizado com os IDs corretos.

---

## Task 17: Admin — Secção "Praias em Destaque desta Semana"

**Files:**
- Modify: `js/admin.js`

- [ ] **Step 1: Adicionar a função `renderHomeFeaturedCurrent`**

```javascript
function renderHomeFeaturedCurrent(state) {
  const beaches = state.data.beaches || [];
  const settings = state.data.settings || {};
  const pool = settings.homeFeaturedPool || [];
  const current = settings.homeFeaturedCurrent;
  const weekKey = (window.FeaturedBeaches && window.FeaturedBeaches.getISOWeekKey()) || '';

  // Praias actualmente em destaque (mesma lógica do site)
  let activeIds = [];
  if (current && current.weekKey === weekKey && Array.isArray(current.beachIds)) {
    activeIds = current.beachIds.slice(0, 3);
  } else {
    // Fallback determinístico
    if (window.FeaturedBeaches && pool.length) {
      const picks = window.FeaturedBeaches.pickThree(settings, beaches);
      activeIds = picks.map(b => b.id);
    }
  }
  while (activeIds.length < 3) activeIds.push('');

  const poolBeaches = beaches.filter(b => pool.includes(b.id));

  return `
    <section class="admin-section">
      <header class="admin-section-header">
        <h2>Praias em Destaque desta Semana</h2>
        <p class="admin-section-desc">Semana <code>${escHtml(weekKey)}</code>. Por defeito: 3 praias escolhidas aleatoriamente do pool. Pode fazer override manual aqui.</p>
      </header>
      <div class="admin-card">
        <div class="admin-current-row">
          ${[0, 1, 2].map(i => `
            <label>
              <span>Praia ${i + 1}</span>
              <select data-current-slot="${i}">
                <option value="">— escolher —</option>
                ${poolBeaches.map(b => `<option value="${b.id}" ${activeIds[i] === b.id ? 'selected' : ''}>${escHtml(b.name)}</option>`).join('')}
              </select>
            </label>
          `).join('')}
        </div>
        <div class="admin-actions">
          <button type="button" class="btn-primary" data-action="save-home-current">Guardar Override</button>
          <button type="button" class="btn-secondary" data-action="reset-home-current">Repor Automático</button>
        </div>
      </div>
    </section>
  `;
}

function bindHomeFeaturedCurrent() {
  const saveBtn = document.querySelector('[data-action="save-home-current"]');
  const resetBtn = document.querySelector('[data-action="reset-home-current"]');
  const weekKey = (window.FeaturedBeaches && window.FeaturedBeaches.getISOWeekKey()) || '';

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const slots = document.querySelectorAll('[data-current-slot]');
      const ids = Array.from(slots).map(s => s.value).filter(Boolean);
      if (ids.length !== 3) {
        showToast('Escolha 3 praias.', 'error');
        return;
      }
      state.data.settings.homeFeaturedCurrent = { weekKey, beachIds: ids };
      saveSettings();
      showToast('Override guardado.');
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.data.settings.homeFeaturedCurrent = null;
      saveSettings();
      showToast('Reposto. Voltou ao automático.');
      // Re-renderizar a vista
      reRenderCurrentSection();
    });
  }
}
```

- [ ] **Step 2: Adicionar CSS**

```css
.admin-current-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.admin-current-row label {
  display: flex; flex-direction: column; gap: 6px;
  font-size: 13px; font-weight: 600; color: #333;
}
.admin-current-row select {
  padding: 8px 10px;
  border: 1px solid #e5e0d8;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
}
@media (max-width: 768px) {
  .admin-current-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Carregar `featured-beaches.js` no admin**

Em `admin.html`, adicionar `<script src="js/featured-beaches.js"></script>` antes de `<script src="js/admin.js"></script>`.

- [ ] **Step 4: Registar a secção no router**

```javascript
{ id: 'home-current', label: 'Destaques Semana', icon: 'sparkles', render: renderHomeFeaturedCurrent, bind: bindHomeFeaturedCurrent }
```

- [ ] **Step 5: Verificar manualmente**

Abrir admin → secção "Destaques Semana".
- Sem override: dropdowns mostram as 3 praias auto-selecionadas (o utilizador vê a mesma escolha que o site público).
- Mudar dropdowns + Guardar Override → site público passa a mostrar essas 3.
- Repor Automático → volta à seleção determinística.

---

## Task 18: QA final cross-browser + sanity checks

**Files:**
- Read-only

- [ ] **Step 1: Verificar Lighthouse**

DevTools → Lighthouse → Mobile + Performance + Accessibility. Esperado: Performance ≥ 90, Accessibility ≥ 95.

- [ ] **Step 2: Verificar todas as secções fazem reveal**

Scroll lento da homepage do topo ao fundo. Cada `reveal-up` deve animar uma vez (não em loop), sem stutter.

- [ ] **Step 3: Verificar Praia em Destaque com pool vazio**

Editar `data/settings.json` temporariamente → `"homeFeaturedPool": []`. Refresh. Esperar mensagem "Sem praias em destaque esta semana." em vez de cards. Reverter.

- [ ] **Step 4: Verificar override do admin**

Manualmente em `data/settings.json`, definir `"homeFeaturedCurrent": { "weekKey": "<week-actual>", "beachIds": ["<id-1>", "<id-2>", "<id-3>"] }`. Refresh. Confirmar que aparecem essas 3 (e não as deterministicamente escolhidas).

- [ ] **Step 5: Verificar tabs Onde Encontrar**

Clicar várias vezes alternando tabs. Verificar transição smooth, sem flash.

- [ ] **Step 6: Verificar links**

Clicar em todos os CTAs e mini-links. Confirmar que abrem a página correta:
- `rede.html`, `passaporte.html`, `votar.html`, `onde-encontrar-guia.html`, `onde-encontrar-passaporte.html`, `loja.html`, `descontos.html`, `artigos.html`, `contactos.html`

- [ ] **Step 7: Verificar console limpa**

DevTools console. Sem `Failed to load resource`, sem `TypeError`, sem `404`.

---

## Self-Review (executor: marcar antes de fechar)

- [ ] **Spec coverage:** Cada secção da spec § 6 tem uma task (4-13). Animações § 5 → Task 14. Mobile § 9 → Task 15. Admin § 8 → Tasks 16-17. ✓
- [ ] **Hero intacto:** Hero não foi tocado em qualquer task — só copiado em Task 3 Step 2. ✓
- [ ] **Page-turn removido só da homepage:** Task 3 Step 4 remove `<script src="js/page-turn.js">` do `index.html`, mas o ficheiro permanece para outras páginas. ✓
- [ ] **Pool inicial não vazio:** Task 1 Step 2 pré-preenche `homeFeaturedPool` com 4 IDs. ✓
- [ ] **Override semanal:** Task 17 grava `weekKey` actual + 3 IDs. ✓
- [ ] **Reduced motion:** Task 14 tem fallback explícito. ✓
- [ ] **Naming consistente:** `homeFeaturedPool` / `homeFeaturedCurrent` em todo lado (Tasks 1, 2, 16, 17). ✓
- [ ] **Não auto-commit:** Plano não tem `git commit` automático em qualquer task. ✓
