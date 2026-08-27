# Logique financière : Paiements, Finances, Rapports

Établi le 26 août 2026 en relisant le code. Ce document répond à une question
simple et légitime : **quand un chiffre s'affiche, est-il avec ou sans taxes ?**

---

## 1. La règle d'or : tout prix affiché est TAXES INCLUSES

C'est la méthode québécoise, et elle est appliquée partout dans le code.

| Formule | Prix affiché au parent | Ce qui reste au club | Taxes à remettre |
|---|---:|---:|---:|
| Trimestriel | 250,00 $ | **217,44 $** | 32,56 $ |
| Annuel | 790,00 $ | **687,11 $** | 102,89 $ |

Le diviseur est `DIVISEUR_TAXES = 1,14975` (TPS 5 % + TVQ 9,975 %), défini une
seule fois dans `src/lib/finances.ts` et importé partout ailleurs.

**Conséquence importante :** le montant qu'un parent paie n'est jamais le
revenu du club. Environ **13 % de chaque encaissement appartient à Revenu
Québec** et devra être remis.

### Où la conversion a lieu

| Endroit | Ce qui est affiché |
|---|---|
| Fiche membre, échéancier, page Paiements | Montants **taxes incluses** (ce que le parent doit) |
| Reçu PDF (`recus.ts`) | Détail : sous-total, TPS, TVQ, total |
| Facture annuelle (`factures.ts`) | Même détail |
| Module financier, ligne « Revenus avant taxes » | Montant **net** (÷ 1,14975) |
| Rapport de rentabilité, « revenuAnnuelNet » | Montant **net** |

Il n'y a donc **aucune incohérence côté revenus** : tout ce qui est affiché au
parent est taxes incluses, et tout ce qui sert à mesurer la rentabilité est
ramené net. La cohérence est réelle.

---

## 2. Les charges

Les dépenses sont saisies **taxes incluses**, comme tout le reste :

```
totalCharges    = charges fixes + loyer + masse salariale   (taxes incluses)
totalChargesNet = totalCharges − crédits sur les intrants     (hors taxes)
```

Chaque charge porte un indicateur `taxable` qui détermine si sa part de taxe
revient au club en crédit. Voir §3 pour le détail.

---

## 3. LES DEUX BASES — corrigé le 26 août 2026

Auparavant, le résultat mélangeait les unités : revenus nets moins charges
taxes incluses. C'est réparé. **Le module financier affiche désormais un
sélecteur Net / Brut, et les DEUX membres de la soustraction changent
ensemble.** On ne peut plus comparer des pommes et des oranges.

| Base | Revenus | Charges | Ce que le chiffre dit |
|---|---|---|---|
| **Net** (défaut) | hors taxes | hors taxes **récupérables** | Le bénéfice réel : ce qui reste au club |
| **Brut** | taxes incluses | taxes incluses | Les mouvements du compte |

### Pourquoi « net » reste le défaut

Les deux lectures sont cohérentes, mais elles ne disent pas la même chose, et
**l'écart entre elles n'est pas un choix d'affichage** : il vaut exactement la
remise de taxes.

Exemple, sur 20 000 $ encaissés et 10 154 $ de charges :

```
NET  : 17 395,09 − 9 271,98 = 8 123,11 $   ← bénéfice réel
BRUT : 20 000,00 − 10 154,00 = 9 846,00 $   ← mouvements du compte
Écart :                          1 722,89 $
       = TPS/TVQ perçues 2 604,91 − crédits sur intrants 882,02
       = exactement ce qui part chez Revenu Québec
```

En base brut, le solde compte comme revenu **des taxes qui ne vous
appartiennent pas**. C'est utile pour la trésorerie, dangereux pour décider.
D'où la règle retenue : **les deux vues affichent toujours, en clair, la
remise à Revenu Québec.** Aucune des deux ne peut donc induire en erreur.

### Toutes les charges ne portent pas de taxe récupérable

Le champ `taxable` (sur `Depense` et `DepenseConfig`) tranche au cas par cas :

| Charge | Taxable ? |
|---|---|
| Loyer commercial, électricité, téléphonie, location automobile | **Oui** — crédit récupérable |
| Assurances | **Non** — service financier exonéré |
| Masse salariale | **Non** — aucune taxe sur les salaires |

La migration a coché « non taxable » sur tout libellé contenant
« assurance ». C'est une aide à la saisie, pas une vérité : vérifiez vos
charges et corrigez au besoin.

---

## 3 bis. L'ancienne asymétrie (historique, corrigée)

Ce qui suit décrit le comportement d'AVANT le 26 août 2026, conservé pour
mémoire. Le résultat était alors calculé ainsi :

```
marge = (revenus ÷ 1,14975)  −  (charges telles que saisies)
         ^^^^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^^^^^^^^^^
         NET de taxes            TAXES INCLUSES
```

**On compare deux choses qui ne sont pas dans la même unité.** Le loyer de
5 660 $ est un montant taxes incluses ; sa part de taxes est récupérable en
crédits de taxe sur les intrants (CTI et RTI), puisque le centre est inscrit
aux fichiers TPS et TVQ (les numéros figurent sur les reçus).

Impact mensuel, avec les charges actuelles :

| Charge | Montant saisi | Taxable ? | Taxe récupérable |
|---|---:|---|---:|
| Loyer | 5 660,00 $ | Oui | 737,19 $ |
| Location automobile | 608,00 $ | Oui | 79,19 $ |
| Cellulaires | 254,00 $ | Oui | 33,08 $ |
| Hydro-Québec | 250,00 $ | Oui | 32,56 $ |
| Assurance auto | 160,00 $ | **Non** (service financier exonéré) | — |
| Assurance gym | 222,00 $ | **Non** (service financier exonéré) | — |
| Masse salariale | variable | **Non** (aucune taxe sur les salaires) | — |

**Total non déduit : environ 882 $/mois, soit près de 10 600 $ par an.**

Autrement dit, **le résultat affiché est plus pessimiste que la réalité**, et
le nombre de membres nécessaires à l'équilibre est surestimé d'autant.

### Ce qu'il faut décider (question de comptabilité, pas de code)

Deux traitements sont défendables, et le choix appartient au comptable :

1. **Le club réclame ses CTI/RTI** (cas normal d'une entreprise inscrite) :
   les charges taxables devraient être ramenées nettes, comme les revenus. Le
   calcul actuel sous-estime alors le résultat.
2. **Le club ne les réclame pas** : le calcul actuel est correct, mais il faut
   savoir que le centre laisse ~10 600 $ par an sur la table.

**Tranché le 26 août 2026** : le propriétaire confirme récupérer ses taxes.
Le calcul a donc été corrigé (§3), avec le choix de la base laissé à
l'affichage et la remise toujours visible.

---

## 4. Comment les plans s'annualisent

Le rapport de rentabilité annualise le contrat de chaque membre ACTIF :

| Plan | Calcul | Brut annuel | Net annuel |
|---|---|---:|---:|
| Annuel | `montantFinal` | 790,00 $ | 687,11 $ |
| Trimestriel | `montantFinal × 4` | 1 000,00 $ | 869,75 $ |

**Un membre trimestriel rapporte 210 $ de plus par an qu'un membre annuel**,
soit 27 % de plus. Ce n'est pas une anomalie : l'annuel est un **rabais de
21 % accordé contre un paiement d'avance**, ce qui achète de la trésorerie et
supprime le risque d'impayé pendant douze mois.

**La limite à connaître :** l'annualisation suppose que le membre trimestriel
renouvelle **quatre fois**. Avec de l'attrition, c'est optimiste. Le rapport
l'assume dans son en-tête (« hypothèse effectif constant »), mais gardez en
tête que la projection des trimestriels est un plafond, pas une prévision.

---

## 4 bis. D'où vient « 702,37 $/membre/an net »

C'est `revenuMoyenParMembre` : le revenu annuel projeté divisé par le nombre de
membres **payants** (ceux qui ont un plan et un montant ; les autres sont
listés dans `sansContrat` et exclus des deux côtés de la division).

```
702,37 $ net  ×  1,14975  =  807,55 $ brut par membre et par an
```

Ce panier moyen se situe **au-dessus du tarif annuel plein de 790 $**, ce qui
s'explique par la présence de membres trimestriels : ils paient 1 000 $ sur
l'année. Environ 8 % de trimestriels suffisent à produire cette moyenne, et la
part réelle est un peu plus haute puisque les rabais famille tirent vers le bas.

| Profil | Brut annuel | Net annuel |
|---|---:|---:|
| Annuel plein | 790,00 $ | 687,11 $ |
| Annuel avec rabais famille (−10 %) | 711,00 $ | 618,40 $ |
| Trimestriel (×4) | 1 000,00 $ | 869,75 $ |

Le seuil se lit alors simplement : **121 membres × 702,37 $ = 84 987 $** de
charges annuelles à couvrir, soit environ **7 082 $ par mois**.

---

## 5. Le seuil de rentabilité

```
membresNecessaires = (chargesBase + ponctuelles12Mois) ÷ revenuMoyenParMembre
```

**Numérateur et dénominateur sont dans la MÊME base** (net ou brut selon le
sélecteur). Auparavant le seuil divisait des charges taxes incluses par un
revenu net, et demandait donc plus de membres qu'il n'en fallait.

Avec :

- `chargesBase` = (masse salariale + loyer + charges récurrentes du mois
  courant) × 12, dans la base retenue. **Le mois courant est extrapolé sur
  toute l'année** : un mois atypique fausse la projection.
- `ponctuelles12Mois` = dépenses ponctuelles des 12 derniers mois (fenêtre
  glissante).
- `revenuMoyenParMembre` = revenu annuel ÷ membres payants, même base.

**Deux réserves qui subsistent :**

1. Les membres sans plan ni montant sont exclus du calcul et listés dans
   `sansContrat` : s'il y en a beaucoup, le seuil est faussé.
2. Les revenus d'équipement, d'affiliations et de frais de fédération sont
   **volontairement exclus** : ce ne sont pas des revenus de cotisation, et les
   frais de fédération ne font que transiter par le club.

---

## 6. Vocabulaire piégeux

Deux noms de champs prêtent à confusion et méritent d'être lus avec attention :

| Champ | Ce que le nom suggère | Ce que c'est vraiment |
|---|---|---|
| `revenusAvantTaxes` | « avant d'avoir payé les taxes » | Le montant **net**, une fois les taxes retirées |
| `brut` (dans les revenus) | Chiffre d'affaires | Encaissé **+ en attente**, taxes incluses |

---

## 7. Ce qui est solide

Pour finir sur ce qui ne bouge pas :

- **Une seule source pour la masse salariale** (`masseSalarialePourMois`) :
  tableau de bord, module financier et rapports passent tous par elle.
- **Une seule constante de taxes** (`DIVISEUR_TAXES`), importée partout.
- **Les membres INACTIF sont exclus des créances** : un départ n'est pas une
  dette à recouvrer.
- **Le jour civil de Montréal** sert de référence pour « échu », pas l'heure
  UTC du serveur.
