#!/usr/bin/env python3
"""
Aplica um shift descendente global aos focal_Y de todas as fotos de praia,
seguindo o feedback de que a maioria das praias está na parte inferior das
fotos (especialmente em fotos aéreas).

Regra:
- +10 a todas as fotos
- Exceptions: lista de fotos onde o assunto está claramente NO MEIO da imagem
  e um shift descendente seria errado (escultura, ponte ao centro, etc.)
- Clamp final [40, 92]
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BEACHES_JSON = ROOT / "data/beaches.json"

SHIFT = 8
MIN_FOCAL = 55
MAX_FOCAL = 92

# Fotos onde o assunto está NO MEIO da imagem — NÃO devem ser empurradas mais
# para baixo. Estes valores foram fixados após inspecção visual.
KEEP_AS_IS = {
    "img/praias/satao/trabulo/1.jpg":                          42,  # edifícios meio-superior
    "img/praias/sernancelhe/vila-da-ponte/1.jpg":              60,  # coração+lago centro
    "img/praias/gaviao/alamal/3.jpg":                          50,  # baloiço GAVIÃO meio
    "img/praias/penamacor/o-moinho/1.jpg":                     48,  # pessoa na ponte meio
    "img/praias/sabugal/penalobo/3.jpg":                       55,  # escultura+sinais meio
    "img/praias/figueiro-dos-vinhos/fragas-de-sao-simao/1.jpg":60,  # cascata+pessoa meio
    "img/praias/penacova/cornicovo/5.jpg":                     58,  # ponte+rio meio
    "img/praias/serta/ribeira-grande/2.jpg":                   52,  # mulher no açude meio
    "img/praias/mirandela/albino-mendo/2.jpg":                 55,  # areal+rio meio
    "img/praias/satao/trabulo/2.jpg":                          55,  # nadador-salvador meio
}


def main():
    data = json.load(open(BEACHES_JSON))
    changed = 0
    kept = 0
    for b in data:
        photos = b.get("photos", [])
        if not photos:
            continue
        focals = b.get("photoFocals", [])
        new_focals = []
        for i, p in enumerate(photos):
            old = focals[i] if i < len(focals) else 50
            if p in KEEP_AS_IS:
                new = KEEP_AS_IS[p]
                kept += 1
            elif p.startswith("http"):
                new = old
            else:
                new = old + SHIFT
                new = max(MIN_FOCAL, min(MAX_FOCAL, new))
            if new != old:
                changed += 1
            new_focals.append(new)
        b["photoFocals"] = new_focals

    BEACHES_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"✓ Aplicado a {BEACHES_JSON}")
    print(f"  Alteradas:  {changed}")
    print(f"  Mantidas:   {kept} (assunto no meio)")


if __name__ == "__main__":
    main()
