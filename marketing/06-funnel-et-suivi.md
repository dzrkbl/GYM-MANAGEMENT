# Funnel & suivi — chaque message, mot à mot

La pub génère le lead; **c'est le suivi qui génère le membre**. Un lead contacté en 5 minutes a ~21× plus de chances d'aboutir qu'un lead rappelé le lendemain. Ce fichier contient chaque message du parcours, prêt à utiliser.

**Le parcours :** Pub → Formulaire → SMS + appel (5 min) → Rappels → Essai au dojo → Closing → Inscription

---

## 1. La règle des 5 minutes (le maillon qui décide de tout)

Dès la notification de lead sur votre téléphone :

**Minute 0-1 — SMS immédiat** (envoyé de votre cellulaire; texte enregistré dans vos raccourcis clavier) :

> « Salut [prénom du parent] ! C'est [votre prénom] du CSHP sur Beaubien 🥋 J'ai bien reçu ta demande pour le Pass Découverte de [prénom de l'enfant]. Je t'appelle dans 2 minutes pour réserver sa place ! »

**Minute 2-5 — Appel.** Objectif unique : **fixer la date de l'essai**. On ne vend rien au téléphone.

Script d'appel :

> « Salut [prénom], c'est [vous] du Centre Sportif de Haute-Performance, tu viens de remplir le formulaire pour [enfant] — merci !
> Juste deux petites questions pour le mettre dans le bon groupe : il a quel âge ? Est-ce qu'il a déjà fait un sport structuré ?
> Parfait. Le groupe [U8 / 9-13] s'entraîne [jours + heures]. Qu'est-ce qui marche le mieux pour vous : [option A] ou [option B] ?
> Excellent. Pour confirmer la place, le Pass Découverte c'est 19 $ — ça inclut ses 2 cours pis son t-shirt du club, qu'on lui remet au premier cours. Je t'envoie le lien de paiement par texto tout de suite.
> [Enfant] a juste besoin de vêtements de sport pis d'une bouteille d'eau. Arrivez 10 minutes d'avance, je vous accueille personnellement. À [jour] ! »

**Lien de paiement :** créer un « Payment Link » Stripe de 19 $ (gratuit à créer, ~3 % de frais par transaction) → l'envoyer par SMS aussitôt l'appel terminé. Le paiement confirme la réservation — c'est lui qui fait grimper le show-up à 70-85 %.

**Pas de réponse à l'appel ?** Réessayer 1 fois dans l'heure, puis SMS :

> « Pas de trouble [prénom], je sais que ça bouge ! 😄 Dis-moi juste quel soir vous conviendrait pour le premier cours de [enfant], pis je vous réserve ça : [option A] / [option B] »

Relances si silence : J+1 (SMS), J+3 (appel), J+5 (dernier SMS : « Je garde son t-shirt de côté jusqu'à vendredi — après je libère la place 😊 »). Après 3 tentatives sans réponse, marquer « froid » dans le tracker et laisser la séquence courriel travailler.

---

## 2. Séquence courriel Brevo (automatique, 4 courriels)

**Courriel 1 — immédiat (déclenché par l'intégration Meta → Brevo)**
Objet : `Bienvenue au CSHP [prénom de l'enfant] ! 🥋 Prochaine étape`

> Bonjour [prénom],
>
> Merci pour votre demande de Pass Découverte au Centre Sportif de Haute-Performance !
>
> Je vous appelle dans les prochaines minutes pour réserver le premier cours de [enfant]. Si on se manque, répondez simplement à ce courriel ou textez-moi au [numéro].
>
> Le Pass Découverte, c'est : 2 cours d'essai + le t-shirt officiel du club, pour 19 $.
>
> À très vite,
> [Vous] — Entraîneur-chef, CSHP
> 6498 Beaubien Est, Montréal

**Courriel 2 — J+1** : `À quoi s'attendre au premier cours (2 min de lecture)`
Contenu : déroulement du premier cours étape par étape (accueil, échauffement en jeu, 2-3 techniques de base, salut de fin), quoi apporter, où se stationner / station de métro, photo du gym. But : lever l'anxiété du premier pas.

**Courriel 3 — J+3** : `Pourquoi les parents de Rosemont nous choisissent`
Contenu : 3 courts témoignages de parents (les vrais — demandez-les cette semaine aux parents actuels), une photo de gradation, un mot sur votre parcours de compétiteur actif.

**Courriel 4 — J+5** : `On garde sa place encore quelques jours`
Contenu : rappel simple de l'offre 19 $, mention que les groupes sont limités en taille pour la qualité d'encadrement, bouton « Répondre pour réserver ». Ton léger, zéro pression lourde.

---

## 3. Rappels avant l'essai (anti no-show)

- **J-1, ~18 h — SMS :** « Salut [prénom] ! On se voit demain à [heure] pour le premier cours de [enfant] 🥋 Vêtements de sport + bouteille d'eau. Son t-shirt l'attend ici ! Arrivez 10 min d'avance — à demain ! »
- **Jour J, 2 h avant — SMS :** « C'est à soir [heure] ! On vous attend au 6498 Beaubien Est. [Enfant] va adorer ça 💪 »

Un no-show malgré tout ? Pas de reproche :

> « On vous a manqués à soir ! Pas de stress, ça arrive. Je peux replacer [enfant] jeudi ou samedi — qu'est-ce qui marche le mieux ? »

---

## 4. L'essai au dojo — protocole d'accueil

- [ ] Accueillir l'enfant **par son prénom** dès la porte (détail qui change tout — vérifiez le tracker avant le cours)
- [ ] Remettre le t-shirt à l'arrivée (l'enfant le porte pour son premier cours = il fait déjà partie de la gang)
- [ ] Assigner un **« buddy »** : un élève poli et enthousiaste du groupe qui le prend sous son aile
- [ ] Pendant le cours : donner à l'enfant 2-3 réussites visibles (une technique qu'il réussit, un high-five du coach)
- [ ] Le parent reste et regarde — lui offrir une chaise bien placée, pas un coin de vestiaire
- [ ] Noter 2 observations spécifiques sur l'enfant pendant le cours (vous en aurez besoin dans 10 minutes)

---

## 5. Le closing (10 minutes, à la fin du 1er ou du 2e cours)

Le moment optimal : l'enfant vient de finir, il est content, le parent l'a vu sourire. **S'asseoir avec le parent pendant que l'enfant se change.** Structure en 3 temps :

**1. L'observation (crédibilité) :**
> « J'ai regardé [enfant] aller à soir. Deux affaires : [observation spécifique — ex. “il a une super coordination pour son âge, ses chutes étaient déjà propres à la fin” et “il écoute bien quand la consigne est claire, il a juste besoin d'un cadre constant”]. »

**2. La recommandation (prescription, pas vente) :**
> « Pour ses trois premiers mois, je le mettrais dans [forfait — ex. le U8 combiné, 2 fois semaine]. À cet âge-là, deux fois par semaine c'est le rythme où on voit une vraie progression sans le saturer. »

**3. L'offre du jour (une seule, avec une vraie raison) :**
> « Le forfait est à [prix] par mois, sans contrat — tu peux arrêter n'importe quand. Les frais d'ouverture de dossier sont de 75 $ avec le gi inclus, pis si on finalise l'inscription à soir, **je te les coupe de moitié** — c'est ma façon de remplir les groupes avant [la rentrée / la gradation]. »

Puis **se taire** et laisser le parent répondre.

**Objections courantes :**

| Objection | Réponse |
|---|---|
| « Je vais y penser » | « Bien sûr. Qu'est-ce qui te ferait hésiter — l'horaire, le budget, ou tu veux voir si l'intérêt de [enfant] tient ? » (traiter la vraie objection, pas la façade) |
| « C'est cher » | « Je comprends. C'est [X] $ par semaine pour 2 entraînements encadrés — pis il reste le 2e cours du Pass pour confirmer que ça vaut la peine. Sinon, le 1×/semaine à 65 $ est une belle porte d'entrée. » |
| « Il faut que j'en parle à l'autre parent » | « Parfait, c'est normal. Je vous garde la place jusqu'à [jour]. Je t'envoie par courriel le résumé des forfaits pour que vous regardiez ça ensemble. » |
| Hésitation persistante après le 2e cours | Offre de repêchage : « 6 semaines pour 69 $, pis si il continue après, je crédite le 69 $ sur les frais d'ouverture. » |

**Après l'inscription :** prélèvement mensuel automatisé via Stripe (lien d'abonnement) — jamais de « apportez un chèque le mois prochain », c'est comme ça qu'on crée du churn administratif.

---

## 6. Relances des non-convertis (semaines 6, 9 et 12)

Tous les leads « froids » et essais non inscrits retournent dans une relance :

- **Semaine 6 (pré-rentrée) :** « Salut [prénom] ! La session de la rentrée du CSHP part la semaine du 31 août. Il reste [X] places dans le groupe de [enfant]. Son Pass Découverte à 19 $ tient toujours — je te le réserve ? »
- **Semaine 9 :** angle « les groupes sont partis mais on intègre encore » + rappel 6 semaines/69 $.
- **Semaine 12 :** dernier message avant de passer le lead en dormance (il sera relancé en janvier avec l'angle nouvelle année).
