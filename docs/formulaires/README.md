# Formulaires imprimables

## Fiche d'inscription 2025-2026

- `fiche-inscription-2025-2026.html` — source (une page = un `<div class="page">`)
- `fiche-inscription-2025-2026.pdf` — version imprimable, **2 pages format Lettre** (recto-verso sur une seule feuille)

À l'impression, choisir **recto-verso, reliure sur le bord long**, échelle 100 % (pas de « ajuster à la page »).

### Contenu

| Page | Sections |
|---|---|
| Recto | Discipline et groupe · Identification de l'athlète · Parent ou tuteur (2 courriels) · Urgence · Santé · Formule et frais (5 versements) · Provenance |
| Verso | Règlement intérieur (6 articles) · Autorisations · Signatures · Encadré administration |

Les champs correspondent aux colonnes du modèle `Member` (Prisma) pour permettre la saisie directe dans l'application.

### Régénérer le PDF

Le HTML référence le logo par le marqueur `LOGO_SRC`, remplacé à la génération par `public/logo.png` encodé en base64 (le PDF reste ainsi autonome).

```bash
node -e "
const fs=require('fs');
const b64=fs.readFileSync('public/logo.png').toString('base64');
const h=fs.readFileSync('docs/formulaires/fiche-inscription-2025-2026.html','utf8');
fs.writeFileSync('/tmp/fiche.html', h.replace(/LOGO_SRC/g,'data:image/png;base64,'+b64));
"

chromium --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=docs/formulaires/fiche-inscription-2025-2026.pdf \
  file:///tmp/fiche.html
```

Vérifier ensuite que le PDF fait bien **exactement 2 pages**.

### Versions

Le numéro de version (`v2025.1`, en en-tête et en pied de page) doit être incrémenté à chaque modification du règlement intérieur. Il correspond au champ `Member.reglementVersion`, qui enregistre la version acceptée lors d'une inscription en ligne.
