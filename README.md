# PDV Florence v2 — brouillon (refonte copy du 15/09/2026)

## Où
- Source figée : `~/Desktop/pdv-help-deploy/florence/index.html` (= le live, jamais modifié par ce build)
- Contenu FR de la refonte : `content_fr.py`
- Transformations : `build.py` (chaque modif est assertée : `count == 1`)
- Sortie : `out/florence-v2/index.html`

## Rebuild
    cd ~/Desktop/pdv-v2 && python3 build.py

## Déploiement du brouillon
Glisser le dossier `out/florence-v2` à la RACINE du repo `rudolph-expometro/expometro-leads-v1`.
→ https://artinthe.city/florence-v2 (noindex, nofollow ; FR forcé ; aucune ads dessus)
Dossier neuf à la racine : ne touche ni `florence/`, ni `fr/`, ni `florence/img/`.

## Tests
- `?hero=A` (défaut) / `?hero=B` / `?hero=C` — les 3 variantes de hero du brief §5.1
- `?cur=USD|GBP|AUD|CAD|HKD|CNY|EUR` — devise

## Ce que le build fait
1. Nouvel ordre du tour : idée → ce que tu reçois → ils l'ont fait → comment ça se passe → choisis ta place
2. Étape 1 « L'idée » créée (bloc mécanisme §5.2 mot pour mot) + chiffres traités comme des chiffres
3. Prix retiré du hero, révélé après la valeur
4. Étape 2 hiérarchisée (3 bénéfices dominants), le détail des dépenses part en FAQ
5. En-tête de preuve sur l'étape 3 (photo de groupe + 2018/19/6 000+/100+)
6. Correctifs §9 (4-5 min, jusqu'à 100 000, simple photo, rareté) et §8 (jury, prix montent)
7. CSS ajouté (statrow / reveal / hiérarchie) — aucune modification du design existant
