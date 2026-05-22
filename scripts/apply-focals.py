#!/usr/bin/env python3
"""
Aplica os focal-Y propostos a data/beaches.json.
Combina:
1) Resultado do analisador (scripts/_focals-proposal.json)
2) Overrides manuais (fotos onde o algoritmo falhou após inspecção visual)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BEACHES_JSON = ROOT / "data/beaches.json"
PROPOSAL_JSON = ROOT / "scripts/_focals-proposal.json"

# Overrides manuais (path da foto → focal_Y inspeccionado visualmente)
# Casos em que o algoritmo deu valores claramente errados — confirmado por leitura visual.
OVERRIDES = {
    # ─ Aerial com subject no MEIO mas alg empurrou p/ topo (capped 35) ─
    "img/praias/oliveira-do-hospital/avo/2.jpg":               55,
    "img/praias/oliveira-de-frades/carrica/2.jpg":             55,
    "img/praias/penacova/vimieiro/3.jpg":                      55,
    "img/praias/penacova/vimieiro/4.jpg":                      55,
    "img/praias/covilha/paul/1.jpg":                           50,
    "img/praias/serta/ribeira-grande/2.jpg":                   52,
    "img/praias/guarda/aldeia-vicosa/3.jpg":                   58,
    "img/praias/oliveira-do-hospital/alvoco-das-varzeas/2.jpg":50,
    "img/praias/pedrogao-grande/cabril/1.jpg":                 58,
    "img/praias/pedrogao-grande/mosteiro/2.jpg":               55,
    "img/praias/mirandela/ponte-da-pedra/2.jpg":               55,
    "img/praias/leiria/lagoa-da-ervedeira/2.jpg":              68,
    "img/praias/proenca-a-nova/froia/1.jpg":                   58,
    "img/praias/covilha/ourondo/3.jpg":                        58,
    "img/praias/oliveira-do-hospital/avo/3.jpg":               65,
    "img/praias/oliveira-do-hospital/avo/1.jpg":               55,
    "img/praias/braga/merelim/1.jpg":                          68,
    "img/praias/penamacor/meimao/2.jpg":                       65,
    "img/praias/satao/trabulo/3.jpg":                          60,
    "img/praias/sernancelhe/vila-da-ponte/2.jpg":              55,

    # ─ Alg empurrou demasiado p/ baixo (saturou no 76) — subject está no MEIO ─
    "img/praias/sernancelhe/vila-da-ponte/1.jpg":              60,  # coração+lago centro
    "img/praias/satao/trabulo/1.jpg":                          42,  # edifícios meio-superior
    "img/praias/satao/trabulo/2.jpg":                          55,  # nadador-salvador centro
    "img/praias/mirandela/albino-mendo/2.jpg":                 55,  # areal+rio centro
    "img/praias/gaviao/alamal/3.jpg":                          50,  # baloiço GAVIÃO meio-superior
    "img/praias/penamacor/o-moinho/1.jpg":                     48,  # pessoa na ponte meio
    "img/praias/sabugal/penalobo/3.jpg":                       55,  # escultura+sinais meio
    "img/praias/figueiro-dos-vinhos/fragas-de-sao-simao/1.jpg":60,  # cascata meio
    "img/praias/odemira/odemira/2.jpg":                        58,  # crianças+bandeiras meio
    "img/praias/odemira/santa-clara/2.jpg":                    58,  # caminho+chapéus meio
    "img/praias/sabugal/badamalos/1.jpg":                      58,  # rio+grama meio
    "img/praias/sao-pedro-do-sul/ucha/2.jpg":                  58,  # arco entrada centro
    "img/praias/ferreira-do-zezere/lago-azul/1.jpg":           60,  # plataforma flutuante centro
    "img/praias/penacova/cornicovo/5.jpg":                     60,  # ponte+rio centro
    "img/praias/penacova/reconquinho/1.jpg":                   65,  # areal+sinal meio-baixo
}


def main():
    data = json.load(open(BEACHES_JSON))
    proposal = json.load(open(PROPOSAL_JSON))

    changes = 0
    overrides_applied = 0
    for b in data:
        photos = b.get("photos", [])
        if not photos:
            continue
        old_focals = b.get("photoFocals", [])
        prop_focals = proposal.get(b["id"], [])
        new_focals = []
        for i, p in enumerate(photos):
            old = old_focals[i] if i < len(old_focals) else 50
            # Manual override?
            if p in OVERRIDES:
                new = OVERRIDES[p]
                overrides_applied += 1
            elif p.startswith("http"):
                new = old
            elif i < len(prop_focals):
                new = prop_focals[i]
            else:
                new = old
            if new != old:
                changes += 1
            new_focals.append(new)
        b["photoFocals"] = new_focals

    BEACHES_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"✓ Aplicado a {BEACHES_JSON}")
    print(f"  Total alterações: {changes}")
    print(f"  Overrides manuais aplicados: {overrides_applied}/{len(OVERRIDES)}")


if __name__ == "__main__":
    main()
