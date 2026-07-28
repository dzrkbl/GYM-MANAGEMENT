# CSHP — Gestion marketing (stratégie + suivi)

**Centre Sportif de Haute-Performance — 6498 Beaubien Est, Montréal**

Cet espace regroupe **tout le marketing du club** en deux couches :

| Couche | Où | Rôle |
|---|---|---|
| **📊 Suivi (gestion courante)** | [suivi/](suivi/) | Ce qui se passe MAINTENANT : campagnes, budget, créatifs testés, ce qui a fonctionné/moins fonctionné, décisions. **À ouvrir chaque semaine.** |
| **📘 Stratégie (le playbook 90 jours)** | fichiers `01-…` à `09-…` ci-dessous | Le plan, les scripts, la config des ads, les seuils. **À lire une fois, à consulter au besoin.** |

### La routine hebdo (vendredi, 15 minutes)

1. Ouvrir [suivi/tableau-de-bord.md](suivi/tableau-de-bord.md) — c'est le point d'entrée.
2. Remplir la ligne de la semaine dans le [CSV KPI](templates/kpi-hebdo.csv) (Google Sheets).
3. Mettre à jour [suivi/campagnes.md](suivi/campagnes.md) et trancher les verdicts créatifs ([suivi/creatifs.md](suivi/creatifs.md)).
4. Noter toute décision dans [suivi/journal-decisions.md](suivi/journal-decisions.md) ; toute leçon prouvée dans [suivi/apprentissages.md](suivi/apprentissages.md).
5. En fin de mois : fermer le mois dans [suivi/budget.md](suivi/budget.md).

### Lien avec l'application de gestion

Les pubs alimentent directement l'app CSHP : les demandes d'info aboutissent dans le
module **Prospects** (relance automatique à J+3), le formulaire d'**inscription en
ligne** signe le règlement et déclenche le courriel de bienvenue, et les rappels de
paiement/renouvellement sont automatisés. Doctrine complète de l'app :
[../DOCUMENTATION.md](../DOCUMENTATION.md).

> *Origine : le playbook ci-dessous a été produit dans le dépôt META-ADS (branche
> `claude/martial-arts-club-strategy-qoao7s`) puis rapatrié ici le 2026-07-28 pour
> tout centraliser — voir [suivi/journal-decisions.md](suivi/journal-decisions.md).*

---

# 📘 Le playbook — Plan de rentabilité & stratégie Meta Ads (90 jours)

Plan couvrant la période du **14 juillet au 11 octobre 2026**, construit autour de la rentrée scolaire (fin août), la meilleure fenêtre d'acquisition de l'année pour un club d'arts martiaux jeunesse.

---

## Ordre de lecture

| Fichier | Contenu | Quand le lire |
|---|---|---|
| [01-plan-90-jours.md](01-plan-90-jours.md) | Le plan semaine par semaine, avec dates réelles et checklists | **Maintenant** |
| [02-economie-unitaire.md](02-economie-unitaire.md) | Les vrais chiffres : ce que 300 $/mois peut donner, seuil de rentabilité | **Maintenant** |
| [03-offre-et-tarifs.md](03-offre-et-tarifs.md) | Grille tarifaire, offre d'appel 19 $, positionnement vs concurrence | Semaine 1 |
| [04-meta-ads-setup.md](04-meta-ads-setup.md) | Configuration exacte des campagnes + infrastructure gratuite | Semaine 1-2 |
| [05-creatifs-et-annonces.md](05-creatifs-et-annonces.md) | Scripts vidéo à tourner + textes d'annonces prêts à coller | Semaine 1-2 |
| [06-funnel-et-suivi.md](06-funnel-et-suivi.md) | SMS, courriels, script d'appel, script de closing — mot à mot | Semaine 2 |
| [07-kpi-et-tracking.md](07-kpi-et-tracking.md) | Tableaux de bord, seuils go/no-go, plan B | Semaine 3+ |
| [08-leviers-complementaires.md](08-leviers-complementaires.md) | Parrainage, kickboxing femmes, écoles, location, journées pédago | Semaine 2+ |
| [templates/](templates/) | Fichiers CSV à importer dans Google Sheets (suivi leads + KPI) | Semaine 2 |

---

## Le résumé en 60 secondes

**Votre situation :** club non rentable, budget pub de 300 $/mois, plusieurs programmes solides (U8 combiné, karaté compétitif, judo, kickboxing femmes, privé) mais pas assez de membres.

**Le plan :**

1. **Semaines 1-2 (14-26 juillet)** — Installer l'infrastructure gratuite (formulaires Meta + Google Sheets + Brevo), lancer l'offre d'appel « Pass Découverte 19 $ », tourner 2 vidéos au cellulaire, lancer le programme de parrainage à l'interne.
2. **Semaines 3-6 (27 juillet - 23 août)** — Tester les ads à 10 $/jour, roder le suivi « 5 minutes », préparer la journée portes ouvertes.
3. **Semaines 7-9 (24 août - 13 sept)** — **Le pic de la rentrée.** Pousser le créatif gagnant, portes ouvertes le samedi 29 août, convertir un maximum d'essais.
4. **Semaines 10-13 (14 sept - 11 oct)** — Consolider : rétention, relance des essais non convertis, approche des écoles pour la session d'hiver, bilan et décision de réinvestissement.

**Attente honnête à 300 $/mois :** 4 à 8 nouveaux membres par mois via les ads (voir [02-economie-unitaire.md](02-economie-unitaire.md)). C'est réel et rentable, mais **les ads seules ne suffiront pas** à redresser le club. C'est la combinaison ads + parrainage + rentrée + rétention + leviers complémentaires qui fait le travail. Le plan couvre les cinq.

---

## ⚠️ Trois mises en garde importantes sur la recherche NotebookLM

Le travail que vous avez fait avec NotebookLM est solide et la majorité des recommandations sont reprises ici. Mais trois points méritent votre attention avant d'agir :

### 1. Les projections de scénarios ne collent pas avec votre budget

NotebookLM propose un scénario « réaliste » de 120-150 membres — mais il exige 1 500 à 3 500 $/mois de marketing. **À 300 $/mois, votre trajectoire est le scénario conservateur** (50-75 membres actifs via acquisition payante sur 12 mois), bonifié par les leviers gratuits. Le fichier [02-economie-unitaire.md](02-economie-unitaire.md) refait les maths honnêtement et donne une **règle de réinvestissement** pour monter le budget au fur et à mesure que les revenus rentrent — c'est comme ça qu'on passe au scénario supérieur sans se mettre à risque.

### 2. La recommandation « ouvrez plutôt un club de BJJ » ne s'applique pas à vous

L'analyse de marché de NotebookLM conclut qu'ouvrir un club de karaté/judo sur l'axe Beaubien est « déconseillé » à cause de la saturation, et recommande le BJJ. **Cette analyse s'adresse à un nouvel entrant — pas à vous.** Vous êtes déjà établi, avec des différenciateurs réels qu'aucun concurrent listé ne combine :

- **Le programme U8 combiné karaté + judo** — unique dans la zone, et parfait pour le parent indécis;
- **Un entraîneur-chef actif en compétition** (circuit Karaté Québec) — argument massue contre les « usines à ceintures »;
- **Un plateau d'entraînement complet** (rack, functional trainer, sleds…) qu'aucun dojo de quartier n'a.

La bonne conclusion n'est pas « changez de discipline », c'est « martelez ces trois différenciateurs dans chaque pub ». Les deux vrais trous de marché identifiés (tarification mensuelle flexible, volet aide aux devoirs) sont intégrés au plan — le premier tout de suite, le second comme option phase 2.

### 3. Vérifiez les faits locaux avant de bâtir dessus

NotebookLM peut inventer ou déformer des détails avec assurance. Avant de calibrer vos prix et votre discours, **vérifiez par téléphone ou en personne** (30 minutes de travail, checklist complète dans [03-offre-et-tarifs.md](03-offre-et-tarifs.md)) :

- Les prix affichés des concurrents (Lamarre ~205 $/3 mois, Torii 617-832 $/an, SLA Rosemont, etc.);
- Qui occupe réellement le 6498 Beaubien Est — NotebookLM liste « Club de Judo CSHP » et « Montréal Champions Taekwondo » comme si c'étaient des entités distinctes de votre club. Si le club de TKD est votre colocataire, c'est un fait à intégrer; si c'est une confusion avec vos propres programmes, une partie de « l'analyse concurrentielle » s'effondre;
- Les statistiques démographiques citées (34,8 % de monoparentalité à Mercier-Ouest, etc.) — plausibles, mais à confirmer sur [statistique.quebec.ca](https://statistique.quebec.ca) ou le profil d'arrondissement de la Ville de Montréal si vous vous en servez pour une demande de subvention.

---

## À faire dans les 7 prochains jours (l'essentiel de l'essentiel)

- [ ] Lire [01-plan-90-jours.md](01-plan-90-jours.md) et [02-economie-unitaire.md](02-economie-unitaire.md)
- [ ] Remplir la feuille de seuil de rentabilité (vos vrais coûts fixes) — 20 minutes
- [ ] Valider la grille tarifaire et l'offre Pass Découverte 19 $
- [ ] Faire signer les formulaires de consentement image aux parents (avant de filmer quoi que ce soit)
- [ ] Tourner les 2 vidéos prioritaires ([05-creatifs-et-annonces.md](05-creatifs-et-annonces.md))
- [ ] Monter l'infrastructure Meta ([04-meta-ads-setup.md](04-meta-ads-setup.md))
- [ ] Annoncer le programme de parrainage aux membres actuels ([08-leviers-complementaires.md](08-leviers-complementaires.md)) — coût zéro, effet immédiat
