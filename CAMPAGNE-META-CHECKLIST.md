# Campagne Meta CSHP — Checklist de création clic par clic

Objectif : campagne « C1 Acquisition » prête à publier le 15 août. Durée estimée : 45-60 min
dans Ads Manager, tout est à copier-coller depuis ce document.

## 0. Prérequis (déjà faits normalement)

- [ ] Business Manager avec page CSHP + compte publicitaire + carte de paiement
- [ ] **Limite de dépense de compte : 700 $** (Paramètres de paiement)
- [ ] Workflow n8n « Rapport Meta Ads » actif
- [ ] **Politique de confidentialité** : Meta EXIGE une URL de politique de confidentialité
  pour les formulaires instantanés. Si centresportifhp.com n'en a pas, il en faut une
  avant de publier (une page simple suffit — demandez-la-moi, je la rédige).

## 1. Les 3 vidéos (avant Ads Manager)

Convention de nommage OBLIGATOIRE (c'est ce nom qui apparaîtra dans les rapports n8n —
sans lui, impossible de savoir quel hook gagne) :

```
U8-vraieclasse-hookA.mp4    U8-vraieclasse-hookB.mp4    U8-vraieclasse-hookC.mp4
JUDO-vraieclasse-hookA.mp4  (etc.)
```

Même corps de vidéo, seules les 2 premières secondes changent. Export : 1080×1920, MP4.

## 2. Créer la campagne

Ads Manager → **Créer** :

| Réglage | Valeur |
|---|---|
| Objectif | **Prospects** |
| Nom de campagne | `CSHP - C1 Acquisition` |
| Catégorie publicitaire spéciale | Aucune |
| Budget de campagne Advantage (CBO) | **Activé — 11 $/jour** |

## 3. Ensemble de publicités n° 1 — Parents U8

| Réglage | Valeur |
|---|---|
| Nom | `Parents U8 (4-7 ans)` |
| Conversion | Formulaires instantanés |
| Page | Page Facebook CSHP |
| Géo | Adresse : **6498 rue Beaubien Est, Montréal** → rayon **+5 km** |
| Âge | **25-45** |
| Genre | Tous |
| Ciblage détaillé | **Laisser vide (large)** — c'est le créatif qui qualifie |
| Langues | Français (tous) |
| Placements | **Advantage+ (automatiques)** |

## 4. Ensemble n° 2 — Parents Judo (dupliquer l'ensemble 1, modifier :)

| Réglage | Valeur |
|---|---|
| Nom | `Parents Judo (6-12 ans)` |
| Âge | **27-48** |
| (tout le reste identique) | |

## 5. Le formulaire instantané (créé une fois, réutilisé partout)

Nom : `Essai gratuit CSHP - Rentrée 2026` · Type : **Volume élevé**

- **Intro** : image du dojo + titre « Réservez l'essai gratuit de votre enfant »
- **Questions** (dans cet ordre) :
  1. Question personnalisée à choix multiples : **« Quel sport ? »** → `Karaté` / `Judo` /
     `Ninjas (4-7 ans)` *(l'orthographe exacte de ces choix alimente le workflow n8n)*
  2. Question personnalisée à choix multiples : **« Âge de l'enfant ? »** → `4-5` / `6-7` /
     `8-10` / `11 et +`
  3. Prénom et nom (pré-rempli)
  4. **Numéro de téléphone (pré-rempli — NE PAS retirer, c'est le champ le plus important)**
  5. Courriel (pré-rempli)
- **Politique de confidentialité** : URL de la page (voir prérequis)
- **Page de remerciement** : « Merci ! Je vous rappelle aujourd'hui même pour réserver
  la place de votre enfant. — [Votre prénom], instructeur-chef CSHP » + bouton
  **« Appeler l'entreprise »** avec votre numéro (convertit les plus pressés en appels
  immédiats).

## 6. Les publicités (3 par ensemble = 6 au total)

Dans chaque ensemble → 3 pubs, une par variante de hook. Nom de la pub = nom du fichier
vidéo (ex. `U8-vraieclasse-hookA`).

**Texte principal — ensemble U8 :**
> Votre enfant de 4 à 7 ans déborde d'énergie ? Nos cours Ninjas la canalisent :
> motricité, discipline et confiance — dans un dojo 100 % matelassé à Anjou. 🥋
> Essai GRATUIT en septembre. Groupes limités à 25 enfants.
> Réservez sa place en 30 secondes ⬇️

**Titre** : `Essai gratuit — Ninjas 4-7 ans (Anjou)` · **CTA** : S'inscrire

**Texte principal — ensemble Judo :**
> Le judo apprend à tomber… et à se relever. Confiance, respect et discipline pour
> les 6-12 ans, avec des entraîneurs certifiés — à Anjou / Saint-Léonard. 🥋
> Essai GRATUIT en septembre. Places limitées par groupe.
> Réservez en 30 secondes ⬇️

**Titre** : `Essai gratuit — Judo 6-12 ans (Anjou)` · **CTA** : S'inscrire

## 7. Publier et lancer

- [ ] Publier → les pubs passent « En examen » (jusqu'à 24 h — d'où l'intérêt de publier
  le 13-14 pour un départ réel le 15)
- [ ] Vérifier le lendemain que les 6 pubs sont « Actives »
- [ ] **Ne RIEN toucher pendant 72 h** (phase d'apprentissage de Meta — chaque modification
  la fait repartir de zéro)
- [ ] Chaque soir, 15 min : rappeler les leads du jour (2 créneaux proposés, jamais
  « quand voulez-vous ? »), relances J+1 SMS / J+3 appel / J+7 dernier SMS
- [ ] Lundi et jeudi : lire le verdict n8n (`cshp_ads_journal` / `cshp_ads_analyses`) et
  appliquer : COUPER / GARDER / SCALER. En cas de doute, me demander « feedback sur mes
  pubs ».

## Rappel des kill rules (automatisées dans n8n)

| Situation | Action |
|---|---|
| 50 $ dépensés, 0 lead | Couper la pub |
| CPL > 15 $ sur 5 jours | Changer le hook (pas l'audience) |
| CPL ≤ 8 $ et ≥ 3 leads | +20 % de budget max |
| Pub qui performe | NE PAS Y TOUCHER |
