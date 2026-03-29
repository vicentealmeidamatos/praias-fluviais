# CLAUDE.md — Guia das Praias Fluviais

## Projeto
Site moderno para a revista anual "Guia das Praias Fluviais" (200+ praias fluviais portuguesas). Substitui o WordPress estático de praiasfluviais.pt por uma ferramenta de planeamento interativa e mobile-first. Todo o conteúdo em PT-PT.

## Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.
- **Invoke the `seo-optimizer` skill** whenever optimizing for SEO.

## Brand & Design System
- **Logo:** `brand_assets/logotipo.png` — usar sem alterações
- **Fontes:** Poppins (headings/menus, `font-display`) + Open Sans (body, `font-body`)
- **Paleta:** Amarelo `#FFEB3B` (primário), Teal `#003A40` (secundário), Azul `#0288D1`, Verde `#43A047`, Areia `#FAF8F5`→`#2D2820`
- **Tailwind config:** Definido em `js/shared.js` com escalas completas (praia-yellow, praia-teal, praia-blue, praia-green, praia-sand)
- **CSS base:** `css/shared.css` — shadows layered, noise overlay, badges, botões, cards, scroll-reveal
- **Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring)
- **Regra amarelo:** Nunca usar amarelo sobre fundo branco — só sobre fundos escuros (teal/dark)

## Stack
| Componente | Tecnologia |
|---|---|
| CSS | Tailwind CSS via CDN |
| Animações | GSAP 3.12.5 + ScrollTrigger (homepage page-turn 3D) |
| Mapa | Leaflet.js 1.9.4 + MarkerCluster + OpenStreetMap |
| Meteo | Open-Meteo API (grátis, sem chave, cache 30min sessionStorage) |
| Ícones | Lucide Icons via CDN |
| Dados | JSON estáticos em `data/` |
| Estado local | localStorage (votos, passaporte, reviews — protótipos) |

## Estrutura de Páginas
- `index.html` — Homepage com page-turn 3D (5 secções magazine)
- `mapa.html` — Mapa interativo Leaflet com filtros e GPS
- `praia.html?id=xxx` — Página individual (meteo, galeria, reviews, GPS)
- `votar.html` — Votação Praia do Ano 2026 (deadline 31 Out 2026)
- `rede.html` — Rede completa de praias com mapa numerado
- `passaporte.html` — Passaporte digital com carimbos e badges
- `onde-encontrar-guia.html` — Pontos de distribuição do guia
- `onde-encontrar-passaporte.html` — Locais de carimbo
- `descontos.html` — Parceiros com descontos
- `artigos.html` / `artigo.html?slug=xxx` — Listagem e detalhe de artigos
- `admin.html` — Painel admin (JSON Visual Editor)

## Dados (`data/`)
- `beaches.json` — 30 praias reais (id, nome, concelho, região, rio, coordenadas, serviços, fotos, qualidade água)
- `articles.json` — Artigos com slug, HTML content, estado rascunho/publicado
- `settings.json` — Deadline votação, destaques, vencedores anteriores
- `locations-guia.json` — Pontos de distribuição
- `locations-passaporte.json` — Locais de carimbo (tipo: carimbo/venda_carimbo)
- `descontos.json` — Parceiros com condições e região

## Painel Admin (`admin.html`)
- Password com SHA-256 hash (Web Crypto API), sessão em sessionStorage
- CRUD visual: Praias, Artigos, Locais (guia + passaporte), Descontos, Configurações
- Importar JSON existente → editar visualmente → Exportar JSON atualizado
- O editor substitui o ficheiro em `data/` — o site reflete as alterações imediatamente
- Mapa Leaflet clicável para definir coordenadas de praias

## Local Server
- `node serve.mjs` → `http://localhost:3000`
- Nunca usar `file:///` — sempre localhost
- Se porta ocupada, matar processo antes de reiniciar

## Screenshot Workflow
- `node screenshot.mjs http://localhost:3000[/page]`
- Screenshots em `./temporary screenshots/screenshot-N.png`
- Ler PNG com Read tool para análise visual
- Mínimo 2 rounds de comparação

## Anti-Generic Guardrails
- Nunca usar paleta default Tailwind (indigo-500, blue-600, etc.)
- Nunca usar `shadow-md` flat — usar shadows layered com tint
- Nunca usar a mesma fonte para headings e body
- Só animar `transform` e `opacity` — nunca `transition-all`
- Cada elemento clicável precisa de hover, focus-visible, e active states
- Imagens com gradient overlay + mix-blend-multiply
- Grain/textura via `img/noise-texture.svg` (noise overlay)

## Hard Rules
- Não adicionar features/secções fora do plano
- Não "melhorar" designs de referência — replicar
- Não parar após 1 screenshot pass
- Não usar default Tailwind blue/indigo como cor primária
- Sem Firebase — dados são JSON estáticos geridos via admin panel
- Logo original sem alterações
