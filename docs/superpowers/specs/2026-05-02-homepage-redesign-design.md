# Homepage Redesign — Design Spec

**Data:** 2026-05-02
**Página:** `index.html`
**Estilo escolhido:** Híbrido editorial (cada secção com personalidade visual distinta, scroll vertical, transições modernas com GSAP ScrollTrigger)

---

## 1. Objetivo

Substituir totalmente a homepage atual por uma página moderna, scroll-driven, com uma secção dedicada para cada página importante do website. A página atual usa um sistema "magazine page-turn" considerado pesado e desadequado em mobile — vai ser **eliminado**. O hero atual mantém-se exatamente como está.

---

## 2. Resumo das mudanças estruturais

| Elemento | Estado |
|---|---|
| Hero (capa atual com bolhas, stats, CTAs) | **Mantido tal como está** |
| Sistema page-turn (`page-turn.css`, `page-turn.js`, page-dots laterais, magazine-container) | **Removido da homepage** (mantido nas outras páginas se aplicável) |
| Secções existentes (Destaques, Mapa Preview, Quick Links, Praia do Ano) | **Refeitas e reorganizadas** |
| Novas secções: Praias em Destaque, Comunidade, Onde Encontrar (dupla), Passaporte, Loja, Contactos | **Criadas de raiz** |

---

## 3. Ordem das secções

1. **Hero** (mantido)
2. **Rede de Praias** — com mini-mapa Leaflet → `rede.html`
3. **Passaporte Digital** → `passaporte.html`
4. **Praia Fluvial do Ano** — com timeline de vencedores → `votar.html`
5. **Praias em Destaque** — 3 praias rotativas semanalmente
6. **Onde Encontrar (dupla)** — Guia + Carimbar Passaporte com tabs → `onde-encontrar-guia.html` / `onde-encontrar-passaporte.html`
7. **Loja** — produtos em destaque → `loja.html`
8. **Descontos** → `descontos.html`
9. **Novidades / Artigos** — cards horizontais → `artigos.html`
10. **Comunidade** — banner explicativo da feature de reviews
11. **Contactos** — com redes sociais → `contactos.html`

---

## 4. Linguagem visual global

**Princípio:** cada secção tem a sua personalidade (fotografia full-bleed, claro com números, dark com timeline, colorido com cards, etc.) — como folhear uma revista. As transições entre secções são suaves (fade + slide + parallax) mas o **conteúdo** de cada secção difere visualmente da seguinte para evitar monotonia.

**Paleta por papel:**
- Fundos claros: `#FAF8F5` (sand-50), `#F5F0E8` (sand-100)
- Fundos escuros: `#003A40` (teal-800), `#002A2E`, `#005D56`
- Acento primário: `#FFEB3B` (amarelo)
- Acento secundário: `#0288D1` (azul), `#43A047` (verde)
- Texto escuro: `#2D2820` (sand-900)
- Texto claro: `#FFFFFF` com opacidades 60-90%

**Tipografia:** Poppins (headings), Open Sans (body), `font-display` / `font-body` já configurados no Tailwind.

**Sem amarelo sobre branco** (regra do brand) — só amarelo sobre fundos escuros.

---

## 5. Animações e transições (GSAP ScrollTrigger)

**Removido:** sistema page-turn, page-dots laterais, magazine-container.

**Adicionado:**

- **Reveal-on-scroll universal** — cada bloco de conteúdo (heading, parágrafo, card, imagem) faz fade + slide-up de ~24px com easing spring `cubic-bezier(0.34, 1.56, 0.64, 1)`. Stagger entre elementos da mesma secção (~80ms).
- **Parallax leve** — imagens de fundo, ilustrações decorativas e SVGs de fundo movem-se a ~0.7x da velocidade do scroll. Headings com parallax mais subtil (~0.9x).
- **Clip-path reveals** — secções com fotografia full-bleed (Praias em Destaque, Onde Encontrar) entram com `clip-path: inset(...)` a abrir do centro para fora durante o scroll.
- **Sticky-pinned moments** — duas secções têm momento "pin" (Rede de Praias com mini-mapa a animar enquanto se lê os bullets; Praia do Ano com timeline a revelar-se vencedor a vencedor).
- **Mask transitions entre secções** — em transições entre fundos contrastantes (claro→escuro ou vice-versa), uma forma SVG (onda, traço diagonal, círculo) faz a "ponte" visual com clip-path animado.
- **Counter animations** — números (200+ praias, 250 pontos, 120k guias) animam ao entrar no viewport (já existe lógica no hero, replicar onde aplicável).
- **Hover micro-interactions** — cards têm transform + shadow shift; botões têm scale + glow; ícones rodam ligeiramente.
- **Scroll progress bar** no topo (já existe, mantém-se).

**Princípio anti-generic:** só animar `transform` e `opacity` (nunca `transition-all`), respeitar `prefers-reduced-motion` (fallback simples sem motion para utilizadores com motion-reduced).

---

## 6. Detalhe por secção

### 6.1 Hero (Secção 1)
**Estado:** mantido exatamente como está.
- Fundo teal escuro com bolhas animadas
- Logo + 3 stats (200+ Praias, 120k Guias, +250 Descontos) com counter animation
- 2 CTAs: "Explorar Mapa" (amarelo) + "Votar Praia do Ano" (outline)

### 6.2 Rede de Praias (Secção 2)
**Background:** claro (`praia-sand-50`), com pattern noise overlay.
**Layout:** 2 colunas em desktop (texto à esquerda, mini-mapa à direita); empilhado em mobile.
**Conteúdo:**
- Eyebrow "Rede de Praias" + heading "Encontre a praia perto de si"
- Lead text + 3 features com ícones (Geolocalização, Filtros, Direções)
- CTA "Explorar o Mapa" (amarelo sobre teal — usa botão dark)
- Mini-mapa Leaflet com ~20 markers amarelos (já existe lógica)
**Animação:** sticky-pin de 100vh — enquanto o utilizador faz scroll, os 3 features revelam-se um a um e os markers do mapa pulsam em sequência.

### 6.3 Passaporte Digital (Secção 3)
**Background:** dark gradient teal (`#002A2E` → `#005D56`) + bolhas decorativas.
**Layout:** 2 colunas — mockup ilustrado de passaporte rotativo à esquerda, texto + CTA à direita.
**Conteúdo:**
- Eyebrow "Passaporte" + heading "Coleccione carimbos pelo país"
- Bullets: "200+ praias para visitar", "Carimbo digital + físico", "Badges de conquista"
- CTA "O Meu Passaporte"
**Animação:** o mockup do passaporte tem rotação 3D leve (~5deg em Y) que reage ao scroll. Os carimbos aparecem um a um com um "stamp" effect (scale + opacity bounce).

### 6.4 Praia Fluvial do Ano (Secção 4)
**Background:** dark gradient teal mais profundo (`#001f23` → `#003A40`) com bolhas.
**Layout:** 2 colunas — info à esquerda (título, descrição, CTA), timeline de vencedores à direita.
**Conteúdo:**
- Pill "Galardão Anual" com troféu
- Heading "Praia Fluvial do Ano 2026"
- Descrição + CTA "Votar Agora"
- Timeline com 4 entradas: 2025 Carriça, 2024 Avô, 2023 Vimieiro, Revelação Norte 2024 Cavadinho
**Animação:** a linha vertical da timeline desenha-se de cima para baixo conforme scroll (`stroke-dashoffset`); cada entrada de vencedor entra com slide-in horizontal com stagger (250ms apart).

### 6.5 Praias em Destaque (Secção 5) — **NOVA**
**Background:** claro (`praia-sand-50`) com fotografia full-bleed esbatida no fundo (foto da praia da semana #1 com overlay).
**Layout:** heading centrado + 3 cards horizontais em desktop / vertical em mobile.
**Conteúdo:**
- Eyebrow "Esta Semana" + heading "Praias em Destaque"
- Subtítulo: "Três praias escolhidas para si todas as semanas"
- 3 cards de praia (foto, nome, concelho/região, badges de serviços, link para `praia.html?id=...`)
- Pequeno texto explicativo: "Atualizam-se a cada segunda-feira"
**Lógica de seleção:**
- Pool de praias elegíveis em `settings.json` → `featuredPool: [beachId, ...]`
- Override manual em `settings.json` → `featuredCurrent: { weekKey: "2026-W18", beachIds: [a,b,c] }` ou `null`
- Cliente: se `featuredCurrent.weekKey === currentWeekKey`, usa esses IDs; senão calcula 3 IDs deterministicamente a partir do `featuredPool` usando o número da semana ISO como seed (PRNG simples mulberry32)
- Função utilitária reutilizável em `js/featured-beaches.js`
**Animação:** ao entrar no viewport, os 3 cards entram com stagger (left → right, 120ms) e ligeiro tilt 3D que se endireita quando ficam em viewport.

### 6.6 Onde Encontrar (Secção 6) — **DUPLA com tabs**
**Background:** dark teal (`#003A40`) com fotografia full-bleed esbatida.
**Layout:**
- Heading central + 2 tabs grandes: "Levantar o Guia" / "Carimbar o Passaporte"
- Conteúdo da tab visível: descrição curta + número de pontos + CTA + 3-4 logos de parceiros como mini-cards
- Mockup ilustrativo (capa do guia ou passaporte com carimbo) à direita em desktop
**Conteúdo Tab 1 (Guia):**
- "250+ pontos de distribuição em todo o país"
- "Quiosques, hotéis, postos de turismo, lojas parceiras"
- CTA "Ver pontos de distribuição"
**Conteúdo Tab 2 (Passaporte):**
- "Carimbe nas próprias praias e em parceiros"
- "Bares, cafés, postos de turismo"
- CTA "Ver pontos de carimbo"
**Animação:** transição entre tabs com crossfade + slide horizontal de 20px. Tabs com indicador animado por baixo (linha amarela que desliza).

### 6.7 Loja (Secção 7)
**Background:** claro (`praia-sand-50`) com noise overlay.
**Layout:** heading à esquerda + slider horizontal de 4 produtos com snap-scroll. Em desktop, todos visíveis.
**Conteúdo:**
- Eyebrow "Loja" + heading "Leve o Guia consigo"
- Subtítulo curto
- 4 cards de produto (foto, nome, preço, badge se "Bestseller"/"Novo")
- CTA "Ver Loja Completa"
**Fonte de dados:** `data/products.json` (primeiros 4 produtos com flag `featured: true` ou primeiros 4 ordenados).
**Animação:** os cards de produto entram com stagger horizontal; ao hover, cada produto faz scale + lift + revela botão "Adicionar".

### 6.8 Descontos (Secção 8)
**Background:** amarelo desaturado (`#F5B800` → `#FFEB3B`) com pattern de "tickets" decorativo (shapes pretos diagonais).
**Layout:** heading central + grid de 6 logos de parceiros + CTA central.
**Conteúdo:**
- Eyebrow "Vantagens" + heading "Mais de 250 descontos por todo o país"
- Subtítulo: "Apresentando o Guia ou o Passaporte"
- 6 logos de parceiros em destaque (mock placeholders se necessário)
- CTA "Ver Descontos"
**Animação:** os logos aparecem com stagger e ligeiro bounce. O fundo amarelo tem subtle parallax gradient.

### 6.9 Novidades / Artigos (Secção 9)
**Background:** branco/sand-50.
**Layout:** heading à esquerda + carrossel horizontal de cards (lógica já existe na homepage atual).
**Conteúdo:**
- Eyebrow "Novidades" + heading "Histórias do Interior de Portugal"
- 5 cards horizontais com foto, badge (Destaque/Novo), título, excerpt
- CTA "Ver Todos os Artigos"
**Fonte de dados:** `data/articles.json` (artigos publicados, ordenados por data DESC, primeiros 5).
**Animação:** cards já com horizontal scroll e snap. Adicionar parallax leve no scroll horizontal (foto move ligeiramente).

### 6.10 Comunidade (Secção 10) — **NOVA**
**Background:** dark teal (`#003A40`) com noise + raios de luz subtis.
**Layout:** 2 colunas em desktop — mockup ilustrativo de uma "review" à esquerda (cartão semi-realista com avatar, estrelas, texto), texto + CTA à direita.
**Conteúdo:**
- Eyebrow "Comunidade" + heading "Partilhe a sua experiência"
- Texto: "Em cada página de praia pode escrever um comentário, dar estrelas, e ler avaliações de outros visitantes. A comunidade ajuda quem chega a seguir."
- CTA secundário "Explorar Praias" (leva ao `rede.html`)
- Pequeno texto: "Já 1.200+ avaliações partilhadas" *(número fictício/configurável)*
**Mockup ilustrativo:** card branco com:
- Avatar circular + nome ("Maria S.")
- 5 estrelas amarelas
- Texto curto de uma review fictícia
- Data e nome da praia
**Animação:** o cartão de review entra com slide-up + scale leve. As estrelas iluminam-se uma a uma com stagger de 100ms. O fundo tem subtle drift de raios de luz.

### 6.11 Contactos + Redes Sociais (Secção 11)
**Background:** dark teal mais profundo (`#001f23`) — última secção antes do footer.
**Layout:** centrado, em coluna única.
**Conteúdo:**
- Eyebrow "Falar Connosco" + heading "Estamos a um clique"
- Subtítulo curto
- Botão grande "Ir para Contactos" → `contactos.html`
- Divisor "ou siga-nos"
- Linha de 2 ícones grandes redondos (Facebook, Instagram) com hover effects fortes
- Texto pequeno: "Newsletter mensal" com input + botão (já existe lógica)
**Animação:** os 2 ícones de redes sociais têm "breathing" loop subtil (scale 1 → 1.04 → 1) e ao hover ficam amarelos.

---

## 7. Comunidade — referência cruzada à página de praia

A secção Comunidade funciona como **descoberta** da feature de reviews que vive em `praia.html` (linhas 322-375 do `praia.html` atual, gerida em `js/beach-page.js`). Não puxa dados reais da Supabase nesta primeira versão (decisão do utilizador) — usa um mockup ilustrativo. Caso futuro: pode evoluir para mostrar reviews recentes reais.

---

## 8. Painel Admin — alterações

Adicionar **2 novas secções** ao `admin.html` (e respetiva lógica em `js/admin.js`):

### 8.1 "Pool de Praias em Destaque"
- Lista todas as praias do `beaches.json` com checkbox
- Permite marcar quais entram no sorteio semanal
- Guarda em `settings.json` → `featuredPool: [id, id, ...]`
- Por defeito: vazio (admin tem de configurar) OU pré-preenchido com praias com fotos reais

### 8.2 "Praias em Destaque desta Semana"
- Mostra a chave da semana atual (ex.: "2026-W18 · 2 a 8 de Maio")
- Mostra as 3 praias atualmente em destaque (auto ou override)
- 3 dropdowns para selecionar praias (do pool) — se preenchidos, salvam em `featuredCurrent.beachIds` com `weekKey` da semana atual
- Botão "Repor automático" — limpa `featuredCurrent`, fazendo o site voltar a gerar deterministicamente do pool

### 8.3 Sincronização
Como a regra do projeto manda, qualquer alteração de campos do `settings.json` é refletida em admin no mesmo task — esta spec já o garante.

---

## 9. Mobile

Cada secção foi pensada também para mobile:
- 2 colunas → 1 coluna empilhada
- Tabs de "Onde Encontrar" → tabs full-width
- Cards horizontais → mantêm scroll horizontal com snap
- Praias em Destaque → empilha verticalmente
- Animações reduzidas em `prefers-reduced-motion` e simplificadas em viewports pequenos (parallax desligado abaixo de 768px para preservar performance)
- Footer mobile já existe; manter bottom-nav atual

---

## 10. Ficheiros afetados

**Novos:**
- `js/featured-beaches.js` — lógica de seleção determinística por semana ISO + leitura de override

**Modificados:**
- `index.html` — reescrita completa de `<main>` (mantendo header, hero, footer, mobile-nav, scripts)
- `data/settings.json` — novos campos `featuredPool`, `featuredCurrent`
- `admin.html` — duas novas secções de admin
- `js/admin.js` — lógica de save/load das novas secções

**Não tocar:**
- `js/page-turn.js` e `css/page-turn.css` — usados noutras páginas, mantém-se
- Hero (linhas 269-374 do `index.html`)
- Header, mobile menu, footer, bottom-nav

---

## 11. Risco e mitigação

| Risco | Mitigação |
|---|---|
| Página fica demasiado longa (11 secções) | Cada secção foi desenhada com altura modular (~80-110vh em desktop, ~100vh+ em mobile). Scroll progress bar e bottom-nav ajudam à navegação. |
| Animações pesam em mobile | Parallax desligado <768px; `prefers-reduced-motion` respeitado; só animar transform/opacity. |
| Tailwind CDN não gera classes injetadas via JS | Para cards dinâmicos (Praias em Destaque, Loja, Artigos) usar inline styles em pontos críticos, classes Tailwind apenas no HTML estático. |
| Pool de praias vazio na primeira visita | Pré-preencher `featuredPool` em `settings.json` com IDs das praias que têm foto real (boa qualidade), para que a feature funcione desde o início. |
| Falha de network ao carregar `settings.json` ou `beaches.json` | Skeleton loaders nas secções que dependem de dados; fallback gracioso (texto "A carregar..." → "Atualize a página"). |

---

## 12. Critérios de sucesso

- Hero permanece pixel-perfect igual ao atual
- Página tem 11 secções na ordem correta com personalidade visual distinta cada uma
- Praias em Destaque rota automaticamente todas as segundas-feiras com 3 praias do pool
- Admin permite gerir pool + override de 3 atuais
- Comunidade tem mockup que ilustra a feature de reviews
- Tabs de Onde Encontrar funcionam suavemente
- Tudo funciona em mobile sem layout shifts ou overflow horizontal
- Animações sem janky/stutter; respeitam `prefers-reduced-motion`
- Lighthouse ≥90 em Performance e Accessibility
