# KPI & tracking — piloter avec 15 minutes par semaine

Deux outils, tous deux dans Google Sheets (modèles dans [templates/](templates/)) :

1. **Tracker de leads** ([leads-tracker.csv](templates/leads-tracker.csv)) — une ligne par lead, remplie au fil de l'eau. Les premières colonnes arrivent automatiquement via l'intégration Meta; le reste se remplit à la main en 30 secondes par lead.
2. **KPI hebdo** ([kpi-hebdo.csv](templates/kpi-hebdo.csv)) — une ligne par semaine, remplie le dimanche soir en 15 minutes à partir du Gestionnaire de publicités + du tracker.

---

## 1. Les seuils de pilotage

| Indicateur | 🟢 Bon | 🟡 À surveiller | 🔴 Agir |
|---|---|---|---|
| CTR | > 1,5 % | 1,0 - 1,5 % | < 1,0 % |
| CPL | < 20 $ | 20 - 30 $ | > 30 $ |
| Fréquence (même personne voit la pub) | < 2,5 | 2,5 - 3,5 | > 3,5 |
| Show-up (lead → présent à l'essai) | > 65 % | 50 - 65 % | < 50 % |
| Closing (essai → membre) | > 55 % | 40 - 55 % | < 40 % |
| CAC | < 75 $ | 75 - 150 $ | > 150 $ |
| Churn mensuel | < 3 % | 3 - 5 % | > 5 % |
| Délai moyen 1er contact | < 5 min | 5 - 30 min | > 30 min |

**Règle de lecture :** on ne réagit jamais à une journée. On réagit à une semaine complète (phase test : deux semaines).

---

## 2. Diagnostic : quel maillon est cassé ?

Le funnel se lit de haut en bas — on répare **le premier maillon rouge**, pas tout en même temps :

### 🔴 CTR < 1 % ou CPL > 30-40 $ → problème de CRÉATIF
Personne ne s'arrête sur la vidéo, ou elle « sent la pub ».
- Refaire les 3 premières secondes (action immédiate, question choc)
- Tourner une vidéo « selfie naturel » : vous, devant la bâtisse, comme un message vocal vidéo à un ami — « Salut les parents de Rosemont… ». C'est le format anti-pub par excellence.
- Vérifier que les sous-titres sont là et lisibles
- Ne PAS toucher à l'audience ni au budget — le problème est presque jamais là à ce stade

### 🔴 CPL correct mais show-up < 50 % → problème de SUIVI
Les leads sont bons mais se refroidissent avant l'essai.
- Chronométrer votre vrai délai de premier contact (colonne du tracker) — la cause n°1 est toujours un rappel trop lent
- Vérifier que le paiement du 19 $ se fait À LA RÉSERVATION (c'est lui qui verrouille la présence), pas sur place
- Rappels J-1 et 2 h systématiques
- Si les leads ne répondent juste pas au téléphone : ajouter la 3e question au formulaire (« Êtes-vous prêt à vous déplacer au 6498 Beaubien Est ? ») — moins de leads, mais des vrais

### 🔴 Show-up correct mais closing < 40 % → problème d'EXPÉRIENCE ou de PITCH
Le problème n'est plus Meta, il est dans le gym.
- Le protocole d'accueil est-il appliqué à la lettre (prénom, t-shirt, buddy, réussites visibles) ?
- Le closing a-t-il lieu **le jour même**, pendant que l'enfant est encore sur son nuage — ou « on s'en reparle » ?
- L'offre du jour (frais d'ouverture −50 %) est-elle proposée avec une vraie raison ?
- Demander aux non-inscrits, sans défensive : « Qu'est-ce qui a fait pencher la balance ? » — trois réponses identiques = la vraie cause

### 🔴 Tout est vert mais pas assez de volume → problème de BUDGET, enfin
C'est le seul cas où la réponse est « plus d'argent ». Appliquer la règle de réinvestissement de [02-economie-unitaire.md](02-economie-unitaire.md).

---

## 3. La routine

**Chaque jour (5 min) :** répondre aux leads (règle des 5 minutes), tenir le tracker à jour.

**Chaque dimanche (15 min) :** remplir la ligne KPI hebdo; vérifier les seuils; noter UNE décision pour la semaine (ou « ne rien changer », qui est souvent la bonne).

**Chaque fin de mois (30 min) :** CAC du mois, nouveaux revenus récurrents, churn; décision de réinvestissement; état vs seuil de rentabilité ([02-economie-unitaire.md](02-economie-unitaire.md)).

**Jalons go/no-go du plan 90 jours :**

| Date | Jalon | Critère |
|---|---|---|
| ~26 juillet | Fin phase 0 | Faux lead traverse tout le système automatiquement |
| ~9 août | Bilan 14 jours | CTR > 1,2 %, CPL < 30 $ — sinon plan B créatif |
| ~23 août | Décision budget rentrée | CAC < 100 $ → option 15-20 $/jour pour 3 semaines |
| ~13 sept | Bilan pic | ≥ 8-10 inscriptions cumulées — sinon diagnostic complet section 2 |
| ~11 oct | Bilan 90 jours | CAC, churn, écart au seuil de rentabilité → plan T4 + janvier |
