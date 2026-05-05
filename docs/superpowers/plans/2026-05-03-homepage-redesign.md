# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project rules (from CLAUDE.md):**
> - **NÃO auto-committar.** O utilizador commita manualmente quando quiser. Não há `git commit` neste plano.
> - **Antes de escrever frontend, invocar a skill `frontend-design`.** Sessão única é suficiente.
> - **Nunca matar `node serve.mjs`** (porta 3000). Servidor persiste entre tarefas.
> - **Toda a UI em PT-PT com tratamento por "você"**, sem em-dash ("—") em texto visível ao utilizador.
> - **Tailwind CDN não gera classes injectadas via JS.** Para HTML gerado dinamicamente (cards de loja, artigos), usar `style=""` inline. Para HTML estático, classes Tailwind são OK.
> - **Logo `brand_assets/logotipo.png` não pode ser alterado.**
> - **Hero (linhas 269-374 do `index.html` actual) mantém-se pixel-perfect.** Copiar verbatim.

**Goal:** Refazer totalmente o `<main>` da homepage com 12 secções editorial bold (hero + 11 novas), animações GSAP scroll-driven e profundidade 3D em pontos cirúrgicos.

**Architecture:** Eliminar o sistema page-turn da homepage. Substituir por scroll vertical contínuo. Cada secção tem personalidade visual distinta (light/dark/dark-deep/yellow). Tipografia gigante (Poppins 800), layouts assimétricos, números como elementos visuais. 3D nível médio (CSS perspective + GSAP scroll-driven, sem Three.js). Praias da Semana geridas manualmente via novo campo no admin (sem PRNG, sem auto-rotação).

**Tech Stack:** HTML estático, Tailwind CDN, GSAP 3.12.5 + ScrollTrigger, Leaflet 1.9.4, Lucide Icons, JSON em `data/`. Sem novos pacotes. Sem Three.js / WebGL.

**Reference spec:** [docs/superpowers/specs/2026-05-03-homepage-redesign-design.md](../specs/2026-05-03-homepage-redesign-design.md)

---

## File Structure

**Modified:**
- `index.html` (1020 linhas actuais → ~1700 linhas)
  - `<main>` reescrito (linhas 254-781 actuais → novo conteúdo)
  - `<style>` no head ampliado com classes globais de secção
  - Script `<script src="js/page-turn.js">` removido (linha 872)
  - Novo `<script>` GSAP de animação no fim do body
- `data/settings.json` — adicionar `homeFeaturedBeachIds`, `communityCount`
- `admin.html` — remover linha 52 (`<script src="js/featured-beaches.js">`)
- `js/admin.js` — duas novas secções dentro de `renderSettings()` (linha 1795); update a `saveSettings()` (linha 2085)

**Deleted:**
- `js/featured-beaches.js` (untracked, criado pelo spec descartado)

**Untouched:**
- Header (`index.html` linhas ~141-194)
- Hero (`index.html` linhas 269-374) — copiar verbatim
- Footer (`index.html` linhas 786-846)
- Mobile bottom-nav (`index.html` linhas 849-869)
- Counter animation script (`index.html` linhas 921-974) — adaptar selectores apenas
- Auth scripts (`index.html` linhas 976-1017)
- `js/page-turn.js`, `css/page-turn.css` — usados em outras páginas
- `data/beaches.json`, `data/articles.json`, `data/products.json` — só leitura

---

## Pre-flight (uma vez antes de qualquer task)

- [ ] **Invocar a skill `frontend-design`** (CLAUDE.md exige antes de qualquer código frontend).
- [ ] **Verificar que o servidor local está a correr.** Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` Expected: `200`. Se não estiver, arrancar com `node serve.mjs` em background — **não matar entre tarefas**.
- [ ] **Confirmar que `js/featured-beaches.js` está untracked.** Run: `git status js/featured-beaches.js` Expected: ficheiro listado em "Untracked files". Se aparecer noutro estado, parar e verificar.
- [ ] **Confirmar limites do hero a manter intacto.** Ler `index.html` linhas 269-374 e copiar para um buffer mental — vai ser colado verbatim na Task 4.

---

## Task 1: Adicionar campos a `data/settings.json`

**Files:**
- Modify: `data/settings.json`

- [ ] **Step 1: Ler o `settings.json` para confirmar estrutura actual**

Run: `cat data/settings.json | head -25`
Confirmar que existe `featuredBeaches` (linha 16) — **NÃO mexer nele**, é um campo legacy não relacionado.

- [ ] **Step 2: Adicionar `homeFeaturedBeachIds` e `communityCount`**

Editar `data/settings.json`. Inserir as duas chaves logo a seguir ao fecho do array `featuredBeaches` (após a linha `]`):

```json
  "featuredBeaches": [
    "praia-fluvial-de-loriga",
    "praia-fluvial-de-avo",
    "albufeira-do-azibo",
    "praia-fluvial-de-geres"
  ],
  "homeFeaturedBeachIds": [
    "praia-fluvial-de-loriga",
    "praia-fluvial-de-avo",
    "albufeira-do-azibo"
  ],
  "communityCount": 1200,
  "previousWinners": [
```

Pré-preencher `homeFeaturedBeachIds` com 3 IDs do `featuredBeaches` actual (que sabemos existirem em `beaches.json`).

- [ ] **Step 3: Validar que o JSON é válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/settings.json'))" && echo OK`
Expected: `OK`

- [ ] **Step 4: Validar que os 3 IDs existem em `beaches.json`**

Run:
```bash
node -e "
const beaches = JSON.parse(require('fs').readFileSync('data/beaches.json'));
const settings = JSON.parse(require('fs').readFileSync('data/settings.json'));
const missing = settings.homeFeaturedBeachIds.filter(id => !beaches.find(b => b.id === id));
console.log(missing.length === 0 ? 'OK' : 'MISSING: ' + missing.join(', '));
"
```
Expected: `OK`

---

## Task 2: Admin — adicionar UI para os novos campos

> **CLAUDE.md:** "Always update admin in the same task as any code change that affects data structures." Esta task cumpre essa regra.

**Files:**
- Modify: `js/admin.js` (`renderSettings` linha ~1795, `saveSettings` linha ~2085)

- [ ] **Step 1: Adicionar secção "Praias da Semana (Homepage)" dentro de `renderSettings`**

Em `js/admin.js`, dentro da função `renderSettings(container)`, adicionar uma nova secção logo a seguir ao bloco "Loja · Portes de Envio" (que termina por volta da linha 1835, fim de `</div>` do bloco Loja). Inserir este HTML dentro do template literal `container.innerHTML = \`...\``:

```html
      <!-- Praias da Semana -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-1">Praias da Semana (Homepage)</h3>
        <p style="font-size:12px;color:#8A7D60;margin-bottom:14px;">Escolha 3 praias para a secção "Praias da Semana" da homepage. Atualizam-se quando você gravar.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          ${[0, 1, 2].map(i => {
            const currentId = (s.homeFeaturedBeachIds || [])[i] || '';
            return `
              <div>
                <label style="font-size:11px;color:#4B3F2A;font-weight:600;display:block;margin-bottom:4px;">Praia ${i + 1}</label>
                <select id="s-home-featured-${i}" class="w-full px-3 py-2 text-sm border border-praia-sand-200 rounded-lg bg-white">
                  <option value="">- Sem praia -</option>
                  ${beaches.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt')).map(b => `
                    <option value="${b.id}" ${b.id === currentId ? 'selected' : ''}>${escHtml(b.name)}</option>
                  `).join('')}
                </select>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Comunidade -->
      <div class="bg-white rounded-xl p-5 mb-4 shadow-sm border border-praia-sand-100">
        <h3 class="font-display text-xs uppercase tracking-wider text-praia-teal-700 font-semibold mb-1">Comunidade (Homepage)</h3>
        <p style="font-size:12px;color:#8A7D60;margin-bottom:14px;">Número de avaliações mostrado na secção Comunidade da homepage. É um valor ilustrativo (mockup), pode definir o que quiser.</p>
        <div style="max-width:200px;">
          <label>Nº de Avaliações</label>
          <input type="number" id="s-community-count" min="0" step="1" value="${s.communityCount || 1200}">
        </div>
      </div>
```

Inserir **antes** do bloco "Praias em Destaque" (linha 1838 actual) — ordem final:
1. Votação
2. Anúncio
3. Loja · Portes de Envio
4. **Praias da Semana** (nova)
5. **Comunidade** (nova)
6. Praias em Destaque (legacy)
7. Artigos em Destaque
8. Vencedores Anteriores

- [ ] **Step 2: Atualizar `saveSettings()` para persistir os novos campos**

Em `js/admin.js`, na função `saveSettings()` (linha ~2085), adicionar dentro do objecto que assenta `state.data.settings = { ... }`:

```js
    homeFeaturedBeachIds: [0, 1, 2]
      .map(i => document.getElementById(`s-home-featured-${i}`)?.value || '')
      .filter(v => v.length > 0),
    communityCount: parseInt(document.getElementById('s-community-count')?.value || '1200', 10),
```

Adicionar entre `freeShippingThreshold: ...` e o comentário `// previousWinners already flushed...`.

- [ ] **Step 3: Verificar admin no browser**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin.html` Expected: `200`.

Abrir `http://localhost:3000/admin.html` no browser, fazer login, ir a Configurações. Verificar que aparecem as duas novas secções com:
- 3 dropdowns para Praias da Semana, com os 3 IDs pré-populados de Task 1.
- Campo numérico para Nº de Avaliações com `1200` por defeito.

Trocar a primeira praia para outra qualquer, gravar (botão "Guardar Configurações" + "Gravar alterações").

- [ ] **Step 4: Validar que `data/settings.json` foi atualizado**

Run: `node -e "const s=JSON.parse(require('fs').readFileSync('data/settings.json'));console.log(JSON.stringify({homeFeaturedBeachIds:s.homeFeaturedBeachIds,communityCount:s.communityCount}))"`
Expected: o objecto reflete o ID novo escolhido + `communityCount: 1200`.

Voltar a colocar os 3 IDs originais antes de prosseguir.

---

## Task 3: Eliminar `js/featured-beaches.js`

**Files:**
- Delete: `js/featured-beaches.js`
- Modify: `admin.html` (linha 52)

- [ ] **Step 1: Confirmar que o ficheiro está untracked**

Run: `git status js/featured-beaches.js`
Expected: aparece em "Untracked files".

- [ ] **Step 2: Eliminar o ficheiro**

Run: `rm js/featured-beaches.js`
Run: `test ! -e js/featured-beaches.js && echo OK`
Expected: `OK`

- [ ] **Step 3: Remover a referência em `admin.html`**

Editar `admin.html`, eliminar a linha 52:
```html
<script src="js/featured-beaches.js"></script>
```

- [ ] **Step 4: Confirmar que ninguém mais referencia o ficheiro**

Run: `grep -rn "featured-beaches.js" --include="*.html" --include="*.js" .`
Expected: **0 resultados**.

- [ ] **Step 5: Verificar admin ainda carrega sem erros**

Refrescar `http://localhost:3000/admin.html`. Abrir DevTools console. Esperado: 0 erros 404 ou similares.

---

## Task 4: `index.html` — remover `<main>` antigo, adicionar scaffold + CSS global

**Files:**
- Modify: `index.html` (linhas 254-781, head `<style>`, script tag linha 872)

> **Atenção:** esta task elimina muito conteúdo de uma vez. Antes de avançar, fazer screenshot do estado actual para comparação visual posterior:
> Run: `node screenshot.mjs http://localhost:3000`
> Ler o PNG resultante (em `./temporary screenshots/`) e confirmar que o hero está intacto.

- [ ] **Step 1: Ler o hero actual (linhas 269-374) para colar verbatim**

Run: `sed -n '269,374p' index.html > /tmp/hero-snapshot.html && wc -l /tmp/hero-snapshot.html`
Expected: `106 /tmp/hero-snapshot.html`

Manter este snapshot intacto até ao Step 4.

- [ ] **Step 2: Substituir `<main>` completo (linhas 254-781) por novo scaffold**

Editar `index.html`. Substituir tudo entre `<!-- ─── Main Content ─── -->` (linha 253) e o `</main>` (linha 781) inclusive por:

```html
  <!-- ─── Main Content ─── -->
  <main id="main" class="bg-praia-sand-50">

    <!-- 1. HERO (mantido pixel-perfect — verbatim do estado anterior) -->
    <section class="hero-bg relative flex items-center justify-center min-h-screen" id="page-hero">
      <!-- COLAR AQUI o conteúdo de /tmp/hero-snapshot.html (linhas 269-374 do estado anterior),
           começando em <div class="noise-overlay ...> e terminando antes de </section> -->
    </section>

    <!-- 2. REDE / MAPA -->
    <section id="sec-rede" class="section section-light section-pad" data-bg="light"></section>

    <!-- 3. ONDE ENCONTRAR O GUIA -->
    <section id="sec-guia" class="section section-dark section-pad" data-bg="dark"></section>

    <!-- 4. PRAIAS DA SEMANA -->
    <section id="sec-semana" class="section section-light section-pad" data-bg="light"></section>

    <!-- 5. COMUNIDADE -->
    <section id="sec-comunidade" class="section section-dark section-pad" data-bg="dark"></section>

    <!-- 6. PASSAPORTE -->
    <section id="sec-passaporte" class="section section-dark-deep section-pad" data-bg="dark-deep"></section>

    <!-- 7. ONDE CARIMBAR PASSAPORTE -->
    <section id="sec-carimbar" class="section section-light section-pad" data-bg="light"></section>

    <!-- 8. PRAIA DO ANO 2026 -->
    <section id="sec-ano" class="section section-dark section-pad" data-bg="dark"></section>

    <!-- 9. LOJA -->
    <section id="sec-loja" class="section section-light section-pad" data-bg="light"></section>

    <!-- 10. ARTIGOS -->
    <section id="sec-artigos" class="section section-light section-pad" data-bg="light"></section>

    <!-- 11. DESCONTOS -->
    <section id="sec-descontos" class="section section-yellow section-pad" data-bg="yellow"></section>

    <!-- 12. CONTACTOS + NEWSLETTER -->
    <section id="sec-contactos" class="section section-dark-deep section-pad" data-bg="dark-deep"></section>

  </main>
```

Substituir o comentário `<!-- COLAR AQUI ... -->` pelo conteúdo real do hero (de `<div class="noise-overlay ...>` até ao último `</div>` antes de `</section>` do hero original).

- [ ] **Step 3: Adicionar classes globais ao `<style>` do head**

Editar `index.html` head, dentro do `<style>` existente (linha ~69). Adicionar **logo a seguir** ao bloco `.hero-bg::before { ... }` (antes de `/* Cards carousel */`):

```css
    /* ── Section base (homepage redesign) ── */
    .section {
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }
    .section-light       { background: #FAF8F5; color: #003A40; }
    .section-dark        { background: linear-gradient(180deg, #003A40 0%, #002A2E 100%); color: #fff; }
    .section-dark-deep   { background: linear-gradient(180deg, #002A2E 0%, #001f23 100%); color: #fff; }
    .section-yellow      { background: linear-gradient(135deg, #F5B800 0%, #FFEB3B 100%); color: #003A40; }
    .section-pad         { padding: clamp(64px, 9vw, 130px) 0; }

    /* Eyebrow */
    .eyebrow {
      display: inline-block;
      font-family: 'Poppins', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.25em;
      text-transform: uppercase;
    }
    .eyebrow-light  { color: #0288D1; }
    .eyebrow-dark   { color: #FFEB3B; }

    /* Headings editoriais */
    .h-editorial {
      font-family: 'Poppins', sans-serif;
      font-weight: 700;
      font-size: clamp(40px, 6vw, 88px);
      line-height: 0.98;
      letter-spacing: -0.02em;
    }
    .h-giant {
      font-family: 'Poppins', sans-serif;
      font-weight: 800;
      font-size: clamp(80px, 14vw, 220px);
      line-height: 0.9;
      letter-spacing: -0.04em;
    }

    /* Reveal helpers (GSAP toma conta a partir daqui) */
    .reveal-up       { opacity: 0; transform: translateY(28px); }
    .reveal-fade     { opacity: 0; }
    .reveal-clip h1, .reveal-clip h2 { clip-path: inset(0 100% 0 0); }

    /* 3D card containers */
    .card-3d-stage   { perspective: 1200px; }
    .card-3d         { transform-style: preserve-3d; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }

    /* Mobile: 3D off, parallax off */
    @media (max-width: 767px) {
      .card-3d-stage   { perspective: none; }
      .card-3d         { transform: none !important; }
      [data-parallax]  { transform: none !important; }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .reveal-up, .reveal-fade { opacity: 1 !important; transform: none !important; }
      .reveal-clip h1, .reveal-clip h2 { clip-path: none !important; }
      .card-3d         { transform: none !important; }
      [data-parallax]  { transform: none !important; }
    }
```

- [ ] **Step 4: Remover o `<script src="js/page-turn.js">` no fim do body**

Procurar a linha (aproximadamente 872 antes da edição):
```html
<!-- Page-turn script -->
<script src="js/page-turn.js"></script>
```
Eliminar ambas as linhas (comentário + script).

> Não eliminar o ficheiro `js/page-turn.js` — é usado noutras páginas. Apenas remover a referência aqui.

- [ ] **Step 5: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Ler o PNG mais recente em `./temporary screenshots/`.

**Esperado:**
- Hero idêntico ao estado anterior (bolhas, logo, stats, CTAs).
- Por baixo do hero: 11 faixas de cor sólida vazias alternantes (sand / teal / sand / teal / dark-teal / sand / teal / sand / sand / amarelo / dark-teal).
- Sem erros 404 na consola.
- Sem stretching ou overflow horizontal.

Se o hero estiver partido, parar e investigar antes de avançar.

---

## Task 5: Secção 2 — Rede / Mapa

**Files:**
- Modify: `index.html` (`<section id="sec-rede">` da Task 4)
- Modify: `index.html` (script da mini-map por volta da linha 880)

**Conteúdo (spec §4.2):** layout assimétrico 40/60, número gigante "200+" + heading + 3 features à esquerda, mini-mapa Leaflet isométrico à direita.

- [ ] **Step 1: Substituir `<section id="sec-rede">` pelo conteúdo completo**

```html
    <section id="sec-rede" class="section section-light section-pad" data-bg="light">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">

        <!-- Coluna esquerda: número + heading + features -->
        <div class="lg:col-span-5 relative">
          <span class="eyebrow eyebrow-light reveal-up">Rede Nacional</span>

          <!-- Número gigante de fundo + heading sobreposto -->
          <div class="relative mt-4">
            <div class="h-giant reveal-up" data-reveal-delay="100" style="color:#FFEB3B;opacity:0.18;line-height:0.85;letter-spacing:-0.05em;">200+</div>
            <h2 class="h-editorial absolute top-[32%] left-0 reveal-up" data-reveal-delay="200" style="color:#003A40;">
              Praias para descobrir,<br><span style="color:#0288D1;">num clique.</span>
            </h2>
          </div>

          <!-- 3 features -->
          <ul class="mt-10 space-y-4">
            <li class="flex items-start gap-4 reveal-up" data-reveal-delay="350">
              <span style="background:#003A40;color:#FFEB3B;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="locate-fixed" style="width:20px;height:20px;"></i></span>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#003A40;">Geolocalização</div>
                <div style="font-size:14px;color:#4B3F2A;line-height:1.5;">Encontre as praias mais próximas de si.</div>
              </div>
            </li>
            <li class="flex items-start gap-4 reveal-up" data-reveal-delay="450">
              <span style="background:#003A40;color:#FFEB3B;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="sliders-horizontal" style="width:20px;height:20px;"></i></span>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#003A40;">Filtros inteligentes</div>
                <div style="font-size:14px;color:#4B3F2A;line-height:1.5;">Por região, serviços, qualidade da água.</div>
              </div>
            </li>
            <li class="flex items-start gap-4 reveal-up" data-reveal-delay="550">
              <span style="background:#003A40;color:#FFEB3B;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="navigation" style="width:20px;height:20px;"></i></span>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#003A40;">Direções GPS</div>
                <div style="font-size:14px;color:#4B3F2A;line-height:1.5;">Abra o mapa e siga até à praia.</div>
              </div>
            </li>
          </ul>

          <a href="rede.html" class="inline-flex items-center gap-3 mt-10 bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full reveal-up" data-reveal-delay="650" style="box-shadow:0 14px 28px -10px rgba(0,58,64,0.45);">
            <i data-lucide="map" style="width:18px;height:18px;"></i>
            Explorar Mapa
          </a>
        </div>

        <!-- Coluna direita: mini-mapa isométrico -->
        <div class="lg:col-span-7 relative">
          <div class="card-3d-stage">
            <div id="mini-map" class="card-3d" data-iso="true" style="width:100%;height:520px;border-radius:24px;overflow:hidden;box-shadow:0 40px 80px -20px rgba(0,58,64,0.35);"></div>
          </div>
        </div>

      </div>
    </section>
```

- [ ] **Step 2: Verificar que o script da mini-map (linha ~880) ainda funciona**

O script existente (`document.getElementById('mini-map')`) já procura por esse ID. Não tocar. O contorno isométrico é aplicado via CSS na próxima task.

- [ ] **Step 3: Adicionar tilt isométrico ao `.card-3d[data-iso]`**

Editar o `<style>` do head de `index.html`, juntar este bloco às regras do redesign:

```css
    /* Mini-map isometric tilt (desktop only) */
    @media (min-width: 768px) {
      #mini-map[data-iso] {
        transform: perspective(1400px) rotateX(15deg) rotateY(-3deg);
        transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #mini-map[data-iso]:hover {
        transform: perspective(1400px) rotateX(8deg) rotateY(-2deg);
      }
    }
```

- [ ] **Step 4: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000`
Ler o PNG. Esperado: secção 2 visível com número "200+" amarelo desaturado, heading sobreposto, 3 features com ícones, CTA, mapa à direita inclinado isometricamente com markers amarelos.

Confirmar que `lucide.createIcons()` renderiza os ícones (já é chamado no fim do body, linha ~877). Se aparecerem `<i>` vazios, mover a chamada para depois do conteúdo ou re-invocar.

---

## Task 6: Secção 3 — Onde Encontrar o Guia

**Files:**
- Modify: `index.html` (`<section id="sec-guia">`)

**Conteúdo (spec §4.3):** dark, 2 colunas 50/50. Mockup do guia em 3D à esquerda, número "250+" + heading + CTA à direita.

- [ ] **Step 1: Substituir `<section id="sec-guia">` pelo conteúdo**

```html
    <section id="sec-guia" class="section section-dark section-pad" data-bg="dark">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-10 lg:gap-20 items-center">

        <!-- Mockup do guia em 3D -->
        <div class="relative card-3d-stage">
          <div class="card-3d reveal-up" data-tilt="true" style="transform:rotateY(-12deg) rotateX(4deg);transition:transform 0.6s cubic-bezier(0.34,1.56,0.64,1);">
            <!-- Capa do guia (placeholder dourado com sombra projectada gigante) -->
            <div style="background:linear-gradient(135deg,#FFEB3B 0%,#F5B800 100%);width:100%;aspect-ratio:3/4;border-radius:6px;position:relative;box-shadow:0 60px 100px -20px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.1);">
              <div style="position:absolute;inset:14px;border:2px solid rgba(0,58,64,0.2);border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;padding:30px;">
                <div>
                  <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:11px;letter-spacing:0.3em;color:#003A40;text-transform:uppercase;">Guia 2026</div>
                  <div style="font-family:'Poppins',sans-serif;font-weight:800;font-size:clamp(28px,4vw,52px);color:#003A40;line-height:0.95;margin-top:14px;letter-spacing:-0.02em;">Praias<br>Fluviais<br>de Portugal</div>
                </div>
                <div style="font-family:'Open Sans',sans-serif;font-size:12px;color:#003A40;opacity:0.8;">200+ Praias · Mapa · Roteiros</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Texto + CTA -->
        <div>
          <span class="eyebrow eyebrow-dark reveal-up">O Guia Físico</span>
          <div class="h-giant reveal-up" data-reveal-delay="100" data-counter="250" data-suffix="+" style="color:#FFEB3B;line-height:0.85;margin-top:8px;">250+</div>
          <h2 class="h-editorial reveal-up" data-reveal-delay="200" style="color:#fff;margin-top:8px;">
            Levante o seu Guia<br>em <span style="color:#FFEB3B;">250+ pontos</span>
          </h2>
          <p class="reveal-up" data-reveal-delay="300" style="margin-top:18px;color:rgba(255,255,255,0.7);font-size:16px;line-height:1.6;max-width:480px;">Quiosques · Hotéis · Postos de Turismo · Lojas Parceiras. Descubra o ponto mais próximo de si.</p>
          <a href="onde-encontrar-guia.html" class="inline-flex items-center gap-3 mt-8 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full reveal-up" data-reveal-delay="400" style="box-shadow:0 14px 28px -10px rgba(255,235,59,0.4);">
            <i data-lucide="book-open" style="width:18px;height:18px;"></i>
            Ver Pontos de Distribuição
          </a>
        </div>

      </div>
    </section>
```

- [ ] **Step 2: Confirmar que o counter "250+" entra no observer existente**

O counter script existente (`index.html` linha ~921) procura `[data-counter]` em todo o documento. Não é preciso alterar.

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000/#sec-guia`
Ler PNG. Esperado: fundo dark teal, guia amarelo inclinado à esquerda com sombra projectada, número "250+" gigante e heading "Levante o seu Guia em 250+ pontos" à direita, CTA amarelo.

---

## Task 7: Secção 4 — Praias da Semana

**Files:**
- Modify: `index.html` (`<section id="sec-semana">`, e novo bloco `<script>` no fim do body para popular cards)

**Conteúdo (spec §4.4):** light com foto full-bleed esbatida, heading "Esta semana", 3 cards escalonados (não-grid) ligados a `praia.html?id=...`, fonte `settings.homeFeaturedBeachIds`.

- [ ] **Step 1: Substituir `<section id="sec-semana">`**

```html
    <section id="sec-semana" class="section section-light section-pad" data-bg="light" style="position:relative;">
      <!-- Foto de fundo esbatida (preenche via JS depois de carregar a 1ª praia) -->
      <div id="sec-semana-bg" style="position:absolute;inset:0;background-position:center;background-size:cover;opacity:0.08;z-index:0;"></div>

      <div class="max-w-7xl mx-auto px-6 relative" style="z-index:1;">
        <div class="text-center mb-16">
          <span class="eyebrow eyebrow-light reveal-up">Esta Semana</span>
          <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#003A40;margin-top:10px;">
            Praias da<br>Semana.
          </h2>
          <p class="reveal-up" data-reveal-delay="200" style="margin-top:16px;color:#4B3F2A;font-size:15px;">Atualizam-se todas as segundas-feiras.</p>
        </div>

        <!-- Container dos 3 cards (preenchido via JS) -->
        <div id="sec-semana-cards" class="grid md:grid-cols-3 gap-8 md:gap-6 items-end card-3d-stage">
          <!-- skeleton placeholders -->
          <div class="skeleton w-full" style="height:480px;border-radius:20px;"></div>
          <div class="skeleton w-full" style="height:480px;border-radius:20px;"></div>
          <div class="skeleton w-full" style="height:480px;border-radius:20px;"></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Adicionar `<script>` para popular os cards**

No fim do body de `index.html`, antes do `</body>`, antes do bloco `<script src="js/auth.js">`, adicionar:

```html
  <!-- Praias da Semana — popula 3 cards a partir de settings.homeFeaturedBeachIds -->
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      const container = document.getElementById('sec-semana-cards');
      if (!container) return;
      try {
        const [settings, beaches] = await Promise.all([
          fetch('data/settings.json').then(r => r.json()),
          fetch('data/beaches.json').then(r => r.json()),
        ]);
        const ids = (settings.homeFeaturedBeachIds || []).slice(0, 3);
        const picks = ids.map(id => beaches.find(b => b.id === id)).filter(Boolean);
        if (!picks.length) {
          container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#8A7D60;">Sem praias seleccionadas.</p>';
          return;
        }
        // Foto de fundo da primeira praia
        const firstPhoto = picks[0]?.images?.[0];
        if (firstPhoto) {
          const bg = document.getElementById('sec-semana-bg');
          if (bg) bg.style.backgroundImage = `url('${firstPhoto}')`;
        }
        // Cards escalonados (offsets diferentes por posição)
        const offsets = ['translateY(20px)', 'translateY(-30px)', 'translateY(40px)'];
        container.innerHTML = picks.map((b, i) => {
          const photo = b.images?.[0] || 'img/placeholder-beach.jpg';
          const services = (b.services || []).slice(0, 3);
          return `
            <a href="praia.html?id=${encodeURIComponent(b.id)}" class="card-3d block reveal-up" data-tilt="true" data-reveal-delay="${i * 120}" style="transform:${offsets[i]};border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 28px 60px -20px rgba(0,58,64,0.25);text-decoration:none;color:inherit;">
              <div style="height:280px;background:url('${photo}') center/cover;position:relative;">
                <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(0,58,64,0.6) 100%);"></div>
                <span style="position:absolute;top:14px;left:14px;background:#FFEB3B;color:#003A40;font-family:'Poppins',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;padding:5px 10px;border-radius:99px;">Em destaque</span>
              </div>
              <div style="padding:22px;">
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:20px;color:#003A40;line-height:1.2;">${b.name || ''}</div>
                <div style="font-size:13px;color:#4B3F2A;margin-top:4px;">${b.county || ''} · ${b.region || ''}</div>
                <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;">
                  ${services.map(s => `<span style="background:#FAF8F5;color:#003A40;font-size:10px;font-weight:600;padding:4px 8px;border-radius:99px;border:1px solid #E2D9C6;">${s}</span>`).join('')}
                </div>
              </div>
            </a>
          `;
        }).join('');
        // Re-render lucide icons (caso algum tenha sido injectado, embora aqui não use)
        if (window.lucide) lucide.createIcons();
      } catch (err) {
        console.error('Erro ao carregar Praias da Semana:', err);
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#8A7D60;">Não foi possível carregar as praias da semana.</p>';
      }
    });
  </script>
```

> **Nota Tailwind CDN:** o card é injectado via JS e usa apenas `style=""` inline, conforme regra do CLAUDE.md. Apenas `class="card-3d"` é usada (definida em CSS estático).

- [ ] **Step 3: Verificar visualmente**

Refrescar `http://localhost:3000`. Esperado:
- 3 cards de praia visíveis com foto, nome, concelho/região, badge "Em destaque", chips de serviços.
- Cards escalonados verticalmente em desktop (não em linha perfeita).
- Foto de fundo da secção esbatida atrás (8% opacity).
- Em mobile (<768px), cards empilham em coluna sem offsets verticais.

Run: `node screenshot.mjs http://localhost:3000` para confirmar.

---

## Task 8: Secção 5 — Comunidade

**Files:**
- Modify: `index.html` (`<section id="sec-comunidade">`, novo `<script>` para ler `communityCount`)

**Conteúdo (spec §4.5):** dark, 2 colunas 45/55. Heading + texto + CTA à esquerda; stack de 3 mockups de review flutuantes à direita.

- [ ] **Step 1: Substituir `<section id="sec-comunidade">`**

```html
    <section id="sec-comunidade" class="section section-dark section-pad" data-bg="dark">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">

        <!-- Texto -->
        <div class="lg:col-span-5">
          <span class="eyebrow eyebrow-dark reveal-up">Comunidade</span>
          <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#fff;margin-top:10px;">
            A voz de quem<br><span style="color:#FFEB3B;">lá esteve.</span>
          </h2>
          <p class="reveal-up" data-reveal-delay="200" style="margin-top:18px;color:rgba(255,255,255,0.7);font-size:16px;line-height:1.6;max-width:480px;">Em cada página de praia pode escrever um comentário, dar estrelas, e ler avaliações de outros visitantes. A comunidade ajuda quem chega a seguir.</p>
          <a href="rede.html" class="inline-flex items-center gap-3 mt-8 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full reveal-up" data-reveal-delay="300">
            <i data-lucide="map-pinned" style="width:18px;height:18px;"></i>
            Explorar Praias
          </a>
          <p class="reveal-up" data-reveal-delay="400" style="margin-top:18px;color:rgba(255,255,255,0.5);font-size:13px;">Já <span id="community-count">1.200</span>+ avaliações partilhadas.</p>
        </div>

        <!-- Stack de 3 mockups -->
        <div class="lg:col-span-7 relative card-3d-stage" style="min-height:480px;">

          <!-- Card 1 (atrás) -->
          <div class="card-3d reveal-up" data-reveal-delay="200" style="position:absolute;top:0;left:6%;width:78%;background:#fff;border-radius:18px;padding:22px;box-shadow:0 30px 60px -20px rgba(0,0,0,0.5);transform:rotateY(-8deg) rotateX(4deg) translateZ(-40px);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#43A047,#0288D1);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:'Poppins',sans-serif;font-weight:700;">JP</div>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#003A40;">João P.</div>
                <div style="display:flex;gap:2px;margin-top:2px;" data-stars="5"></div>
              </div>
            </div>
            <p style="margin-top:12px;font-size:14px;color:#2D2820;line-height:1.5;">Praia limpa e com bom acesso. As crianças adoraram a zona rasa.</p>
            <div style="margin-top:10px;font-size:11px;color:#8A7D60;">Praia Fluvial de Avô · Jul 2025</div>
          </div>

          <!-- Card 2 (centro, mais à frente) -->
          <div class="card-3d reveal-up" data-reveal-delay="350" style="position:absolute;top:30%;right:0;width:78%;background:#fff;border-radius:18px;padding:22px;box-shadow:0 40px 80px -20px rgba(0,0,0,0.6);transform:rotateY(-4deg) translateZ(40px);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#FFEB3B,#F5B800);display:inline-flex;align-items:center;justify-content:center;color:#003A40;font-family:'Poppins',sans-serif;font-weight:700;">MS</div>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#003A40;">Maria S.</div>
                <div style="display:flex;gap:2px;margin-top:2px;" data-stars="5"></div>
              </div>
            </div>
            <p style="margin-top:12px;font-size:14px;color:#2D2820;line-height:1.5;">Água cristalina e pouca gente. Voltamos para o ano sem dúvida.</p>
            <div style="margin-top:10px;font-size:11px;color:#8A7D60;">Praia Fluvial de Loriga · Ago 2025</div>
          </div>

          <!-- Card 3 (à frente) -->
          <div class="card-3d reveal-up" data-reveal-delay="500" style="position:absolute;bottom:0;left:0;width:74%;background:#fff;border-radius:18px;padding:22px;box-shadow:0 50px 100px -20px rgba(0,0,0,0.7);transform:rotateY(6deg) rotateX(-2deg) translateZ(80px);">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#0288D1,#003A40);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:'Poppins',sans-serif;font-weight:700;">AC</div>
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#003A40;">Ana C.</div>
                <div style="display:flex;gap:2px;margin-top:2px;" data-stars="4"></div>
              </div>
            </div>
            <p style="margin-top:12px;font-size:14px;color:#2D2820;line-height:1.5;">Ambiente tranquilo, ideal para fugir ao calor da cidade. Recomendo o caminho a pé pela ribeira.</p>
            <div style="margin-top:10px;font-size:11px;color:#8A7D60;">Albufeira do Azibo · Set 2025</div>
          </div>

        </div>
      </div>
    </section>
```

- [ ] **Step 2: Adicionar script para popular estrelas + `communityCount`**

No mesmo `<script>` block do Praias da Semana, adicionar dentro do mesmo `DOMContentLoaded`:

```js
      // Estrelas dos mockups de Comunidade
      document.querySelectorAll('[data-stars]').forEach(el => {
        const n = parseInt(el.dataset.stars, 10) || 5;
        el.innerHTML = Array.from({ length: 5 }).map((_, i) => `
          <svg width="14" height="14" viewBox="0 0 24 24" style="fill:${i < n ? '#FFEB3B' : 'rgba(255,235,59,0.25)'};"><path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z"/></svg>
        `).join('');
      });

      // communityCount na secção Comunidade (reutiliza `settings` já fetched no bloco de Praias da Semana)
      const cCount = (settings.communityCount || 1200);
      const cEl = document.getElementById('community-count');
      if (cEl) cEl.textContent = cCount.toLocaleString('pt-PT');
```

> **Nota de implementação:** o `settings` já está no scope vindo do Promise.all do bloco de Praias da Semana (Task 7 Step 2). Não fazer um segundo `fetch` para o mesmo ficheiro.

- [ ] **Step 3: Verificar visualmente**

Run: `node screenshot.mjs http://localhost:3000/#sec-comunidade`
Esperado: à esquerda heading "A voz de quem lá esteve" com "lá esteve" amarelo, CTA em outline branco, número "1.200+"; à direita 3 cards de review brancos sobrepostos em diferentes profundidades z, com avatares coloridos e estrelas amarelas.

---

## Task 9: Secção 6 — Passaporte

**Files:**
- Modify: `index.html` (`<section id="sec-passaporte">`, e bloco GSAP scroll-driven na Task 16)

**Conteúdo (spec §4.6):** dark-deep, 2 colunas 50/50. Mockup 3D do passaporte que abre conforme scroll à esquerda; heading + bullets + CTA à direita.

- [ ] **Step 1: Substituir `<section id="sec-passaporte">`**

```html
    <section id="sec-passaporte" class="section section-dark-deep section-pad" data-bg="dark-deep">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

        <!-- Mockup 3D do passaporte -->
        <div class="relative card-3d-stage" style="min-height:480px;display:flex;align-items:center;justify-content:center;">
          <div id="passport-3d" class="card-3d" style="width:300px;height:420px;position:relative;transform-style:preserve-3d;transform:rotateY(0deg);">

            <!-- Capa (face frontal) -->
            <div style="position:absolute;inset:0;background:linear-gradient(135deg,#003A40 0%,#001f23 100%);border-radius:8px 4px 4px 8px;border:1px solid rgba(255,235,59,0.2);box-shadow:0 40px 80px -20px rgba(0,0,0,0.6);transform-origin:left center;backface-visibility:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:36px 28px;">
              <div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:10px;letter-spacing:0.3em;color:#FFEB3B;text-transform:uppercase;">Passaporte</div>
                <div style="font-family:'Poppins',sans-serif;font-weight:800;font-size:30px;color:#fff;line-height:1;margin-top:8px;">Praias<br>Fluviais</div>
              </div>
              <div style="text-align:center;">
                <div style="display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid #FFEB3B;color:#FFEB3B;">
                  <i data-lucide="stamp" style="width:36px;height:36px;"></i>
                </div>
                <div style="font-family:'Open Sans',sans-serif;font-size:11px;color:rgba(255,235,59,0.7);margin-top:14px;letter-spacing:0.2em;">VISITE · CARIMBE · COLECCIONE</div>
              </div>
            </div>

            <!-- Página interior (revela ao abrir) -->
            <div id="passport-page" style="position:absolute;inset:0;background:#FAF8F5;border-radius:4px 8px 8px 4px;transform-origin:left center;transform:rotateY(0deg);transition:transform 0.6s ease;padding:30px;display:flex;flex-direction:column;gap:14px;">
              <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:11px;color:#003A40;letter-spacing:0.2em;text-transform:uppercase;">Os meus carimbos</div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;flex:1;">
                <!-- 6 carimbos placeholder -->
                <div data-stamp="0" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">LORIGA</div>
                <div data-stamp="1" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">AVÔ</div>
                <div data-stamp="2" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">AZIBO</div>
                <div data-stamp="3" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">GERÊS</div>
                <div data-stamp="4" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">CARRIÇA</div>
                <div data-stamp="5" style="aspect-ratio:1;border:2px dashed rgba(0,58,64,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(0,58,64,0.3);font-size:10px;text-align:center;line-height:1.2;font-family:'Poppins',sans-serif;font-weight:700;">UCHA</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Texto + CTA -->
        <div>
          <span class="eyebrow eyebrow-dark reveal-up">Passaporte Digital</span>
          <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#fff;margin-top:10px;">
            Coleccione<br><span style="color:#FFEB3B;">carimbos.</span>
          </h2>
          <ul style="margin-top:24px;display:flex;flex-direction:column;gap:14px;">
            <li class="reveal-up" data-reveal-delay="200" style="display:flex;gap:14px;align-items:flex-start;color:rgba(255,255,255,0.85);font-size:15px;">
              <i data-lucide="map-pin" style="width:20px;height:20px;color:#FFEB3B;flex-shrink:0;margin-top:3px;"></i> 200+ praias para visitar.
            </li>
            <li class="reveal-up" data-reveal-delay="280" style="display:flex;gap:14px;align-items:flex-start;color:rgba(255,255,255,0.85);font-size:15px;">
              <i data-lucide="stamp" style="width:20px;height:20px;color:#FFEB3B;flex-shrink:0;margin-top:3px;"></i> Carimbo digital + físico em cada visita.
            </li>
            <li class="reveal-up" data-reveal-delay="360" style="display:flex;gap:14px;align-items:flex-start;color:rgba(255,255,255,0.85);font-size:15px;">
              <i data-lucide="award" style="width:20px;height:20px;color:#FFEB3B;flex-shrink:0;margin-top:3px;"></i> Badges de conquista por região.
            </li>
          </ul>
          <a href="passaporte.html" class="inline-flex items-center gap-3 mt-10 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full reveal-up" data-reveal-delay="450" style="box-shadow:0 14px 28px -10px rgba(255,235,59,0.4);">
            <i data-lucide="arrow-right" style="width:18px;height:18px;"></i>
            O Meu Passaporte
          </a>
        </div>

      </div>
    </section>
```

- [ ] **Step 2: Verificar visualmente (sem animação ainda — animação vai ser adicionada na Task 16)**

Refrescar e tirar screenshot. Esperado: passaporte fechado (capa preta com "Passaporte / Praias Fluviais" e ícone stamp amarelo) à esquerda; heading "Coleccione carimbos" com 3 bullets e CTA amarelo à direita.

---

## Task 10: Secção 7 — Onde Carimbar Passaporte

**Files:**
- Modify: `index.html` (`<section id="sec-carimbar">`)

**Conteúdo (spec §4.7):** light, layout invertido (texto à esquerda, ilustração à direita). Carimbo a ser aplicado em 3D com loop subtil.

- [ ] **Step 1: Substituir `<section id="sec-carimbar">`**

```html
    <section id="sec-carimbar" class="section section-light section-pad" data-bg="light">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

        <!-- Texto -->
        <div>
          <span class="eyebrow eyebrow-light reveal-up">Pontos de Carimbo</span>
          <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#003A40;margin-top:10px;">
            Carimbe nas<br>próprias praias e<br><span style="color:#0288D1;">em parceiros.</span>
          </h2>
          <p class="reveal-up" data-reveal-delay="200" style="margin-top:18px;color:#4B3F2A;font-size:16px;line-height:1.6;max-width:480px;">Bares · Cafés · Postos de Turismo nas zonas balneares. Encontre o ponto mais próximo e leve o seu passaporte para casa cheio de memórias.</p>
          <a href="onde-encontrar-passaporte.html" class="inline-flex items-center gap-3 mt-8 bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-full reveal-up" data-reveal-delay="300" style="box-shadow:0 14px 28px -10px rgba(0,58,64,0.45);">
            <i data-lucide="stamp" style="width:18px;height:18px;"></i>
            Ver Pontos de Carimbo
          </a>
        </div>

        <!-- Ilustração 3D do carimbo -->
        <div class="relative card-3d-stage" style="min-height:380px;display:flex;align-items:center;justify-content:center;">
          <!-- Papel base com marca de carimbo -->
          <div style="width:300px;height:380px;background:#FAF8F5;border:1px solid #E2D9C6;border-radius:8px;position:relative;box-shadow:0 30px 60px -20px rgba(0,58,64,0.2);">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">
              <!-- Marca circular do carimbo (tinta) -->
              <div style="width:140px;height:140px;border-radius:50%;border:4px solid #FFEB3B;display:flex;align-items:center;justify-content:center;background:rgba(255,235,59,0.1);">
                <div style="text-align:center;font-family:'Poppins',sans-serif;color:#003A40;">
                  <div style="font-size:9px;font-weight:700;letter-spacing:0.3em;">PRAIA FLUVIAL</div>
                  <div style="font-size:18px;font-weight:800;margin-top:4px;">LORIGA</div>
                  <div style="font-size:9px;font-weight:700;letter-spacing:0.3em;margin-top:4px;">2026</div>
                </div>
              </div>
            </div>
            <!-- Carimbo físico em ângulo (loop subtil) -->
            <div id="stamp-anim" class="card-3d" style="position:absolute;top:-20px;right:-20px;width:120px;height:160px;transform:rotate(8deg) rotateY(-15deg);">
              <div style="width:100%;height:60%;background:#003A40;border-radius:8px 8px 4px 4px;position:relative;box-shadow:0 20px 40px -10px rgba(0,0,0,0.5);">
                <div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:80%;height:18px;background:#FFEB3B;border-radius:0 0 4px 4px;border:2px solid #003A40;border-top:none;"></div>
              </div>
              <div style="width:60%;height:14px;background:#003A40;margin:8px auto 0;border-radius:0 0 6px 6px;"></div>
            </div>
          </div>
        </div>

      </div>
    </section>
```

- [ ] **Step 2: Adicionar CSS para loop subtil do carimbo**

No `<style>` de `index.html`, juntar:

```css
    @keyframes stamp-bounce {
      0%, 100% { transform: rotate(8deg) rotateY(-15deg) translateY(0); }
      40%      { transform: rotate(8deg) rotateY(-15deg) translateY(-12px); }
      55%      { transform: rotate(8deg) rotateY(-15deg) translateY(0); }
    }
    @media (prefers-reduced-motion: no-preference) {
      #stamp-anim { animation: stamp-bounce 4s ease-in-out infinite; }
    }
```

- [ ] **Step 3: Verificar visualmente**

Esperado: à esquerda heading + CTA; à direita papel com marca circular amarela "Praia Fluvial Loriga 2026" e carimbo físico em ângulo no canto superior direito a fazer bounce loop subtil.

---

## Task 11: Secção 8 — Praia do Ano 2026

**Files:**
- Modify: `index.html` (`<section id="sec-ano">`, novo script para timeline)

**Conteúdo (spec §4.8):** dark, hero-like centrado. Pill amarela + heading gigante + CTA + timeline horizontal de vencedores.

- [ ] **Step 1: Substituir `<section id="sec-ano">`**

```html
    <section id="sec-ano" class="section section-dark section-pad" data-bg="dark">
      <div class="max-w-7xl mx-auto px-6 text-center">
        <div class="reveal-up inline-flex items-center gap-2 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-full" style="box-shadow:0 14px 28px -10px rgba(255,235,59,0.4);">
          <i data-lucide="trophy" style="width:14px;height:14px;"></i> Galardão Anual
        </div>
        <h2 class="h-editorial reveal-up mt-6" data-reveal-delay="100" style="color:#fff;font-size:clamp(48px,8vw,120px);">
          Vote a Praia<br><span style="color:#FFEB3B;">Fluvial do Ano.</span>
        </h2>
        <p class="reveal-up" data-reveal-delay="200" style="margin-top:18px;color:rgba(255,255,255,0.7);font-size:16px;line-height:1.6;max-width:540px;margin-left:auto;margin-right:auto;">Vencedor anunciado a 15 Novembro. Vote até 31 Outubro 2026.</p>
        <a href="votar.html" class="inline-flex items-center gap-3 mt-8 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-10 py-4 rounded-full reveal-up" data-reveal-delay="300" style="box-shadow:0 14px 28px -10px rgba(255,235,59,0.4);">
          <i data-lucide="vote" style="width:18px;height:18px;"></i>
          Votar Agora
        </a>

        <!-- Timeline horizontal de vencedores -->
        <div class="mt-20 reveal-up" data-reveal-delay="400">
          <div style="position:relative;max-width:1100px;margin:0 auto;">
            <!-- Linha horizontal -->
            <svg id="ano-timeline-line" viewBox="0 0 1100 4" preserveAspectRatio="none" style="position:absolute;top:14px;left:0;width:100%;height:4px;">
              <line x1="0" y1="2" x2="1100" y2="2" stroke="#FFEB3B" stroke-width="2" stroke-dasharray="1100" stroke-dashoffset="1100" />
            </svg>

            <!-- 4 entradas -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;position:relative;">
              <div class="reveal-up" data-reveal-delay="500" style="text-align:center;">
                <div style="width:32px;height:32px;border-radius:50%;background:#FFEB3B;border:4px solid #003A40;margin:0 auto;"></div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.2em;color:#FFEB3B;text-transform:uppercase;margin-top:14px;">2025</div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:#fff;margin-top:6px;">Carriça</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:2px;">Oliveira de Frades</div>
              </div>
              <div class="reveal-up" data-reveal-delay="600" style="text-align:center;">
                <div style="width:32px;height:32px;border-radius:50%;background:#FFEB3B;border:4px solid #003A40;margin:0 auto;"></div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.2em;color:#FFEB3B;text-transform:uppercase;margin-top:14px;">2024</div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:#fff;margin-top:6px;">Avô</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:2px;">Oliveira do Hospital</div>
              </div>
              <div class="reveal-up" data-reveal-delay="700" style="text-align:center;">
                <div style="width:32px;height:32px;border-radius:50%;background:#FFEB3B;border:4px solid #003A40;margin:0 auto;"></div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.2em;color:#FFEB3B;text-transform:uppercase;margin-top:14px;">2023</div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:#fff;margin-top:6px;">Vimieiro</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:2px;">Penacova</div>
              </div>
              <div class="reveal-up" data-reveal-delay="800" style="text-align:center;">
                <div style="width:32px;height:32px;border-radius:50%;background:#0288D1;border:4px solid #003A40;margin:0 auto;"></div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:0.2em;color:#0288D1;text-transform:uppercase;margin-top:14px;">2024 · Revelação Norte</div>
                <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:#fff;margin-top:6px;">Cavadinho</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:2px;">Braga</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
```

- [ ] **Step 2: Verificar visualmente (animação da linha vai entrar na Task 16)**

Esperado: pill amarela com troféu, heading gigante centrado "Vote a Praia Fluvial do Ano", CTA, e timeline com 4 círculos amarelos (3 amarelos + 1 azul para Revelação) e info por baixo.

---

## Task 12: Secção 9 — Loja

**Files:**
- Modify: `index.html` (`<section id="sec-loja">`, script para popular cards)

**Conteúdo (spec §4.9):** light, heading + 4 cards de produto horizontais.

- [ ] **Step 1: Substituir `<section id="sec-loja">`**

```html
    <section id="sec-loja" class="section section-light section-pad" data-bg="light">
      <div class="max-w-7xl mx-auto px-6">
        <div class="flex items-end justify-between mb-12 gap-6 flex-wrap">
          <div>
            <span class="eyebrow eyebrow-light reveal-up">Loja</span>
            <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#003A40;margin-top:10px;">
              Leve o Guia<br><span style="color:#0288D1;">consigo.</span>
            </h2>
          </div>
          <a href="loja.html" class="inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider hover:text-praia-yellow-600 reveal-up" data-reveal-delay="200">
            Ver Loja Completa <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
          </a>
        </div>

        <div id="sec-loja-cards" class="grid grid-cols-2 md:grid-cols-4 gap-5 card-3d-stage">
          <div class="skeleton" style="height:340px;border-radius:16px;"></div>
          <div class="skeleton" style="height:340px;border-radius:16px;"></div>
          <div class="skeleton" style="height:340px;border-radius:16px;"></div>
          <div class="skeleton" style="height:340px;border-radius:16px;"></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Adicionar bloco de popular cards no script da Task 7**

Dentro do mesmo `DOMContentLoaded` async function (a seguir aos cards de Comunidade), adicionar:

```js
      // Loja
      const lojaContainer = document.getElementById('sec-loja-cards');
      if (lojaContainer) {
        try {
          const products = await fetch('data/products.json').then(r => r.json());
          const featured = products.filter(p => p.featured);
          const picks = (featured.length >= 4 ? featured : products).slice(0, 4);
          if (!picks.length) {
            lojaContainer.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#8A7D60;">Sem produtos disponíveis.</p>';
          } else {
            lojaContainer.innerHTML = picks.map((p, i) => {
              const photo = p.images?.[0] || p.image || 'img/placeholder-product.jpg';
              const priceCents = p.price || 0;
              const priceEur = (priceCents / 100).toFixed(2).replace('.', ',') + ' €';
              const badge = p.bestseller ? 'Bestseller' : (p.isNew ? 'Novo' : '');
              return `
                <a href="produto.html?id=${encodeURIComponent(p.id)}" class="card-3d block reveal-up" data-tilt="true" data-reveal-delay="${i * 100}" style="border-radius:16px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;border:1px solid #E2D9C6;">
                  <div style="aspect-ratio:1;background:url('${photo}') center/cover #FAF8F5;position:relative;">
                    ${badge ? `<span style="position:absolute;top:10px;left:10px;background:#FFEB3B;color:#003A40;font-family:'Poppins',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;padding:4px 8px;border-radius:99px;">${badge}</span>` : ''}
                  </div>
                  <div style="padding:14px;">
                    <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#003A40;line-height:1.3;">${p.name || ''}</div>
                    <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:16px;color:#003A40;margin-top:6px;">${priceEur}</div>
                  </div>
                </a>
              `;
            }).join('');
          }
        } catch (err) {
          console.error('Erro a carregar Loja:', err);
        }
      }
```

- [ ] **Step 3: Verificar visualmente**

Esperado: 4 cards de produto com foto quadrada, nome, preço em €, badge "Bestseller"/"Novo" se aplicável. Cada card é link para `produto.html?id=...`.

---

## Task 13: Secção 10 — Artigos

**Files:**
- Modify: `index.html` (`<section id="sec-artigos">`, script para popular cards)

**Conteúdo (spec §4.10):** light com faixa amarela horizontal no topo. Heading "Histórias do Interior" + carrossel de 5 cards de artigos.

- [ ] **Step 1: Substituir `<section id="sec-artigos">`**

```html
    <section id="sec-artigos" class="section section-light section-pad" data-bg="light" style="position:relative;">
      <!-- Faixa amarela horizontal de fundo do header -->
      <div style="position:absolute;top:0;left:0;right:0;height:60%;background:linear-gradient(180deg,rgba(255,235,59,0.12) 0%,transparent 100%);"></div>

      <div class="max-w-7xl mx-auto px-6 relative">
        <div class="flex items-end justify-between mb-12 gap-6 flex-wrap">
          <div>
            <span class="eyebrow eyebrow-light reveal-up">Novidades</span>
            <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#003A40;margin-top:10px;">
              Histórias do<br><span style="color:#0288D1;">Interior.</span>
            </h2>
          </div>
          <a href="artigos.html" class="inline-flex items-center gap-2 text-praia-teal-700 font-display text-sm font-semibold uppercase tracking-wider hover:text-praia-yellow-600 reveal-up" data-reveal-delay="200">
            Ver Todos <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
          </a>
        </div>

        <!-- Carrossel horizontal -->
        <div id="sec-artigos-cards" class="cards-scroll flex gap-6 overflow-x-auto pb-6" style="scroll-snap-type:x mandatory;">
          <div class="skeleton" style="min-width:340px;height:380px;border-radius:16px;flex-shrink:0;"></div>
          <div class="skeleton" style="min-width:340px;height:380px;border-radius:16px;flex-shrink:0;"></div>
          <div class="skeleton" style="min-width:340px;height:380px;border-radius:16px;flex-shrink:0;"></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Adicionar bloco de popular cards no script existente**

Dentro do mesmo `DOMContentLoaded`, a seguir ao bloco da Loja, adicionar:

```js
      // Artigos
      const artContainer = document.getElementById('sec-artigos-cards');
      if (artContainer) {
        try {
          const articles = await fetch('data/articles.json').then(r => r.json());
          const published = articles
            .filter(a => a.estado === 'publicado' || a.status === 'published' || !a.estado)
            .sort((a, b) => new Date(b.date || b.data || 0) - new Date(a.date || a.data || 0))
            .slice(0, 5);
          if (!published.length) {
            artContainer.innerHTML = '<p style="text-align:center;color:#8A7D60;width:100%;">Sem artigos publicados.</p>';
          } else {
            artContainer.innerHTML = published.map((a, i) => {
              const photo = a.image || a.cover || 'img/placeholder-article.jpg';
              const excerpt = (a.excerpt || a.descricao || '').slice(0, 120);
              const dateStr = a.date || a.data || '';
              const badge = i === 0 ? 'Destaque' : (a.novo ? 'Novo' : '');
              return `
                <a href="artigo.html?slug=${encodeURIComponent(a.slug)}" class="block reveal-up" data-reveal-delay="${i * 80}" style="min-width:340px;max-width:340px;flex-shrink:0;scroll-snap-align:start;border-radius:16px;overflow:hidden;background:#fff;border:1px solid #E2D9C6;text-decoration:none;color:inherit;">
                  <div style="aspect-ratio:16/10;background:url('${photo}') center/cover #FAF8F5;position:relative;">
                    ${badge ? `<span style="position:absolute;top:10px;left:10px;background:#003A40;color:#FFEB3B;font-family:'Poppins',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;padding:4px 8px;border-radius:99px;">${badge}</span>` : ''}
                  </div>
                  <div style="padding:18px;">
                    <div style="font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:#003A40;line-height:1.3;">${a.title || ''}</div>
                    <div style="font-size:13px;color:#4B3F2A;margin-top:6px;line-height:1.5;">${excerpt}${excerpt.length === 120 ? '…' : ''}</div>
                    ${dateStr ? `<div style="font-size:11px;color:#8A7D60;margin-top:10px;font-family:'Poppins',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">${dateStr}</div>` : ''}
                  </div>
                </a>
              `;
            }).join('');
          }
        } catch (err) {
          console.error('Erro a carregar Artigos:', err);
        }
      }
```

- [ ] **Step 3: Verificar visualmente**

Esperado: faixa amarela ténue no topo da secção. Heading "Histórias do Interior" com "Interior" azul. 5 cards horizontais com snap-scroll, primeiro com badge "Destaque".

---

## Task 14: Secção 11 — Descontos

**Files:**
- Modify: `index.html` (`<section id="sec-descontos">`)

**Conteúdo (spec §4.11):** yellow, número gigante "+250 descontos" + 6 logos placeholder + CTA.

- [ ] **Step 1: Substituir `<section id="sec-descontos">`**

```html
    <section id="sec-descontos" class="section section-yellow section-pad" data-bg="yellow" style="position:relative;">
      <!-- Pattern de tickets diagonais -->
      <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(135deg,rgba(0,58,64,0.04) 0,rgba(0,58,64,0.04) 1px,transparent 1px,transparent 32px);pointer-events:none;"></div>

      <div class="max-w-7xl mx-auto px-6 text-center relative">
        <span class="eyebrow eyebrow-light reveal-up" style="color:#003A40;">Vantagens</span>
        <div class="h-giant reveal-up" data-reveal-delay="100" data-counter="250" data-prefix="+" style="color:#003A40;line-height:0.85;margin-top:8px;">+250</div>
        <h2 class="h-editorial reveal-up" data-reveal-delay="200" style="color:#003A40;margin-top:6px;">
          descontos por todo o país.
        </h2>
        <p class="reveal-up" data-reveal-delay="300" style="margin-top:14px;color:#003A40;opacity:0.75;font-size:16px;">Apresentando o Guia ou o Passaporte.</p>

        <!-- Grid de 6 logos placeholder -->
        <div class="grid grid-cols-3 md:grid-cols-6 gap-6 mt-14">
          <div class="reveal-up" data-reveal-delay="400" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 1</div>
          <div class="reveal-up" data-reveal-delay="450" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 2</div>
          <div class="reveal-up" data-reveal-delay="500" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 3</div>
          <div class="reveal-up" data-reveal-delay="550" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 4</div>
          <div class="reveal-up" data-reveal-delay="600" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 5</div>
          <div class="reveal-up" data-reveal-delay="650" style="aspect-ratio:1;background:#003A40;border-radius:14px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:#FFEB3B;">LOGO 6</div>
        </div>

        <a href="descontos.html" class="inline-flex items-center gap-3 mt-14 bg-praia-teal-800 text-praia-yellow-400 font-display font-bold text-sm uppercase tracking-wider px-10 py-4 rounded-full reveal-up" data-reveal-delay="700" style="box-shadow:0 14px 28px -10px rgba(0,58,64,0.45);">
          <i data-lucide="ticket-percent" style="width:18px;height:18px;"></i>
          Ver Todos os Descontos
        </a>
      </div>
    </section>
```

> **Nota:** os 6 placeholders escuros com texto "LOGO N" são propositais. Quando houver assets reais, substituir cada `<div>` por `<img src="img/partners/parceiro-1.png" alt="..." style="aspect-ratio:1;object-fit:contain;...">`.

- [ ] **Step 2: Verificar visualmente**

Esperado: fundo amarelo com pattern diagonal subtil. Número "+250" gigante teal + heading "descontos por todo o país". Grid de 6 placeholders escuros com "LOGO 1"–"LOGO 6" em amarelo. CTA teal.

---

## Task 15: Secção 12 — Contactos + Newsletter

**Files:**
- Modify: `index.html` (`<section id="sec-contactos">`)

**Conteúdo (spec §4.12):** dark-deep, centrado. CTA Contactos + 2 ícones gigantes + newsletter.

- [ ] **Step 1: Substituir `<section id="sec-contactos">`**

```html
    <section id="sec-contactos" class="section section-dark-deep section-pad" data-bg="dark-deep">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <span class="eyebrow eyebrow-dark reveal-up">Falar Connosco</span>
        <h2 class="h-editorial reveal-up" data-reveal-delay="100" style="color:#fff;margin-top:10px;">
          Estamos a um<br><span style="color:#FFEB3B;">clique.</span>
        </h2>
        <a href="contactos.html" class="inline-flex items-center gap-3 mt-8 bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-10 py-4 rounded-full reveal-up" data-reveal-delay="200" style="box-shadow:0 14px 28px -10px rgba(255,235,59,0.4);">
          <i data-lucide="mail" style="width:18px;height:18px;"></i>
          Ir para Contactos
        </a>

        <div class="reveal-up mt-16" data-reveal-delay="300" style="display:flex;align-items:center;gap:18px;justify-content:center;">
          <div style="height:1px;flex:1;background:rgba(255,255,255,0.15);max-width:80px;"></div>
          <span style="font-family:'Poppins',sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.5);">ou siga-nos</span>
          <div style="height:1px;flex:1;background:rgba(255,255,255,0.15);max-width:80px;"></div>
        </div>

        <div class="flex justify-center gap-6 mt-8">
          <a href="https://www.facebook.com/praiasfluviais" target="_blank" rel="noopener" aria-label="Facebook" class="social-breath reveal-up" data-reveal-delay="350" style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);display:inline-flex;align-items:center;justify-content:center;color:#fff;transition:all 0.3s ease;">
            <svg style="width:28px;height:28px;" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </a>
          <a href="https://www.instagram.com/guiadaspraiasfluviais" target="_blank" rel="noopener" aria-label="Instagram" class="social-breath reveal-up" data-reveal-delay="450" style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);display:inline-flex;align-items:center;justify-content:center;color:#fff;transition:all 0.3s ease;">
            <svg style="width:28px;height:28px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </a>
        </div>

        <!-- Newsletter -->
        <div class="reveal-up mt-16" data-reveal-delay="550">
          <div style="font-family:'Poppins',sans-serif;font-weight:600;font-size:14px;color:rgba(255,255,255,0.7);">Receba a nossa newsletter mensal</div>
          <form id="hp-newsletter-form" style="display:flex;gap:8px;max-width:460px;margin:14px auto 0;">
            <input type="email" required placeholder="O seu email" style="flex:1;padding:14px 18px;border-radius:99px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;font-family:'Open Sans',sans-serif;font-size:14px;" class="input-glow">
            <button type="submit" class="bg-praia-yellow-400 text-praia-teal-800 font-display font-bold text-sm uppercase tracking-wider px-6 rounded-full" style="white-space:nowrap;">Subscrever</button>
          </form>
          <div id="hp-newsletter-msg" style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.6);"></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Adicionar CSS para breathing dos ícones de redes sociais**

No `<style>`:

```css
    @keyframes social-breath {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(255,235,59,0); }
      50%      { transform: scale(1.04); box-shadow: 0 0 24px rgba(255,235,59,0.15); }
    }
    @media (prefers-reduced-motion: no-preference) {
      .social-breath { animation: social-breath 4s ease-in-out infinite; }
    }
    .social-breath:hover { background: #FFEB3B !important; color: #003A40 !important; }
    .social-breath:hover svg { color: #003A40; }
```

- [ ] **Step 3: Wire básico do form de newsletter (placeholder local — não envia para serviço)**

No script existente (mesmo `DOMContentLoaded`), adicionar:

```js
      const nlForm = document.getElementById('hp-newsletter-form');
      if (nlForm) {
        nlForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const msg = document.getElementById('hp-newsletter-msg');
          if (msg) {
            msg.textContent = 'Obrigado! Em breve receberá a nossa newsletter.';
            msg.style.color = '#FFEB3B';
          }
          nlForm.reset();
        });
      }
```

> A integração real com Supabase/Mailchimp fica fora do âmbito desta task — esta é só feedback visual ao utilizador.

- [ ] **Step 4: Verificar visualmente**

Esperado: fundo dark-deep. Eyebrow "Falar Connosco", heading "Estamos a um clique" com "clique" amarelo, CTA amarelo grande, divisor "ou siga-nos", 2 ícones circulares gigantes a fazer breathing, form de newsletter.

---

## Task 16: Sistema global de animações GSAP

**Files:**
- Modify: `index.html` (novo `<script>` no fim do body, antes de `js/auth.js`)

**Conteúdo:** sistema universal de reveal-up, mouse-tilt em cards `[data-tilt]`, scroll-driven do passaporte, scroll-driven da timeline da Praia do Ano.

- [ ] **Step 1: Adicionar bloco script GSAP no fim do body**

Em `index.html`, antes de `<script src="js/auth.js"></script>`, adicionar:

```html
  <!-- GSAP scroll-driven animations da homepage -->
  <script>
    (function () {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
        console.warn('GSAP ou ScrollTrigger não carregados');
        return;
      }
      gsap.registerPlugin(ScrollTrigger);

      // ── 1. Reveal universal de elementos com .reveal-up ──
      document.querySelectorAll('.reveal-up').forEach(el => {
        const delay = parseInt(el.dataset.revealDelay || '0', 10);
        gsap.fromTo(el,
          { opacity: 0, y: 28 },
          {
            opacity: 1, y: 0, duration: 0.85,
            delay: delay / 1000,
            ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
          }
        );
      });

      // ── 2. Tilt 3D mouse-tracked em cards [data-tilt] (desktop only) ──
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        document.querySelectorAll('[data-tilt]').forEach(card => {
          const max = 8; // graus
          card.addEventListener('mousemove', (e) => {
            const r = card.getBoundingClientRect();
            const cx = (e.clientX - r.left) / r.width - 0.5;
            const cy = (e.clientY - r.top) / r.height - 0.5;
            card.style.transform = `rotateY(${cx * max}deg) rotateX(${-cy * max}deg)`;
          });
          card.addEventListener('mouseleave', () => {
            card.style.transform = '';
          });
        });
      }

      // ── 3. Passaporte que abre conforme scroll ──
      const passportPage = document.getElementById('passport-page');
      if (passportPage && isDesktop) {
        gsap.to(passportPage, {
          rotateY: -160,
          ease: 'none',
          scrollTrigger: {
            trigger: '#sec-passaporte',
            start: 'top 60%',
            end: 'bottom 40%',
            scrub: 1,
          }
        });
        // Carimbos a aparecer um a um
        document.querySelectorAll('#sec-passaporte [data-stamp]').forEach((stamp, i) => {
          gsap.fromTo(stamp,
            { scale: 0, rotate: -10, borderColor: 'rgba(0,58,64,0.2)', color: 'rgba(0,58,64,0.3)' },
            {
              scale: 1, rotate: 0, borderColor: '#FFEB3B', color: '#003A40',
              duration: 0.5, delay: 0.1 * i, ease: 'back.out(2)',
              scrollTrigger: { trigger: '#sec-passaporte', start: 'top 30%', toggleActions: 'play none none none' }
            }
          );
        });
      }

      // ── 4. Timeline da Praia do Ano (linha + entradas) ──
      const lineEl = document.querySelector('#ano-timeline-line line');
      if (lineEl) {
        gsap.to(lineEl, {
          strokeDashoffset: 0,
          ease: 'power2.out',
          duration: 1.5,
          scrollTrigger: { trigger: '#sec-ano', start: 'top 60%', toggleActions: 'play none none none' }
        });
      }

      // ── 5. Parallax leve em backgrounds ──
      document.querySelectorAll('[data-parallax]').forEach(el => {
        gsap.to(el, {
          yPercent: -15,
          ease: 'none',
          scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });

    })();
  </script>
```

- [ ] **Step 2: Verificar que GSAP + ScrollTrigger estão carregados no head**

Confirmar que estas duas linhas existem no `<head>` do `index.html` (já existiam no estado anterior):

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
```

Se faltarem, restaurar.

- [ ] **Step 3: Verificar funcionalmente no browser**

Refrescar `http://localhost:3000`. Abrir DevTools console.
- Esperado: 0 erros relacionados com GSAP/ScrollTrigger.
- Scroll lento da Hero até ao fim. Cada bloco de texto/card faz fade+slide ao entrar.
- Passar o rato sobre cards de Praias da Semana e Loja: tilt 3D suave.
- Ao chegar à secção Passaporte, scroll lento — a página interior deve abrir conforme se faz scroll.
- Ao chegar à Praia do Ano, a linha amarela horizontal desenha-se da esquerda para a direita.

Run: `node screenshot.mjs http://localhost:3000` em vários pontos para registar o estado.

---

## Task 17: Mobile + reduced-motion polish

**Files:**
- Modify: `index.html` (CSS, eventuais ajustes de layout)

- [ ] **Step 1: Testar em viewport mobile**

Run: `node screenshot.mjs http://localhost:3000 --width=375 --height=812` (ou usar opções do `screenshot.mjs` — verificar argumentos suportados primeiro com `node screenshot.mjs --help` se existir).

Se não suportar argumentos, abrir Chrome DevTools, ativar mobile (375x812 iPhone) e tirar screenshot manual.

Verificar:
- Cada secção em coluna única.
- Sem overflow horizontal (scroll lateral inexistente).
- Tipografia gigante reduz proporcionalmente (clamp deve cobrir).
- Cards de Praias da Semana empilhados sem `translateY` offsets escalonados (CSS `transform: none !important` em mobile da Task 4 trata disto).
- Stack de Comunidade não usa absolute positioning em mobile (cards empilhados normais).

- [ ] **Step 2: Ajustar Comunidade para mobile**

A Task 8 usa `position:absolute` para os 3 cards. Em mobile isto quebra. Adicionar override CSS no `<style>`:

```css
    @media (max-width: 767px) {
      #sec-comunidade .card-3d-stage {
        min-height: auto !important;
      }
      #sec-comunidade .card-3d-stage > div {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        width: 100% !important;
        margin-bottom: 14px;
        transform: none !important;
      }
    }
```

- [ ] **Step 3: Ajustar Praias da Semana para mobile (sem offsets escalonados)**

Adicionar:

```css
    @media (max-width: 767px) {
      #sec-semana-cards .card-3d {
        transform: none !important;
      }
    }
```

(Cobre o `style="transform:translateY(...)"` inline aplicado pelos cards.)

- [ ] **Step 4: Testar `prefers-reduced-motion`**

Em DevTools: `Rendering > Emulate CSS prefers-reduced-motion: reduce`. Refrescar.
- Esperado: tudo aparece com opacity 1 (sem fade), sem transforms, sem parallax, sem breathing dos ícones, sem stamp bounce, sem passport scroll.
- O early return em `gsap.matchMedia` (Task 16, Step 1, linha `if (window.matchMedia(...).matches) return;`) trata isto. Confirmar que funciona.

- [ ] **Step 5: Verificação final mobile**

Tirar screenshot mobile da página completa (multi-screen scroll). Confirmar que cada secção fica legível, sem layout shifts e sem overflow horizontal.

---

## Task 18: Verificação final

**Files:** nenhum (só verificação)

- [ ] **Step 1: Sincronização com header**

Abrir o site. Confirmar que os links do header continuam a apontar para as páginas certas (`rede.html`, `passaporte.html`, etc.) — não deve ter sido tocado mas verificar.

- [ ] **Step 2: Counter "200+" no hero ainda funciona**

Recarregar. Esperado: stats no hero contam de 0 a valor final como antes.

- [ ] **Step 3: Counter "250+" e "+250" nas novas secções**

Os novos `[data-counter]` devem ser apanhados pelo observer existente (linhas ~921-974 do `index.html`).
Se NÃO funcionarem (continuam estáticos), há que adicionar uma chamada manual no DOMContentLoaded depois do conteúdo ser injectado. **Mitigação:** o script existente inicia já no `DOMContentLoaded`, mas os novos `data-counter` em HTML estático já lá estão na altura — deve funcionar. Se não, criar issue futuro.

- [ ] **Step 4: Lighthouse rápido**

Abrir DevTools > Lighthouse > Run. Categoria: Performance + Accessibility.
- Esperado: ambas ≥ 80 (objectivo ≥90 mas 80 é aceitável para v1 com 12 secções e GSAP).
- Se Performance < 70, investigar imagens sem lazy-loading ou animações pesadas.

- [ ] **Step 5: Console limpa**

Abrir consola. Refrescar página. Esperado: 0 erros vermelhos (warnings amarelos do Tailwind CDN são aceitáveis).

- [ ] **Step 6: Screenshots de cada secção para registo**

Tirar screenshot da página inteira em desktop e mobile.
Run: `node screenshot.mjs http://localhost:3000`
Verificar visualmente todas as 12 secções.

- [ ] **Step 7: Não esquecer**

- **NÃO commitar.** O utilizador commita quando quiser.
- Servidor `node serve.mjs` continua a correr.
- `js/featured-beaches.js` foi eliminado (untracked).
- Admin tem 2 secções novas funcionais.
- `data/settings.json` tem 2 campos novos.

---

## Notas finais para o engenheiro

- **Tailwind CDN warnings** ("cdn.tailwindcss.com should not be used in production") são esperados e podem ser ignorados — está documentado no projecto como decisão actual.
- **Quando alguma data fonte (`beaches.json`, `articles.json`, `products.json`) tiver shape diferente do esperado**, o script gracefully mostra mensagem de erro ou esconde a secção em vez de partir. Não tentar "consertar" a fonte de dados — verificar com o utilizador.
- **Counter animation existente** (`index.html` linhas 921-974) usa um único IntersectionObserver com `hasAnimated = true` — o que significa que TODOS os counters animam ao ver o primeiro. Isto é por design (sequência simultânea no hero). Se quiser que o "250+" da secção 3 e o "+250" da secção 11 animem **independentemente** quando entram no viewport, há que refactorar esse script — fica para futuro se houver feedback.
- **Performance budget:** se algum reveal-up parecer "engasgado", verificar que o elemento está em `transform`/`opacity` apenas (nunca `transition: all`, nunca animar `width`/`height`/`top`/`left`).
- **Funcionalidade não implementada (decisão deliberada):** o spec §3.3 menciona "mask transitions" SVG entre secções de fundo contrastante (claro→escuro). Não está em nenhuma task — foi cortado para manter o âmbito gerível na v1. Adicionar é uma task futura simples (1-2 horas): SVG diagonal absoluto na fronteira entre secções, com clip-path animado por ScrollTrigger. Não é bloqueante.
