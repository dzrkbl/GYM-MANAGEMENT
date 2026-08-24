# Croissance par les données — les leviers que seul VOTRE club possède

Ce document ne remplace pas [01-plan-90-jours.md](01-plan-90-jours.md) ni
[08-leviers-complementaires.md](08-leviers-complementaires.md) : il attaque le
même objectif par un autre angle. Les autres documents répondent à « comment
faire venir des inconnus ». Celui-ci répond à « qu'est-ce que ma base de
données sait déjà, que mes concurrents ignorent, et que je n'exploite pas ».

Écrit le 22 août 2026. Les chiffres marqués ⚠️ sont des estimations à
remplacer par vos vraies données (voir §7).

---

## 1. Le constat qui réoriente tout

L'économie unitaire ([02](02-economie-unitaire.md)) établit deux faits qui,
mis côte à côte, mènent à une conclusion inconfortable :

- 300 $/mois de pub produisent **4 à 8 nouveaux membres/mois**
- Le churn naturel en retire **3 à 5 % du parc**, soit ~4/mois à 100 membres

**Croissance nette : entre 0 et +4 par mois, pour 3 600 $/an.**

Le réflexe naturel est d'augmenter le budget pub. Mais à CAC constant, doubler
le budget double aussi le nombre de membres qu'il faut ensuite retenir : on
remplit un seau percé plus vite, sans boucher le trou.

L'angle rentable est l'autre bout : **un membre retenu coûte 0 $ et vaut
exactement autant qu'un membre acquis** (1 600 à 2 400 $ de LTV). Passer d'un
churn de 4 % à 2,5 % sur 100 membres, c'est **18 membres conservés par an**,
soit l'équivalent de 4 à 6 mois de publicité, sans dépenser un dollar.

Trois leviers exploitent des données que vous possédez déjà et que personne
d'autre dans votre marché ne possède sur vos familles.

---

## 2. Levier 1 — La fratrie : le seul membre à CAC nul ET anti-churn

**Le calcul que personne ne fait.** Recruter le petit frère ou la petite sœur
d'un membre actuel n'ajoute pas un membre : il en ajoute un ET il protège
celui que vous avez déjà.

- **Acquisition à 0 $** : le parent est déjà convaincu, il fait déjà le trajet,
  il connaît déjà les coachs.
- **Marge quasi totale** : l'enfant s'assoit dans un cours qui a lieu de toute
  façon. Le loyer et le salaire du coach sont déjà payés. Même avec le rabais
  famille de −10 %, la marge sur ce membre est supérieure à celle d'un membre
  acquis par la pub.
- **Assurance anti-départ** : une famille avec deux enfants inscrits ne part
  presque jamais. Partir signifie bouleverser deux horaires, deux groupes,
  deux réseaux d'amis. Le coût de sortie double, donc le churn s'effondre.

**Pourquoi ça dort.** Le champ `rabaisFamille` et le lien `membreFamilleId`
existent dans la base, mais rien dans l'application ne dit *quelles familles
n'ont qu'un seul enfant inscrit*. La question n'est donc jamais posée
systématiquement, seulement au hasard des conversations.

**L'action.** Établir la liste des familles à un seul enfant (regroupement par
courriel ou téléphone du parent), puis poser la question à chacune, une fois,
en personne, à un moment choisi : après une gradation, après un compliment.
« Vous avez un autre jeune à la maison ? Le deuxième est à −10 %, et il peut
faire un cours d'essai n'importe quand. »

⚠️ Estimation : sur ~60-70 familles distinctes, un taux de fratrie qui passe
de 20 % à 35 % représente **8 à 12 membres par an à coût nul**, plus l'effet
anti-churn sur les familles concernées.

---

## 3. Levier 2 — Le radar de décrochage : votre alerte actuelle arrive 3 semaines trop tard

**Le fait comportemental.** Un enfant n'arrête pas de venir le jour où le
parent décide de résilier. Il arrête de venir **trois à six semaines avant**.
L'absence est le symptôme ; la résiliation est le décès. La fenêtre pour
sauver le membre se situe au tout début de la série d'absences.

**Ce qui existe aujourd'hui** (`src/lib/reminders.ts::sendAbsenceAlerts`) :
un courriel automatique au parent après **14 jours** d'absence, puis un autre
à 28 jours. Deux problèmes :

1. **Trop tard.** Avec deux cours par semaine, 14 jours d'absence signifient
   quatre cours manqués. À ce stade, la décision est souvent déjà prise dans
   la tête du parent ; le courriel arrive pour constater, pas pour retenir.
2. **Mauvais émetteur.** Un courriel automatique signé « CSHP » n'a pas le
   poids d'un message du coach qui nomme l'enfant. Le geste qui retient, c'est
   la relation, pas la notification.

**Le correctif.** Deux cours manqués consécutifs (donc ~7 jours) doivent
produire une **liste d'appels pour le coach le jour même**, pas un courriel au
parent. Le courriel automatique garde sa place en filet à 14 et 28 jours, pour
les cas non rattrapés.

Le message qui fonctionne est court, personnel, et ne parle jamais d'argent :
« Bonjour, on s'ennuie de Liam au dojo ! Tout va bien ? » La moitié des
réponses révèlent un problème réglable : un conflit d'horaire, une chicane
avec un autre enfant, un parent qui ne savait pas comment rattraper.

⚠️ Estimation : intercepter un décrochage sur trois sur ~48 départs annuels,
c'est **16 membres conservés par an**, soit ~30 000 $ de LTV préservée.

---

## 4. Levier 3 — Les sièges vides sont invisibles

**Le trou dans les données.** Le modèle `Course` n'a **aucun champ de
capacité**. L'application ne peut donc pas répondre à la seule question qui
oriente une campagne : *quel groupe peut accueillir cinq enfants de plus
mercredi soir ?*

**Pourquoi c'est la question la plus rentable.** Vos coûts sont massivement
fixes : le loyer (~5 600 $/mois) et les salaires sont payés que le tatami
compte huit ou dix-huit enfants. Le quinzième enfant d'un cours existant est
donc **presque 100 % de marge**. À l'inverse, un membre qui oblige à ouvrir un
créneau supplémentaire coûte un salaire de coach.

Conséquence stratégique : **remplir les groupes existants avant d'en ouvrir**,
et cibler la publicité et le parrainage sur les créneaux réellement creux
plutôt que sur « le karaté » en général. Une publicité qui dit « Ninjas 4-8
ans, mercredi 17 h, quelques places » convertit mieux qu'une publicité
générique, et elle envoie les inscriptions là où elles ne coûtent rien.

**L'action.** Ajouter `capaciteMax` sur `Course`, afficher le taux de
remplissage par groupe (présences moyennes ÷ capacité), et faire de ce
tableau le point de départ de chaque décision marketing.

---

## 5. Levier 4 — Les contacts déjà payés qui dorment

Deux gisements dans la base, tous deux à coût d'acquisition nul puisqu'il a
déjà été payé une fois :

**Les anciens membres (`status = INACTIF`).** C'est l'audience qui convertit
le mieux dans l'industrie du conditionnement physique : ils connaissent le
lieu, ils ont aimé assez pour s'inscrire, et le motif de départ (déménagement,
blessure, budget, horaire, année scolaire chargée) a souvent disparu. Une
seule vague de courriels avec une offre de retour convertit typiquement 5 à
15 %. Vous avez maintenant l'envoi groupé par lots pour le faire en une fois.

**Les prospects morts (`Lead` en `LOST`, `CONTACTED` sans suite, `NEW`
oublié).** Chacun a coûté un CPL de 15 à 25 $ et n'a rien produit. Une
relance à trois ou six mois d'intervalle récupère une partie de ceux dont le
« non » était en réalité un « pas maintenant ».

**La précaution.** Ces envois consomment votre quota Resend (100/jour,
3 000/mois). Une vague de 200 anciens membres se découpe donc sur deux jours,
et il ne faut pas la lancer un jour de tournée de rappels chargée.

---

## 6. L'arbitrage en une ligne

| Levier | Coût | Gain annuel ⚠️ | Marge |
|---|---|---|---|
| Publicité Meta 300 $/mois | 3 600 $/an | +48 à 96 bruts | CAC 40-75 $ |
| Fratrie systématique | 0 $ | +8 à 12, plus anti-churn | ~100 % |
| Radar de décrochage à 7 jours | 0 $ | +16 conservés | ~100 % |
| Réactivation INACTIF + leads morts | ~0 $ | +5 à 10 | ~100 % |

Les trois leviers gratuits produisent **29 à 38 membres par an**, dans la même
plage que la publicité, à un coût marginal proche de zéro et avec une marge
supérieure puisqu'ils remplissent des cours existants.

**La conclusion n'est pas « arrêtez la publicité ».** Elle est : la publicité
est le seul levier que vous payez, donc c'est le dernier qu'il faut augmenter,
et seulement une fois que les trois autres tournent. Sinon vous payez pour
remplir un seau percé.

---

## 7. Les chiffres à établir avant d'agir (une heure de travail)

Ces quatre nombres transforment ce document en plan chiffré. Ils se lisent
dans l'application ou dans la sauvegarde Excel quotidienne :

1. **Churn réel mensuel** : nombre de passages à INACTIF sur les 6 derniers
   mois ÷ 6 ÷ parc actif. Le plan suppose 3-5 % ; vérifiez.
2. **Familles à un seul enfant** : regrouper les membres actifs par courriel
   ou téléphone du parent, compter celles qui n'ont qu'une ligne.
3. **Taux de remplissage par groupe** : présences moyennes des 4 dernières
   semaines, par cours. Sans capacité définie, estimez la capacité de chaque
   tatami à la main une bonne fois.
4. **Anciens membres joignables** : membres INACTIF avec une adresse courriel
   valide.

---

## 8. Ce qu'il faut construire dans l'application, par ordre de rendement

1. **Page « Rétention »** : les membres dont la dernière présence dépasse
   deux cours manqués, triés par risque, avec le téléphone du parent
   directement cliquable. C'est la liste d'appels quotidienne du coach. La
   colonne « Dernière présence » de la liste des membres en est la moitié.
2. **Vue « Familles »** : regroupement par parent, avec repérage des familles
   à un seul enfant inscrit. C'est la liste de la question fratrie.
3. **Capacité et remplissage** : champ `capaciteMax` sur `Course` et taux de
   remplissage par groupe, pour orienter pub et parrainage vers les sièges
   vides.
4. **Segment de réactivation** dans la page Courriels : filtre « anciens
   membres » et « prospects perdus », pour lancer une vague en deux clics.

Les quatre s'appuient sur des données déjà présentes en base. Aucun ne
nécessite un service externe ni un dollar de plus par mois.
