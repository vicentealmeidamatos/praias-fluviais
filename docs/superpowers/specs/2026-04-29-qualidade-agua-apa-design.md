# Qualidade da Água (APA) — Design

**Data:** 2026-04-29
**Estado:** Aprovado conceptualmente, pendente revisão final do spec

## 1. Objectivo

Adicionar à página individual de cada praia (`praia.html`) uma secção que mostra a qualidade oficial da água segundo a APA (Agência Portuguesa do Ambiente), automaticamente sincronizada com `infoagua.apambiente.pt/pt/praias`. A secção é colocada entre "Sobre esta Praia" e "Tempo Atual".

Apenas praias monitorizadas pela APA mostram a secção. Praias do site sem correspondência na APA (esmagadora maioria das zonas balneares municipais) não mostram nada — sem placeholder, sem título.

## 2. Fonte de dados — APA

A APA não publica API pública para qualidade balnear. O portal `infoagua.apambiente.pt/pt/praias/praias-pesquisa-avancada` carrega todos os registos numa variável JS embutida no HTML:

```js
var DATA_Beaches = [ { id, profile: {...}, quality: {...} }, ... ];
```

**Investigação realizada:** página tem 1.2 MB e contém **760 praias** (601 costeiras + 159 interiores/fluviais). Cada registo:

```json
{
  "id": 701,
  "profile": {
    "codigo_agua_balnear": "PTCD9W",
    "praia": "Praia Fluvial de Alqueva",
    "arh": "ARH-ALENTEJO",
    "latitude": 38.21112,
    "longitude": -7.5222,
    "categoria_agua_balnear": "2",
    "costeira": 0,
    "interior": 1,
    "url": "https://snirh.apambiente.pt/.../par_graficos.php?code_cee=PTCD9W&ano=2026"
  },
  "quality": {
    "concelho": "PORTEL",
    "data_inicio_epoca_balnear": 1781049600000,
    "data_fim_epoca_balnear": 1789257600000,
    "classificacao_ano_anterior": 1,
    "classificacao_ano_anterior_dsc": "Excelente",
    "ultima_classificacao": 0,
    "ultima_classificacao_desc": "Ainda não há análises",
    "data_ultima_analise": null,
    "motivo": [],
    "motivo_desc": null
  }
}
```

**Campos relevantes:**
- `classificacao_ano_anterior_dsc` — classificação oficial: `"Excelente" | "Boa" | "Aceitável" | "Má"` ou `null` para praias sem classificação ou identificadas apenas na época em curso.
- `ultima_classificacao_desc` — estado actual durante a época balnear: `"Sem alertas"`, `"Banhos desaconselhados"`, `"Ainda não há análises"`.
- `motivo_desc` — descrição do motivo de interdição/desaconselhamento (quando aplicável).
- `data_ultima_analise` — timestamp ms da última análise feita esta época.
- `data_inicio_epoca_balnear` / `data_fim_epoca_balnear` — timestamps ms.
- `profile.url` — URL para o gráfico SNIRH com histórico anual da praia.

## 3. Arquitectura

```
infoagua.apambiente.pt  ←──[scheduled GET]──  GitHub Action (cron diário 06:17 UTC)
                                                     │
                                                     ▼
                              scripts/fetch-water-quality.mjs
                                                     │ writes
                                                     ▼
                              data/water-quality.json (committed se há diff)
                                                     │
                                                     │ git push → Vercel auto-deploy
                                                     ▼
                              praia.html · js/beach-page.js
                                  ↳ fetch('data/water-quality.json')
                                  ↳ render secção SE beach.id existe
```

**Princípios:**
- **Fonte única**: uma única chamada HTTP (1.2 MB) traz todas as 760 praias. O script filtra e gera ~165 entradas para o site.
- **Persistência**: ficheiro JSON estático em `data/`, comitado ao repo. Versionado em git (histórico de mudanças visível). Encaixa no padrão do projecto.
- **Frontend não chama APA**: evita CORS, latência e desperdício de banda.
- **Falha graceful**: se a APA falhar, o script aborta sem tocar no ficheiro existente — site continua a funcionar com os últimos dados válidos.

## 4. Algoritmo de matching APA ↔ site

Para cada praia em `data/beaches.json`, procura uma correspondência no `DATA_Beaches` da APA. Os 4 sinais por ordem de confiança:

1. **Override manual** — se `beaches.json[i].apaCode` está preenchido (ex.: `"PTCQ7M"`), usa esse registo APA directamente.
2. **Proximidade forte (≤ 800 m, qualquer pool interior/costeira)** — quase sempre correcto. Captura coincidências interior↔costeira na mesma localização (ex.: Foz do Lizandro a 80 m).
3. **Nome + proximidade ≤ 5 km (qualquer pool)** — captura river-mouth beaches que a APA classifica como costeira mas no site são fluviais (ex.: "Pedras Ruivas" 754 m, "Amoreira – Rio" 81 m). Os 5 km bloqueiam falsos positivos com mesmo nome em sítios diferentes (ex.: "Vau" 430 km).
4. **Sem match** → secção não aparece para essa praia.

**Normalização de nome** (para sinal 3):
- lowercase
- remove acentos via NFD
- remove prefixos: `"praia fluvial"`, `"zona balnear"`, `"parque fluvial"`, `"areal"`, `"albufeira (de/da/do/das/dos)"`
- remove caracteres não-alfanuméricos
- colapsa espaços

**Distância**: fórmula haversine, output em metros.

**Análise feita** sobre os dados actuais: `228 praias do site → ~165 com match` (157 só-interior + 5-8 só-costeira-com-nome + alguns dual-pool com costeira mais próxima). Os ~63 sem match são quase todos zonas balneares municipais sem monitorização APA, exactamente como esperado.

## 5. Schema do `data/water-quality.json`

```json
{
  "lastUpdated": "2026-04-29T06:17:32Z",
  "sourceUrl": "https://infoagua.apambiente.pt/pt/praias/praias-pesquisa-avancada",
  "stats": {
    "siteBeaches": 228,
    "matched": 165,
    "unmatched": 63
  },
  "beaches": {
    "praia-fluvial-de-alqueva": {
      "apaCode": "PTCD9W",
      "apaName": "Praia Fluvial de Alqueva",
      "apaConcelho": "PORTEL",
      "previousYearDsc": "Excelente",
      "previousYearValue": 1,
      "currentSeasonStatus": "Ainda não há análises",
      "currentSeasonValue": 0,
      "lastAnalysisDate": null,
      "interdictionReason": null,
      "seasonStart": "2026-06-15",
      "seasonEnd": "2026-09-15",
      "snirhUrl": "https://snirh.apambiente.pt/.../par_graficos.php?code_cee=PTCD9W&ano=2026",
      "matchMethod": "name+proximity",
      "matchPool": "interior",
      "matchDistance": 0
    }
  }
}
```

**Notas:**
- Chave do mapa = `id` da praia em `beaches.json` (slug). Lookup directo O(1) no frontend.
- Praias sem match não estão no mapa (em vez de entrada com `null` — minimiza tamanho do ficheiro).
- Datas convertidas para ISO `YYYY-MM-DD`. Timestamps originais APA mantidos só em logs do script.

## 6. Frequência & automação

**Workflow:** `.github/workflows/water-quality.yml`

- **Cron**: `17 6 * * *` (diário, 06:17 UTC). Hora desfasada para evitar peak horário e antes do tráfego matinal PT.
- **`workflow_dispatch`**: botão manual no GitHub para forçar run (útil quando se sabe que a APA acabou de publicar a classificação anual).
- **`permissions: contents: write`** — usa `GITHUB_TOKEN`, sem PAT.
- **Commit "no-op safe"**: só commita se `git status --porcelain data/water-quality.json` tem output. Mantém histórico limpo, Vercel só re-deploya quando há diff real.
- **User-Agent**: identificável (`praiasfluviais.pt water-quality bot · contact: vicente@...`).

**Por que diária e não dual season/off-season?** Custo zero (~30 s/run × 365 = ~3 h/ano de GH Actions free tier de 2000 min/mês), simplicidade. Fora de época, o ficheiro não muda → no-op.

**Por que GH Actions e não Vercel Cron?** Mantém o padrão do projecto (JSON estático em `data/`, versionado em git, deploy via push), evita Supabase, Vercel Hobby tem limites apertados de cron, ficheiro é auditável no histórico do repo.

**Robustez do scraper** (`scripts/fetch-water-quality.mjs`):
- HTTP `GET` com timeout 30 s e User-Agent identificável.
- Parse: `match(/var DATA_Beaches\s*=\s*(\[…\]);/)` + `JSON.parse`.
- **Sanity checks que abortam sem tocar no ficheiro existente**: HTTP ≠ 200, regex não bate, JSON inválido, `< 100` praias totais, campo `classificacao_ano_anterior_dsc` ausente.
- Erros saem com `process.exit(1)` → GH Action marca como failed → email automático.

## 7. UI — Secção na página de praia

**Posição**: entre `<section>` "Sobre esta Praia" (linha ~161 de `js/beach-page.js`) e `<section>` "Tempo Atual" (~167).

**Estrutura**: card horizontal compacto seguindo o padrão das outras secções (`<h2 class="label-eyebrow">Qualidade da Água</h2>` + card).

```
[ICON-DROP cor]  CLASSIFICAÇÃO     Estado:  Sem alertas activos        SNIRH ↗
                  ★★★★               Época Balnear:  15 Jun · 15 Set 2026
Fonte · APA · PTCD9W · actualizado a 28 Abr 2026
```

**Esquema de cores oficial APA** (do legend fornecido pelo utilizador):

| Classificação | Cor | Hex | Estrelas |
|---|---|---|---|
| Excelente | azul | `#1976D2` | ★★★★ (4) |
| Boa | verde | `#43A047` | ★★★ (3) |
| Aceitável | amarelo | `#FFEB3B` | ★★ (2) — com contorno teal subtil pela hard-rule do projecto |
| Má | vermelho | `#E53935` | ★ (1) |
| Sem Classificação | cinzento | `#9E9E9E` | ★★★★ esbatidas (opacity .4) |
| Identificada apenas nesta época balnear | branco/contorno | borda `#BDBDBD` | ★★★★ só com traço |

**Estado actual (linha "Estado")** — derivado a partir do `Date.now()` comparado com `seasonStart`/`seasonEnd`:
- `now < seasonStart` ou `now > seasonEnd` → `"Aguardando início da época balnear"` (ou `"Época balnear terminada"` se já passou)
- `seasonStart ≤ now ≤ seasonEnd` + `currentSeasonStatus` indica análise OK → `"Sem alertas activos"`
- Em época + `interdictionReason` presente → `"Banhos desaconselhados · {motivo_desc}"` (separador "·" segundo regra do projecto)
- `previousYearDsc == null` (praia identificada apenas nesta época) → `"Primeira época monitorizada"`, sobrepõe-se às regras acima

**Linha "Época Balnear"** — `"15 Jun · 15 Set 2026"` (datas convertidas, separador "·" segundo a regra do projecto contra em-dash).

**Link "SNIRH ↗"** — abre `profile.url` em nova tab (histórico oficial).

**Rodapé pequeno** — `Fonte · APA · {apaCode} · actualizado a {lastUpdated formatado}`.

**Acessibilidade**:
- Badge tem `aria-label` (ex.: `"Qualidade da água: Excelente, 4 em 4 estrelas"`).
- Estrelas são `role="img"` com `aria-hidden="true"` no SVG individual.
- Cor nunca é o único sinal — texto + ícone + estrelas redundam a informação.

**Texto em PT-PT** com tratamento por "você" — todo o texto cumpre as regras de CLAUDE.md.

## 8. Integração frontend

**`js/data-loader.js`** — adiciona um helper que carrega `data/water-quality.json` em paralelo com `beaches.json`. Cache em `sessionStorage` por 1 h (consistente com o weather widget).

**`js/beach-page.js`** — no render principal:
1. Lookup `waterQuality.beaches[beach.id]`.
2. Se ausente → não insere a `<section>` (zero título, zero espaço).
3. Se presente → insere `<section class="mb-12">…</section>` entre Sobre e Tempo Atual usando o template do card.

**`css/shared.css`** — adiciona estilos da secção: `.water-quality-card`, `.water-quality-drop`, `.water-quality-stars`, `.water-quality-meta`, `.water-quality-source`. Cores via CSS custom properties (ex.: `--wq-color: #1976D2`) para troca declarativa por classe modificadora (`.is-excelente`, `.is-boa`, etc.).

## 9. Admin (`admin.html` + `js/admin.js`)

Sync obrigatório por hard rule do CLAUDE.md.

**Mudanças no editor de cada praia:**

1. **Bloco read-only "Qualidade da Água (APA)"** — mostra para a praia em edição:
   - Classificação actual + cor
   - `apaCode` + nome APA + concelho APA
   - Última actualização do JSON
   - Método de match (`manual`, `proximity`, `name+proximity`)
   - Se sem match → texto `"Esta praia não foi encontrada na APA. Adicione um código manual abaixo se a praia tem registo APA com nome muito diferente."`

2. **Campo opcional `apaCode`** — input texto livre (ex.: `PTCQ7M`). Persiste em `beaches.json[i].apaCode`. Quando preenchido, força o sinal 1 do matching.

3. **Botão "Forçar actualização agora"** — link directo para `https://github.com/vicentealmeidamatos/praias-fluviais/actions/workflows/water-quality.yml` (página do `workflow_dispatch`). Não corre nada server-side, só conveniência de admin.

**Cleanup do legado:**
- O campo `waterQuality` (`"excelente" | "boa" | "aceitavel"`) e o `<select id="b-waterQuality">` (linhas 1018-1021 de `js/admin.js`) ficam **obsoletos**. Removo da UI admin, mas mantenho a chave em `beaches.json` para não quebrar deploys parciais (será limpo numa task futura). O frontend ignora-a.

## 10. Edge cases

| Cenário | Comportamento |
|---|---|
| Praia não está em `water-quality.json` | Secção omitida silenciosamente |
| `previousYearDsc == null` | Estado especial "Identificada apenas nesta época balnear" (contorno cinza) |
| Banho desaconselhado/interditado | Linha "Estado" mostra `motivo_desc` da APA |
| GH Action falha 1 dia | Ficheiro anterior continua válido, site não quebra |
| Estrutura APA muda | Script aborta com `exit 1`, ficheiro preservado, email do GitHub avisa |
| User adiciona praia nova ao site | Próxima run tenta match automático; pode-se adicionar `apaCode` manual depois |
| `data_ultima_analise` está no futuro (timezone bugs APA) | Trata como `null` — mostra estado off-season |

## 11. Ficheiros criados / modificados

**Criados:**
- `scripts/fetch-water-quality.mjs` — scraper + matcher
- `.github/workflows/water-quality.yml` — cron diário
- `data/water-quality.json` — gerado pelo scraper (commitado)
- `css/shared.css` — secções novas (acrescentar a existente)

**Modificados:**
- `js/beach-page.js` — render da nova `<section>` entre Sobre e Tempo Atual
- `js/data-loader.js` — fetch + cache de `water-quality.json`
- `js/admin.js` — bloco read-only + campo `apaCode`, remoção do select legado `b-waterQuality` (toda a UI admin é gerada via JS, `admin.html` é só shell e não precisa de tocar)
- `data/beaches.json` — adiciona campo opcional `apaCode` (vazio por defeito; existing entries ficam sem o campo)

**Não tocados:**
- `data/articles.json`, `descontos.json`, etc.
- API serverless functions (`api/*.js`) — esta feature não usa Stripe nem Supabase

## 12. Out of scope (fora deste design)

- Histórico das classificações ao longo dos anos no nosso JSON (a APA já o tem no SNIRH e linkamos).
- Mapa filtrado por classificação de qualidade (poderia ser feature futura).
- Alertas push/email quando uma praia muda para "Má" (overkill para v1).
- Internacionalização (a APA dá `name.en` mas o site é PT-PT only).

## 13. Critérios de sucesso

1. Em todas as ~165 praias com match, a secção aparece entre Sobre e Tempo Atual com a classificação, estrelas, estado actual e link SNIRH.
2. Nas ~63 praias sem match, a secção não aparece (sem título, sem placeholder).
3. A GH Action corre diariamente sem intervenção e commita o JSON quando a APA muda.
4. Quando um campo `apaCode` é adicionado manualmente em `beaches.json`, a próxima run usa esse código e a secção passa a aparecer/corrigir.
5. Texto em PT-PT, tratamento por "você", separadores "·" em vez de em-dash.
6. Falha da APA num dia não derruba o site nem destrói o ficheiro existente.
