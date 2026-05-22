#!/usr/bin/env python3
"""
Processa as fotos de brand_assets/fotos/Praias Fluviais 2025 Fotos/
- Redimensiona para max 1600px de largura
- Aplica marca de água visível (logo + texto diagonal repetido)
- Output em img/praias/{concelho-slug}/{praia-slug}/{n}.jpg
- Atualiza data/beaches.json com novos paths
- Imprime relatório completo de divergências
"""
import json, os, re, sys, unicodedata, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PHOTOS_ROOT = ROOT / "brand_assets/fotos/Praias Fluviais 2025 Fotos"
OUT_ROOT = ROOT / "img/praias"
BEACHES_JSON = ROOT / "data/beaches.json"
LOGO_PATH = ROOT / "brand_assets/logotipo.png"

MAX_W = 1600
JPEG_Q = 82
# ┌────────────────────────────────────────────────────────────────────────┐
# │ Spec da marca de água — DEVE ficar em sincronia com js/watermark.js    │
# │ Apenas logo discreto no canto superior direito.                        │
# └────────────────────────────────────────────────────────────────────────┘
WM_LOGO_WIDTH_PCT      = 0.10    # logo: % da largura da imagem (~160px em 1600)
WM_LOGO_ALPHA_FACTOR   = 0.50    # opacidade do logo (discreto mas visível)
WM_LOGO_PAD_RIGHT_PCT  = 0.018   # padding horizontal (à direita)
# Posição vertical FIXA — idêntica em todas as imagens (top da imagem).
# Para a página de praia, beach-page.js sobrepõe um logo CSS no carrossel
# (garante visibilidade mesmo em fotos retrato cuja parte de cima é cortada).
WM_LOGO_PAD_TOP_PCT    = 0.022   # padding vertical (topo da imagem)
# Backdrop arredondado discreto atrás do logo para garantir contraste
WM_BACKDROP_PAD_PCT    = 0.020   # quanto o backdrop excede o logo (cada lado)
WM_BACKDROP_ALPHA      = 45      # opacidade do backdrop escuro

# ----- utils ---------------------------------------------------------------
def strip_accents(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')

def norm(s):
    s = strip_accents(s.lower().strip())
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def slug(s):
    s = strip_accents(s.lower().strip())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return re.sub(r'-+', '-', s)

def beach_keywords(name):
    n = norm(name)
    for prefix in ['praia fluvial de ', 'praia fluvial do ', 'praia fluvial da ',
                   'praia fluvial das ', 'praia fluvial dos ', 'praia fluvial ',
                   'zona balnear de ', 'zona balnear do ', 'zona balnear da ',
                   'zona balnear das ', 'zona balnear dos ', 'zona balnear ',
                   'parque fluvial de ', 'parque fluvial do ', 'parque fluvial da ',
                   'parque fluvial ', 'praia de ', 'praia do ', 'praia da ',
                   'praia das ', 'praia dos ', 'praia ', 'parque ', 'pego ', 'poco ',
                   'areal de ', 'areal do ', 'areal da ', 'zona de lazer de ']:
        if n.startswith(prefix):
            n = n[len(prefix):]
            break
    return n

# ----- watermark -----------------------------------------------------------
def make_watermark(size, logo, focal_y_pct=50):
    """Marca de água: pequeno logo branco translúcido com backdrop subtil,
    no canto superior direito da imagem (posição FIXA, idêntica em todas)."""
    w, h = size
    wm = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    logo_w = int(w * WM_LOGO_WIDTH_PCT)
    ratio = logo_w / logo.width
    logo_h = int(logo.height * ratio)
    logo_resized = logo.resize((logo_w, logo_h), Image.LANCZOS)

    pad_right = int(w * WM_LOGO_PAD_RIGHT_PCT)
    pad_top = int(w * WM_LOGO_PAD_TOP_PCT)
    pos = (w - logo_w - pad_right, pad_top)

    # Backdrop arredondado e suavizado atrás do logo
    bp = int(w * WM_BACKDROP_PAD_PCT)
    backdrop = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(backdrop)
    bd.rounded_rectangle(
        [pos[0] - bp, pos[1] - bp, pos[0] + logo_w + bp, pos[1] + logo_h + bp],
        radius=int(logo_h * 0.5),
        fill=(0, 0, 0, WM_BACKDROP_ALPHA)
    )
    backdrop = backdrop.filter(ImageFilter.GaussianBlur(radius=int(logo_h * 0.25)))

    alpha = logo_resized.split()[3]
    white = Image.new('RGBA', logo_resized.size, (255, 255, 255, 0))
    white.putalpha(alpha.point(lambda p: int(p * WM_LOGO_ALPHA_FACTOR)))

    wm = Image.alpha_composite(wm, backdrop)
    wm.alpha_composite(white, pos)
    return wm

def compute_focal_y(src_path):
    """Calcula o ponto focal vertical (0–100) de uma foto.

    Usa duas métricas combinadas:
      1) Centróide ponderado por (arestas + variância)^1.5 (emphasis em picos)
      2) Mediana cumulativa: row onde 50% do "interesse" total fica acima
    O focal final é o maior dos dois — puxa para baixo quando há céu uniforme
    no topo, mantendo-se centrado em fotos sem céu.
    Adicionalmente, deteta uma "faixa de céu" no topo e força o focal para
    baixo do fim dela quando necessário.
    """
    try:
        img = Image.open(src_path)
        img = ImageOps.exif_transpose(img).convert('L')
    except Exception:
        return 50
    img.thumbnail((220, 220))
    w, h = img.size
    edges = img.filter(ImageFilter.FIND_EDGES)
    epx = edges.load()
    gpx = img.load()

    row_score = [0.0] * h
    for y in range(h):
        s = 0
        row_lum = 0
        for x in range(w):
            s += epx[x, y]
            row_lum += gpx[x, y]
        mean = row_lum / w
        var = 0.0
        for x in range(w):
            d = gpx[x, y] - mean
            var += d * d
        var /= w
        row_score[y] = s + 0.4 * math.sqrt(var) * w

    if not row_score or max(row_score) == 0:
        return 50

    # 1) Centróide com power weighting (^1.6 amplifica picos)
    powered = [s ** 1.6 for s in row_score]
    total_p = sum(powered) or 1
    centroid = sum(y * powered[y] for y in range(h)) / total_p
    centroid_pct = centroid / h * 100

    # 2) Mediana cumulativa
    total = sum(row_score) or 1
    target = total * 0.5
    cum = 0.0
    median_row = h // 2
    for y in range(h):
        cum += row_score[y]
        if cum >= target:
            median_row = y
            break
    median_pct = median_row / h * 100

    # 3) Sky-band detection: rows com score < 30% da mediana são "céu/uniforme"
    sorted_scores = sorted(row_score)
    med = sorted_scores[len(sorted_scores) // 2]
    sky_threshold = med * 0.30
    sky_end = 0
    for y in range(h):
        if row_score[y] > sky_threshold:
            sky_end = y
            break
        sky_end = y + 1
    sky_pct = (sky_end / h) * 100

    # Combinar: usar o focal mais agressivo (mais baixo) entre os três
    # critérios — desde que o sky_pct indique pelo menos 8% de céu.
    focal = max(centroid_pct, median_pct)
    if sky_pct >= 8:
        # Posiciona focal a meio do que sobra abaixo do céu
        sky_aware = (sky_pct + 100) / 2
        focal = max(focal, sky_aware * 0.85 + 50 * 0.15)

    return max(25, min(80, round(focal)))


def process_image(src_path, dst_path, logo, focal_y_pct=50):
    img = Image.open(src_path)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg

    if img.width > MAX_W:
        h = int(img.height * MAX_W / img.width)
        img = img.resize((MAX_W, h), Image.LANCZOS)

    img_rgba = img.convert('RGBA')
    wm = make_watermark(img.size, logo, focal_y_pct=focal_y_pct)
    out = Image.alpha_composite(img_rgba, wm).convert('RGB')

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst_path, 'JPEG', quality=JPEG_Q, optimize=True, progressive=True)

# ----- main ----------------------------------------------------------------
def main():
    if not LOGO_PATH.exists():
        sys.exit(f"Missing logo: {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert('RGBA')

    with open(BEACHES_JSON) as f:
        beaches = json.load(f)

    site_by_concelho = {}
    for b in beaches:
        cn = norm(b['municipality'])
        site_by_concelho.setdefault(cn, []).append(b)

    folder_data = {}
    for cd in sorted(PHOTOS_ROOT.iterdir()):
        if not cd.is_dir(): continue
        raw = cd.name
        display = re.sub(r'\s*2025\s*$', '', raw).strip()
        cn = norm(display)
        praias = {}
        for pd in sorted(cd.iterdir()):
            if not pd.is_dir(): continue
            photos = sorted([p for p in pd.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp')])
            praias[pd.name] = photos
        folder_data[cn] = {'display': display, 'praias': praias}

    paying_concelhos = sorted(info['display'] for info in folder_data.values())

    # Manual overrides for known mismatches (folder_keyword -> site_keyword)
    overrides = {
        ('guarda', 'valelhas'): 'valhelhas',
    }

    assignments = []   # (beach, folder_concelho, folder_praia, photo_list)
    folder_orphans = []
    site_orphans = []
    matched_site_ids = set()

    for cn, info in folder_data.items():
        site_beaches = site_by_concelho.get(cn, [])
        if not site_beaches:
            print(f"  ⚠ Concelho '{info['display']}' está na pasta mas NÃO existe no site")
            continue
        site_index = {beach_keywords(b['name']): b for b in site_beaches}
        used_site = set()

        for praia_folder, photos in info['praias'].items():
            if not photos:
                folder_orphans.append((info['display'], praia_folder, 0, 'pasta vazia'))
                continue
            pk = beach_keywords(praia_folder)
            pk = overrides.get((cn, pk), pk)

            beach = None
            if pk in site_index and id(site_index[pk]) not in used_site:
                beach = site_index[pk]
            else:
                for sk, b2 in site_index.items():
                    if id(b2) in used_site: continue
                    if pk and (pk in sk or sk in pk):
                        beach = b2; break
            if beach is None:
                pkw = set(w for w in pk.split() if len(w) > 3)
                best, best_s = None, 0
                for sk, b2 in site_index.items():
                    if id(b2) in used_site: continue
                    sw = set(w for w in sk.split() if len(w) > 3)
                    s = len(pkw & sw)
                    if s > best_s: best_s, best = s, b2
                if best and best_s >= 1: beach = best

            if beach:
                used_site.add(id(beach))
                matched_site_ids.add(beach['id'])
                assignments.append((beach, info['display'], praia_folder, photos))
            else:
                folder_orphans.append((info['display'], praia_folder, len(photos), 'sem correspondência'))

        for b in site_beaches:
            if b['id'] not in matched_site_ids and id(b) not in used_site:
                site_orphans.append((info['display'], b['name'], b['id']))

    # ---- process photos and update beaches.json
    print(f"\n→ A processar {len(assignments)} praias...")
    total_photos = 0
    new_paths_by_id = {}
    new_focals_by_id = {}

    for beach, concelho, praia_folder, photos in assignments:
        concelho_slug = slug(concelho)
        praia_slug = slug(praia_folder)
        new_paths = []
        new_focals = []
        for i, src in enumerate(photos, 1):
            dst = OUT_ROOT / concelho_slug / praia_slug / f"{i}.jpg"
            try:
                focal = compute_focal_y(src)
                process_image(src, dst, logo, focal_y_pct=focal)
                rel = dst.relative_to(ROOT).as_posix()
                new_paths.append(rel)
                new_focals.append(focal)
                total_photos += 1
            except Exception as e:
                print(f"  ✗ Erro em {src.name}: {e}")
        if new_paths:
            new_paths_by_id[beach['id']] = new_paths
            new_focals_by_id[beach['id']] = new_focals
            avg = sum(new_focals) / len(new_focals)
            print(f"  ✓ {beach['name']} ({len(new_paths)} fotos · foco médio {avg:.0f}%)")

    # Update JSON — apenas o array `photos` e `photoFocals`; thumbnail é editada manualmente no admin.
    for b in beaches:
        if b['id'] in new_paths_by_id:
            b['photos'] = new_paths_by_id[b['id']]
            b['photoFocals'] = new_focals_by_id[b['id']]

    BEACHES_JSON.write_text(json.dumps(beaches, indent=2, ensure_ascii=False))
    print(f"\n✓ {total_photos} fotos processadas, {len(new_paths_by_id)} praias atualizadas")

    # ---- write report
    report = []
    report.append("# Relatório de fotos das praias\n")
    report.append(f"Concelhos pagantes (com pasta): **{len(paying_concelhos)}**\n")
    report.append("\n".join(f"- {c}" for c in paying_concelhos) + "\n")

    report.append(f"\n## Praias atualizadas com fotos reais: {len(new_paths_by_id)}\n")

    report.append(f"\n## Praias em pasta SEM correspondência no site ({len(folder_orphans)})\n")
    for c, p, n, why in folder_orphans:
        report.append(f"- **[{c}]** {p} ({n} fotos) — _{why}_")

    report.append(f"\n## Praias no site SEM fotos na pasta (concelhos pagantes) — {len(site_orphans)}\n")
    by_c = {}
    for c, n, i in site_orphans:
        by_c.setdefault(c, []).append((n, i))
    for c, lst in sorted(by_c.items()):
        report.append(f"\n### {c} ({len(lst)})")
        for n, i in lst:
            report.append(f"- {n}  `({i})`")

    # Concelhos no site sem pasta
    no_folder_concelhos = []
    for cn, lst in site_by_concelho.items():
        if cn not in folder_data:
            no_folder_concelhos.append((lst[0]['municipality'], len(lst)))
    report.append(f"\n\n## Concelhos NO SITE mas SEM pasta de fotos ({len(no_folder_concelhos)})\n")
    for c, n in sorted(no_folder_concelhos):
        report.append(f"- {c} ({n} praias)")

    (ROOT / "scripts" / "_photo-report.md").write_text("\n".join(report))
    print(f"\n→ Relatório em scripts/_photo-report.md")

if __name__ == '__main__':
    main()
