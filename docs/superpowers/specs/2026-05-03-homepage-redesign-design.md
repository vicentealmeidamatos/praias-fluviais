# Homepage Redesign — Design Spec

**Data:** 2026-05-03
**Página:** `index.html`
**Estilo escolhido:** Editorial bold (tipografia gigante, alto contraste, layouts assimétricos, números como elementos visuais)
**Estrutura:** Longform — 11 secções de conteúdo + hero (12 totais)
**3D:** Nível médio — CSS 3D + GSAP scroll-driven, sem Three.js / WebGL

> Este spec substitui completamente `2026-05-02-homepage-redesign-design.md` (descartado pelo cliente). Ignorar o anterior.

---

## 1. Objetivo

Refazer totalmente o `<main>` da homepage. O hero atual mantém-se intacto. Tudo o resto é eliminado e substituído por uma página editorial bold com 11 secções, cada uma referenciando uma página importante do site, com forte camada de animação scroll-driven e profundidade 3D em pontos cirúrgicos.

A página actual (sistema page-turn com magazine-container e page-dots laterais) é considerada visualmente fraca e tecnicamente desadequada em mobile. Vai ser eliminada.

---

## 2. Resumo das mudanças

| Elemento | Estado |
|---|---|
| Hero (linhas 269-374 actuais) | **Mantido pixel-perfect** |
| Sistema page-turn na homepage (`page-indicator`, `magazine-container`, `magazine-page` wrappers) | **Removido** (apenas da homepage; mantido nos outros ficheiros) |
| 11 secções abaixo do hero | **Criadas de raiz** |
| `js/featured-beaches.js` (untracked, baseado no spec antigo) | **Eliminado** — substituído por escolha manual via admin |
| `data/settings.json` | Novos campos: `homeFeaturedBeachIds`, `communityCount` |
| `admin.html` + `js/admin.js` | Duas pequenas secções novas |

---

## 3. Sistema visual global

### 3.1 Paleta por papel de secção

| Tipo | Fundo | Texto | Acento |
|---|---|---|---|
| `light` | `#FAF8F5` (areia) | `#003A40` (teal) | `#FFEB3B` em fundos teal apenas |
| `dark` | linear-gradient `#003A40 → #002A2E` | `#fff` | `#FFEB3B` |
| `dark-deep` | linear-gradient `#002A2E → #001f23` | `#fff` | `#FFEB3B` |
| `yellow` | `#FFEB3B` (sólido ou gradiente desaturado) | `#003A40` | `#003A40` |

**Regra de marca:** amarelo nunca sobre branco — só sobre fundos teal/dark.

### 3.2 Tipografia

- **Números gigantes** (200+, 250+, etc.) — Poppins 800, `font-size: clamp(80px, 14vw, 220px)`, line-height 0.9, letter-spacing -0.04em.
- **Headings de secção** — Poppins 700, `clamp(40px, 6vw, 88px)`, letter-spacing -0.02em.
- **Eyebrow labels** — Poppins 700, 11px, letter-spacing 0.25em, uppercase.
- **Body** — Open Sans 400/500, 16-18px, line-height 1.6.

### 3.3 Sistema de animação (GSAP + ScrollTrigger)

- **Reveal universal:**
  - Headings: clip-path `inset(0 100% 0 0)` a abrir L→R em 0.8s.
  - Cards/parágrafos: opacity 0→1 + translateY(28px→0) com easing spring `cubic-bezier(0.34, 1.56, 0.64, 1)`, stagger 80ms.
- **3D nível médio (CSS + GSAP, sem WebGL):**
  - Cards: container com `perspective: 1200px`. Hover faz tilt mouse-tracked (max ±8deg em Y, ±5deg em X).
  - Passaporte (secção 6): mockup 3D que abre conforme scroll (rotateY 0 → -25deg ligado a ScrollTrigger scrub).
  - Mapa preview (secção 2): `transform: rotateX(15deg)` para look isométrico, com leve drift no mouse.
  - Cards de praia (secção 4): paralaxe profundo entre 0.85x e 1.15x da velocidade de scroll, criando flutuação em camadas z.
- **Mask transitions:** entre secções com fundos contrastantes (claro→escuro), SVG diagonal com clip-path animado para fazer "ponte".
- **Counter animations:** números gigantes contam de 0 ao valor ao entrar viewport (replicar lógica do hero).
- **Scroll progress bar:** mantida no topo (já existe).
- **Princípios anti-generic:** só animar `transform` e `opacity`; nunca `transition-all`.

### 3.4 prefers-reduced-motion

Tudo opacity 1, sem transforms, sem parallax, sem scrub. CSS:

```css
@media (prefers-reduced-motion: reduce) {
  .reveal-up, .reveal-fade, [data-3d] { opacity: 1 !important; transform: none !important; }
}
```

GSAP guard:
```js
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) return; // skip ScrollTrigger setup
```

### 3.5 Mobile (<768px)

- 2 colunas → coluna única empilhada.
- 3D desligado (todas as `perspective` removidas, `rotateX/Y` zerados).
- Clip-path reveals → simples opacity fade (mais leve).
- Números gigantes reduzem proporcionalmente via `clamp()`.
- Parallax z desligado abaixo de 768px.
- Bottom-nav atual mantém-se.

---

## 4. Detalhe das 12 secções

### 4.1 Hero (mantido)
**Sem alterações.** Copiar verbatim das linhas 269-374 do `index.html` actual: bolhas, stats com counters, 2 CTAs.

### 4.2 Rede / Mapa
**Tipo:** `light`. **Página alvo:** `rede.html`.
**Layout:** 2 colunas assimétricas (40% / 60% em desktop).
- **Esquerda:** número gigante "**200+**" amarelo desaturado sobreposto por heading "Praias para descobrir, num clique". Eyebrow "Rede Nacional". 3 features pequenas em coluna (ícone + label): Geolocalização, Filtros inteligentes, Direções GPS. CTA `Explorar Mapa`.
- **Direita:** mini-mapa Leaflet com inclinação isométrica (`rotateX(15deg)`), markers amarelos a pulsar em sequência, contorno dourado.
**Animação chave:** sticky-pin de 100vh — features e markers revelam-se um a um conforme scroll.

### 4.3 Onde Encontrar o Guia
**Tipo:** `dark`. **Página alvo:** `onde-encontrar-guia.html`.
**Layout:** 2 colunas (50/50).
- **Esquerda:** mockup do guia físico em 3D (`rotateY(-12deg)` com sombra projetada gigante).
- **Direita:** número "**250+**" amarelo, heading "Levante o seu Guia em 250+ pontos", subtítulo "Quiosques · Hotéis · Postos de Turismo · Lojas Parceiras", CTA `Ver Pontos de Distribuição`.
**Animação chave:** o guia entra com `rotateY` de -45deg → -12deg conforme scroll; o número conta de 0 a 250.

### 4.4 Praias da Semana
**Tipo:** `light` com foto full-bleed esbatida no fundo (foto da primeira praia em destaque). **Página alvo:** `praia.html?id=...`.
**Layout:** heading editorial centrado "**Esta semana**" + 3 cards escalonados (não em grid simétrico — primeiro card adiantado/ligeiramente abaixo, segundo centrado mais alto, terceiro atrasado/ligeiramente acima).
**Cards:** foto full-bleed com gradient overlay, eyebrow "Praia em destaque", nome, concelho · região, badges de serviços, link para `praia.html?id=...`.
**Subtítulo:** "Atualizam-se todas as segundas-feiras".
**Mecanismo de dados:** lê `settings.homeFeaturedBeachIds` (array de 3 IDs). Mostra esses 3. Sem auto-rotação automática — admin é responsável por mudar quando quiser. Se o array tiver menos de 3 IDs válidos, mostra os primeiros N e esconde os restantes (sem placeholder).
**Animação chave:** cards entram com tilt 3D (rotateY ±5deg) que se endireita; paralaxe Y diferente em cada um (camadas z).

### 4.5 Comunidade
**Tipo:** `dark`. **Página alvo:** `rede.html` (CTA), com referência informativa ao bloco de reviews em `praia.html`.
**Layout:** 2 colunas (45/55).
- **Esquerda:** eyebrow "Comunidade", heading gigante "**A voz de quem lá esteve**", parágrafo "Em cada página de praia pode escrever um comentário, dar estrelas, e ler avaliações de outros visitantes. A comunidade ajuda quem chega a seguir." CTA `Explorar Praias` + texto pequeno "Já {communityCount}+ avaliações partilhadas".
- **Direita:** stack de 3 cards de review fictícias flutuando em 3D (sobrepostos ligeiramente, cada um com `rotateY` e Z diferentes).
**Cada card mockup contém:**
- Avatar circular + nome ("Maria S.", "João P.", "Ana C.")
- 5 estrelas amarelas (algumas com fade)
- Texto curto PT-PT ("Água cristalina e pouca gente. Voltamos para o ano.")
- Praia + data
**Conteúdo dos 3 mockups:** hardcoded no HTML, em PT-PT com "você"/3ª pessoa.
**Animação chave:** estrelas iluminam-se em sequência (stagger 100ms); cards entram em onda com `translateZ` diferente.

### 4.6 Passaporte
**Tipo:** `dark-deep`. **Página alvo:** `passaporte.html`.
**Layout:** 2 colunas (50/50).
- **Esquerda:** mockup 3D do passaporte fechado que abre conforme scroll. Implementação: dois `<div>` ligados por uma "lombada" SVG, com transform-origin no lado central. ScrollTrigger scrub controla `rotateY` de 0 → -25deg.
- **Direita:** eyebrow "Passaporte Digital", heading "**Coleccione carimbos**\\n**pelo país**", número "200+" praias para visitar, 3 bullets (Carimbo digital + físico, Badges de conquista, Histórico pessoal), CTA `O Meu Passaporte`.
**Animação chave:** carimbos aparecem um a um sobre o passaporte aberto (scale 0 → 1 com bounce + ligeira rotação aleatória); bolhas decorativas no fundo.

### 4.7 Onde Carimbar Passaporte
**Tipo:** `light` (contraste deliberado após dois darks). **Página alvo:** `onde-encontrar-passaporte.html`.
**Layout:** 2 colunas invertidas vs. secção 4.3 — texto à esquerda, ilustração à direita.
- **Esquerda:** eyebrow "Pontos de Carimbo", heading "**Carimbe nas próprias praias**\\n**e em parceiros**", subtítulo "Bares · Cafés · Postos de Turismo nas zonas balneares", CTA `Ver Pontos de Carimbo`.
- **Direita:** ilustração SVG/CSS de um carimbo a ser aplicado em 3D: carimbo desce → toca no papel → sobe deixando marca amarela. Loop subtil ao scroll.

### 4.8 Praia do Ano 2026
**Tipo:** `dark`. **Página alvo:** `votar.html`.
**Layout:** centrado vertical, hero-like.
- **Topo:** pill amarela "Galardão Anual" com ícone troféu.
- **Centro:** heading gigante centrado "**Vote a Praia**\\n**Fluvial do Ano**" + descrição curta "Vencedor anunciado a 15 Novembro. Vote até 31 Outubro 2026."
- CTA grande `Votar Agora` em amarelo.
- **Inferior:** timeline horizontal de vencedores (2025 Carriça, 2024 Avô, 2023 Vimieiro, 2024 Revelação Norte: Cavadinho).
**Animação chave:** linha horizontal da timeline desenha-se L→R conforme scroll (`stroke-dashoffset`); cards de vencedor entram em sequência com fade + scale.

### 4.9 Loja
**Tipo:** `light`. **Página alvo:** `loja.html`.
**Layout:** heading à esquerda "**Leve o Guia consigo**" + 4 cards de produto em grid horizontal (em mobile: scroll horizontal com snap).
**Cards:** foto, nome, preço (em €), badge "Bestseller"/"Novo" se aplicável, botão "Adicionar" que aparece em hover.
**Fonte de dados:** lê `data/products.json` — primeiros 4 com `featured: true`, ou fallback para os primeiros 4 do array.
**Animação chave:** cards entram com tilt 3D (rotateY ±6deg); ao hover, scale 1.04 + lift 8px + sombra teal.

### 4.10 Artigos
**Tipo:** `light`. **Página alvo:** `artigos.html` (e `artigo.html?slug=...`).
**Layout:** faixa amarela horizontal de fundo no header de secção; heading "**Histórias do Interior**" sobre essa faixa; carrossel horizontal de 5 cards com snap-scroll.
**Cards:** foto editorial, badge "Destaque"/"Novo", título, excerpt 2 linhas, data.
**Fonte de dados:** lê `data/articles.json` (estado `publicado`, ordenados por data DESC, primeiros 5).
**Animação chave:** parallax leve nas fotos durante scroll horizontal; CTA "Ver Todos os Artigos" no fim.

### 4.11 Descontos
**Tipo:** `yellow`. **Página alvo:** `descontos.html`.
**Layout:** centrado.
- Heading gigantesco "**+250 descontos**" em teal sobre fundo amarelo (com pattern subtil de "tickets" diagonais).
- Subtítulo "Apresentando o Guia ou o Passaporte".
- Grid de 6 logos de parceiros em destaque (placeholders se ainda não houver assets).
- CTA `Ver Todos os Descontos`.
**Animação chave:** logos aparecem com bounce stagger; o fundo amarelo tem leve drift de gradiente em parallax.

### 4.12 Contactos + Newsletter
**Tipo:** `dark-deep`. **Página alvo:** `contactos.html`.
**Layout:** centrado, em coluna única.
- Eyebrow "Falar Connosco" + heading "**Estamos a um clique**".
- Botão grande "Ir para Contactos" em amarelo.
- Divisor "ou siga-nos".
- 2 ícones gigantes de Facebook + Instagram em círculos com breathing loop subtil (scale 1 → 1.04 → 1, 4s).
- Por baixo: input de email + botão "Subscrever Newsletter" (lógica já existe no atual).
**Animação chave:** ícones de redes sociais com breathing infinito; ao hover ficam amarelos com glow.

---

## 5. Mecanismos de dados

### 5.1 Praias da Semana
**Novo campo em `data/settings.json`:**
```json
"homeFeaturedBeachIds": ["praia-fluvial-de-loriga", "praia-fluvial-de-avo", "albufeira-do-azibo"]
```
- Array de 3 strings (IDs de `beaches.json`).
- Se algum ID não existir em `beaches.json`, é silenciosamente ignorado.
- Sem auto-rotação, sem PRNG, sem ISO weeks. Admin controla manualmente.

### 5.2 Contagem de avaliações (mockup)
**Novo campo em `data/settings.json`:**
```json
"communityCount": 1200
```
- Inteiro mostrado como "1.200+" na secção Comunidade.
- Editável via admin.

### 5.3 Eliminação do `featured-beaches.js`
O ficheiro `js/featured-beaches.js` (untracked, criado pelo spec antigo) é **eliminado**. Toda a lógica é substituída por um simples `settings.homeFeaturedBeachIds.map(id => beaches.find(b => b.id === id)).filter(Boolean)` inline na inicialização da homepage.

---

## 6. Painel Admin — alterações

### 6.1 Secção "Praias em Destaque na Homepage"
- Aparece sob "Configurações" em `admin.html`.
- 3 dropdowns (lado a lado em desktop), cada um com lista de praias do `beaches.json` (ordenadas alfabeticamente).
- Save grava em `settings.homeFeaturedBeachIds`.
- Validação: avisar se alguma escolha está duplicada.

### 6.2 Campo "Nº de Avaliações (mockup)"
- Input numérico simples sob "Configurações".
- Save grava em `settings.communityCount`.
- Default 1200.

Conforme a regra do projeto, qualquer alteração de campos de `settings.json` é refletida no admin no mesmo task.

---

## 7. Ficheiros afetados

**Modificados:**
- `index.html` — `<main>` reescrito (linhas 254-781 do estado actual). Mantém header, hero (269-374), footer, mobile-menu, bottom-nav, scripts. Adiciona inline `<style>` com classes `.section`, `.section-light`, `.section-dark`, etc., e novo `<script>` GSAP no fim do body.
- `data/settings.json` — adicionar `homeFeaturedBeachIds` e `communityCount`.
- `admin.html` — duas novas entradas de menu/secção.
- `js/admin.js` — lógica CRUD das duas novas secções.

**Eliminados:**
- `js/featured-beaches.js` (untracked — nunca foi commitado).

**Não tocar:**
- Hero (linhas 269-374 actuais).
- Header, mobile menu, footer, bottom-nav.
- `js/page-turn.js`, `css/page-turn.css` — usados nos outros ficheiros.
- `data/beaches.json`, `data/articles.json`, `data/products.json` — só leitura.

---

## 8. Linguagem & tom (PT-PT)

Todo o conteúdo textual da homepage:
- PT-PT estrito (nunca PT-BR).
- Tratamento por **"você"** ou 3ª pessoa neutra ("Levante", "Coleccione", "Vote") — nunca "tu", "teu", "tua".
- Sem em-dash ("—") em texto visível ao utilizador. Usar "·", "|", ":", ",".

---

## 9. Risco e mitigação

| Risco | Mitigação |
|---|---|
| Página fica longa (12 secções) | Cada secção compacta (~80-110vh em desktop). Scroll progress bar e bottom-nav ajudam à navegação. Animações reveal mantêm interesse. |
| 3D pesa em mobile | Tudo desligado abaixo de 768px. `prefers-reduced-motion` respeitado. |
| Tailwind CDN não gera classes injetadas via JS | Cards dinâmicos (Praias da Semana, Loja, Artigos) usam inline styles em pontos críticos; classes Tailwind apenas em HTML estático. |
| `homeFeaturedBeachIds` por defeito vazio | Pré-preencher na primeira escrita do `settings.json` com 3 IDs reais (ex.: `praia-fluvial-de-loriga`, `praia-fluvial-de-avo`, `albufeira-do-azibo`) para a secção funcionar desde a primeira visita. Verificar que cada ID existe em `beaches.json` antes de gravar. |
| Falha de network ao ler `settings.json` ou `beaches.json` | Skeleton placeholders nas secções dependentes; secção de Praias da Semana esconde-se gracefully se o array vier vazio. |
| Mockup de Comunidade fica desatualizado quando começarem reviews reais | Aceite — esta é a v1. Migrar para Supabase real fica fora do âmbito desta task. |
| Logos de parceiros (Descontos) ainda não existem | Usar 6 placeholders genéricos em SVG inline. Substituição é cosmética e fica para depois. |

---

## 10. Critérios de sucesso

- Hero permanece pixel-perfect igual ao actual.
- 12 secções na ordem definida em §4, com personalidade visual distinta.
- Praias da Semana mostra 3 praias geridas por admin via `homeFeaturedBeachIds`.
- Comunidade mostra 3 mockups de review com estrelas iluminadas em sequência.
- Passaporte abre conforme scroll (3D CSS).
- Mapa preview renderiza em isometria.
- Onde Encontrar Guia e Onde Carimbar Passaporte ficam em duas secções separadas (não há tabs).
- Tudo funciona em mobile sem layout shift, overflow horizontal ou jank.
- `prefers-reduced-motion` respeitado.
- Lighthouse ≥90 em Performance e Accessibility.
- Admin permite gerir Praias da Semana e contagem de avaliações.
