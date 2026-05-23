#!/usr/bin/env python3
"""
Calcula focal-Y (0-100) por foto de praia para `background-position: 50% Y%`.

ABORDAGEM
=========
1) Identifica em que % da altura da foto está o "centro do assunto" (subject_pct):
   - Detecta a banda contínua de céu no topo (bright + azulado/cinzento).
   - Detecta a banda contínua de água/foreground no fundo (escuro + uniforme).
   - O assunto fica entre os dois. Calcula o centroide ponderado pela
     densidade de edges (saliência) DENTRO dessa banda.
2) Converte subject_pct → focal_Y aplicando a amplificação do background-cover
   para o aspect ratio do hero em desktop (a vista mais expressiva):
     focal_Y = 50 + (subject_pct - 50) / crop_ratio
     crop_ratio = 1 - A_p / A_hero
"""
import json, os, sys, math
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BEACHES_JSON = ROOT / "data/beaches.json"
OUT_JSON     = ROOT / "scripts/_focals-proposal.json"
REPORT_MD    = ROOT / "scripts/_focals-report.md"

ANALYZE_W   = 320
A_HERO      = 1280 / 500   # 2.56 — desktop hero ratio

MIN_FOCAL = 35
MAX_FOCAL = 76


def load_rgb(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    new_w = ANALYZE_W
    new_h = int(h * new_w / w)
    return im.resize((new_w, new_h), Image.LANCZOS), w, h


def row_stats(im):
    """Para cada linha devolve (edge, sky_score, water_score, bright_mean)."""
    gray = im.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    w, h = im.size
    px = im.load()
    ex = edges.load()
    rows = []
    for y in range(h):
        e_sum = 0
        r_sum=g_sum=b_sum=0
        sky=water=warm=0
        for x in range(w):
            e_sum += ex[x, y]
            r,g,b = px[x, y]
            r_sum+=r; g_sum+=g; b_sum+=b
            mx = max(r,g,b); mn = min(r,g,b)
            sat = (mx - mn) / (mx + 1)
            bright = mx / 255.0
            # Sky: very bright + low sat, OR distinct blue
            if (bright > 0.78 and sat < 0.18) or (b > r + 12 and b > g + 6 and bright > 0.55):
                sky += 1
            # Water: dark+uniform or saturated blue mid-tone
            if (bright < 0.40 and sat < 0.25) or (b > r + 10 and bright < 0.55):
                water += 1
            # Warm tones (sand, skin, wood, equipment)
            if r > b + 20 and bright > 0.45:
                warm += 1
        rows.append({
            "y": y,
            "edge": e_sum / (w * 255.0),
            "sky": sky / w,
            "water": water / w,
            "warm": warm / w,
            "bright": (r_sum + g_sum + b_sum) / (3*w*255.0),
        })
    return rows


def smooth(vals, k=5):
    n = len(vals); out=[0.0]*n
    for i in range(n):
        s=0.0; c=0
        for j in range(max(0,i-k), min(n,i+k+1)):
            s+=vals[j]; c+=1
        out[i] = s/c
    return out


def detect_sky_band(rows):
    """Devolve a linha em que o céu termina (último y contíguo a partir do topo
    com sky_score significativo). 0 se não houver céu."""
    h = len(rows)
    sky = smooth([r["sky"] for r in rows], 3)
    end = 0
    # bloco contíguo a partir do topo (permite breaks pequenos)
    misses = 0
    for y in range(h):
        if sky[y] >= 0.30:
            end = y
            misses = 0
        else:
            misses += 1
            if misses > 4 and end > 0:
                break
    # Sanity: não considerar mais de 40% da imagem como céu
    return min(end, int(h * 0.40))


def detect_bottom_water(rows):
    """Devolve a linha em que a água/foreground começa, contada a partir do fundo.
    h se não houver banda inferior dedicada."""
    h = len(rows)
    water = smooth([r["water"] for r in rows], 3)
    start = h - 1
    misses = 0
    for y in range(h-1, -1, -1):
        if water[y] >= 0.50:
            start = y
            misses = 0
        else:
            misses += 1
            if misses > 4 and start < h - 1:
                break
    # Não considerar mais de 35% como água-fundo
    return max(start, int(h * 0.65))


def compute_focal_y(path):
    im, orig_w, orig_h = load_rgb(path)
    rows = row_stats(im)
    h = len(rows)

    sky_end = detect_sky_band(rows)
    water_start = detect_bottom_water(rows)
    # Banda de interesse: entre sky_end e water_start (com clamp)
    band_top = max(sky_end, int(h * 0.10))
    band_bot = min(water_start, int(h * 0.92))
    if band_bot - band_top < int(h * 0.15):
        # Banda de interesse muito estreita → usar centro
        band_top = max(sky_end, int(h * 0.25))
        band_bot = min(water_start, int(h * 0.85))

    edge = smooth([r["edge"] for r in rows], 5)
    warm = smooth([r["warm"] for r in rows], 5)

    # Saliência = edge + warm (com pesos)
    sal = [edge[y] + 0.6*warm[y] for y in range(h)]
    # Fora da banda de interesse, score = 0
    weights = [0.0]*h
    for y in range(band_top, band_bot+1):
        weights[y] = sal[y]

    total = sum(weights)
    if total <= 1e-6:
        subject_y_pct = (band_top + band_bot) / 2 / h * 100
    else:
        weighted_y = sum(y*w for y, w in zip(range(h), weights)) / total
        subject_y_pct = weighted_y / max(1, h-1) * 100

    # Converter para focal_Y. Em desktop, a amplificação completa
    # (focal_Y = 50 + (subj-50)/crop_ratio) é demasiado agressiva e satura
    # facilmente em 18/88 — o pequeno erro na detecção de subject_y_pct
    # transforma-se em grande erro de focal_Y. Usar amplificação moderada
    # (média entre desktop e mobile), o que ainda traz o subject para o centro
    # da janela em desktop sem saturar quando o subject está perto dos
    # extremos da foto.
    A_p = orig_w / orig_h
    if A_p < A_HERO:
        crop_ratio_desktop = 1.0 - A_p / A_HERO
        # Usar média entre 1.0 (sem amplif.) e crop_ratio_desktop
        crop_ratio_effective = (1.0 + crop_ratio_desktop) / 2.0
        focal_y = 50 + (subject_y_pct - 50) / crop_ratio_effective
    else:
        focal_y = subject_y_pct

    focal_y = max(MIN_FOCAL, min(MAX_FOCAL, focal_y))
    return int(round(focal_y)), int(round(subject_y_pct)), sky_end*100//h, water_start*100//h


def main():
    data = json.load(open(BEACHES_JSON))
    proposal = {}
    rows_report = []
    processed = 0
    for b in data:
        photos = b.get("photos", [])
        if not photos: continue
        old_focals = b.get("photoFocals", [])
        new_focals = []
        for i, p in enumerate(photos):
            old = old_focals[i] if i < len(old_focals) else 50
            if p.startswith("http"):
                new_focals.append(old); continue
            full = ROOT / p
            if not full.exists():
                new_focals.append(old); continue
            try:
                new, subj, sky_end, water_start = compute_focal_y(full)
            except Exception as e:
                print(f"err {p}: {e}", file=sys.stderr)
                new_focals.append(old); continue
            new_focals.append(new)
            processed += 1
            rows_report.append((b["id"], b["name"], i, p, old, new, new - old, subj, sky_end, water_start))
            if processed % 30 == 0:
                print(f"  ... {processed}")
        proposal[b["id"]] = new_focals

    OUT_JSON.write_text(json.dumps(proposal, ensure_ascii=False, indent=2))

    big = sorted([r for r in rows_report if abs(r[6]) >= 8], key=lambda r: -abs(r[6]))
    lines = [f"# Focal-Y reposicionamento\n",
             f"Fotos analisadas: **{processed}**\n",
             f"|Δ|≥8: **{len(big)}**\n\n",
             "## Top 60 maiores reposicionamentos\n",
             "| Praia | Foto | Antes→Depois | Δ | subj% | sky→ | water← |\n",
             "|---|---|:---:|---:|---:|---:|---:|\n"]
    for r in big[:60]:
        lines.append(f"| {r[1]} | `{r[3]}` | {r[4]}→{r[5]} | {r[6]:+d} | {r[7]} | {r[8]} | {r[9]} |\n")
    lines.append("\n## Todas\n| Praia | Foto | Antes→Depois | Δ | subj% | sky→ | water← |\n|---|---|:---:|---:|---:|---:|---:|\n")
    for r in rows_report:
        lines.append(f"| {r[1]} | `{r[3]}` | {r[4]}→{r[5]} | {r[6]:+d} | {r[7]} | {r[8]} | {r[9]} |\n")
    REPORT_MD.write_text("".join(lines))
    print(f"\nProposta: {OUT_JSON}")
    print(f"Relatório: {REPORT_MD}")


if __name__ == "__main__":
    main()
