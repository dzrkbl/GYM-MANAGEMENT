# Recherche NotebookLM — Marketing par communauté (parents d'élèves)

> **Objectif :** comprendre ce qui interpelle réellement les **parents** de chaque
> communauté du CSHP sur les réseaux sociaux — ce qui les met en confiance, ce qui les
> pousse à inscrire leur enfant, et quels codes utiliser dans nos vidéos.
> **Méthode :** ajouter les sources ci-dessous au carnet NotebookLM → coller les
> prompts → rapporter les réponses ici → intégration dans le playbook (plan en fin
> de fichier).

---

## 0. Les deux règles du jeu avant de commencer

### Règle publicitaire (contrainte technique)

**Meta a supprimé le ciblage ethnique** : les catégories « affinité multiculturelle »
ont été retirées en août 2020, et tout le ciblage détaillé lié à l'origine, la
religion ou la santé a été supprimé en janvier 2022. On ne peut PAS cocher
« communauté maghrébine » dans Ads Manager — et on ne doit jamais essayer de le
contourner (politique anti-discrimination de Meta).

**Conséquence stratégique : le CONTENU fait le ciblage.** Nos trois leviers réels :
1. **Les codes culturels dans le créatif** (visages, prénoms, valeurs, situations) —
   l'algorithme montre la pub aux gens qui s'y reconnaissent et s'y engagent ;
2. **La langue** du texte et de la vidéo ;
3. **La géographie** (rayon autour du 6498 Beaubien Est — Saint-Michel et
   Villeray, tout proches, comptent parmi les plus fortes concentrations
   maghrébines de Montréal).

### Règle éthique (à respecter dans tout ce qui suit)

- On parle de **résonance culturelle**, jamais de stéréotypes. Le but : que les
  parents se disent « ce club nous comprend », pas « ce club nous étiquette ».
- **Authenticité obligatoire** : de vrais parents et élèves du club (avec
  consentement signé), pas des acteurs qui « jouent » une communauté.
- **On ne stocke JAMAIS l'origine ethnique des membres dans l'app** (ni dans un
  Sheets). La segmentation sert à créer du contenu, pas à ficher les familles
  (Loi 25).
- Ce qui unit toutes les communautés (réussite de l'enfant, discipline, sécurité,
  prix juste) reste le cœur du message — les codes culturels sont un accent, pas
  le plat principal.

---

## 1. Les communautés du CSHP (état des lieux)

| Communauté | Poids estimé | Base de l'estimation |
|---|---|---|
| **Maghrébine** (algérienne, marocaine, tunisienne) | **~80 % des élèves** (ton chiffre) | Confirmé par le registre : la très grande majorité des familles du groupe karaté |
| Haïtienne / antillaise | minorité présente | Quelques familles au registre |
| Ouest-africaine | minorité présente | Quelques familles au registre |
| Est-européenne (roumaine, moldave…) | minorité présente | Quelques familles au registre |
| Latino-américaine | minorité présente | Quelques familles au registre |
| Québécoise « de souche » et autres | minorité | — |

> Les noms du registre sont un **indice approximatif**, pas une donnée. L'estimation
> sert uniquement à prioriser la recherche : la communauté maghrébine d'abord, les
> autres ensuite.

---

## 2. ÉTAPE 1 — Alimenter le carnet NotebookLM (OBLIGATOIRE avant les questions)

⚠️ **NotebookLM ne répond que depuis ses sources.** Le carnet actuel contient du
marketing d'arts martiaux — rien sur les communautés. Sans nouvelles sources, il
inventera avec assurance.

### Sources précises à ajouter (URL à coller dans « Ajouter une source »)

| Source | Pourquoi |
|---|---|
| [Encyclopédie du MEM — L'immigration maghrébine à Montréal](https://ville.montreal.qc.ca/memoiresdesmontrealais/limmigration-maghrebine-montreal) | Histoire, quartiers (Saint-Michel, Ahuntsic…), profil socioéconomique |
| [CEM Université Laval — Attachement des communautés culturelles aux médias (PDF)](https://www.cem.ulaval.ca/wp-content/uploads/2019/04/aattachementcommunautes.pdf) | Étudie précisément les communautés **maghrébine et haïtienne** de Montréal et leurs habitudes médias |
| [Proulx (UQAM) — Consommation médiatique et hybridation identitaire : trois groupes montréalais issus de l'immigration (PDF)](https://sergeproulx.uqam.ca/wp-content/uploads/2014/02/ConsommationHybridation2012_Rev.pdf) | Comment les familles immigrantes montréalaises consomment les médias |
| [Hommes & Migrations — Les Marocains au Canada : histoire, profil et enjeux](https://journals.openedition.org/hommesmigrations/2560?lang=en) | Profil de la composante marocaine |
| [Wikipédia — Diaspora maghrébine au Québec](https://fr.wikipedia.org/wiki/Diaspora_maghr%C3%A9bine_au_Qu%C3%A9bec) | Vue d'ensemble chiffrée (point de départ, à recouper) |

### Requêtes « Découvrir des sources » dans NotebookLM (une par une)

- `marketing multiculturel Canada meilleures pratiques communautés culturelles`
- `Ramadan Aïd marketing marques Canada calendrier campagnes`
- `usage réseaux sociaux diaspora arabe maghrébine TikTok Instagram WhatsApp Facebook`
- `parents immigrants activités parascolaires sport enfants intégration Québec`
- `marketing communauté haïtienne Montréal médias habitudes`
- `communautés ouest-africaines Montréal profil médias`
- `décision d'achat familles immigrantes rôle mère père recherche consommateur`
- `arts martiaux champions maghrébins karaté judo modèles sportifs`

---

## 3. ÉTAPE 2 — Les prompts à coller dans NotebookLM

> **En-tête anti-hallucination — à coller AU DÉBUT de chaque prompt :**
>
> « Réponds UNIQUEMENT à partir de tes sources. Pour chaque affirmation, cite la
> source exacte. Si tes sources ne couvrent pas un point, écris explicitement
> "MES SOURCES NE COUVRENT PAS CE POINT" au lieu d'extrapoler. Distingue clairement
> les faits sourcés des déductions. »

### Prompt A — Communauté maghrébine (LA priorité)

```
CONTEXTE : Je suis propriétaire du Centre Sportif de Haute-Performance (CSHP), club
de karaté/judo sur Beaubien Est à Montréal, près de Saint-Michel et Villeray.
Environ 80 % de mes élèves viennent de familles maghrébines (algériennes,
marocaines, tunisiennes). Mes publicités Meta s'adressent aux PARENTS (25-50 ans),
qui décident de l'inscription de leurs enfants (5-13 ans). Le ciblage ethnique
n'existe pas sur Meta : c'est le CONTENU de mes vidéos qui doit interpeller.

QUESTIONS (réponds point par point, avec sources) :

1. VALEURS DE DÉCISION — Selon tes sources, quelles valeurs pèsent le plus dans les
   décisions des parents maghrébins de Montréal pour les activités de leurs enfants :
   réussite scolaire, discipline/respect, sécurité, transmission, fierté, prix,
   proximité ? Hiérarchise si possible.
2. CONFIANCE — Par quels canaux la confiance s'établit-elle (bouche-à-oreille
   communautaire, groupes Facebook/WhatsApp, mosquées/associations, commerces du
   quartier, médias communautaires comme Maghreb Canada Express) ? Concrètement,
   comment un club local peut-il devenir « le club dont tout le monde parle » ?
3. RÉSEAUX SOCIAUX — Quelles plateformes et quels formats consomment les parents
   (pas les ados) : Facebook, Instagram, TikTok, WhatsApp, YouTube ? Y a-t-il des
   données sur leurs habitudes médias à Montréal ?
4. LANGUE — Pour une pub vidéo à Montréal : français québécois, français
   « international », touches de darija/arabe ? Qu'est-ce qui sonne juste vs forcé ?
5. CODES CULTURELS EN VIDÉO — Quels éléments visuels et narratifs créent la
   reconnaissance (« ce club nous comprend ») sans tomber dans le cliché ? Quels
   faux-pas absolument éviter ?
6. CALENDRIER — Comment adapter le calendrier de contenu : Ramadan (horaires,
   énergie des enfants, ton), Aïd al-Fitr / al-Adha, rentrée scolaire, vacances au
   bled l'été ? Que font les marques canadiennes qui réussissent ces moments ?
7. RÔLES DÉCISIONNELS — Que disent tes sources sur qui décide et qui exécute
   l'inscription (mère/père), et comment adresser les deux ?
8. MODÈLES ET FIERTÉ SPORTIVE — Existe-t-il des figures sportives maghrébines
   (karaté, judo, sports de combat) qui résonnent comme modèles pour ces familles ?
9. PREUVES — Donne des exemples DOCUMENTÉS de clubs sportifs, écoles ou marques qui
   réussissent auprès de cette communauté au Canada, et ce qu'ils font précisément.
```

### Prompt B — Communauté haïtienne / antillaise

```
Même contexte que le prompt précédent (club CSHP, pubs destinées aux parents).
Réponds aux 9 mêmes questions, cette fois pour les familles HAÏTIENNES et
antillaises de l'est de Montréal (Saint-Michel, Montréal-Nord sont proches de nous).
Points additionnels : place du créole vs français dans une pub ; rôle des églises et
associations communautaires dans la confiance ; sensibilité particulière au thème
« discipline et encadrement » ; figures sportives qui résonnent (arts martiaux,
boxe…).
```

### Prompt C — Communautés ouest-africaines et autres

```
Même contexte et mêmes 9 questions pour : (a) les familles OUEST-AFRICAINES de
Montréal (Guinée, Sénégal, Mali, Côte d'Ivoire…) ; (b) brièvement, les familles
EST-EUROPÉENNES et LATINO-AMÉRICAINES. Si tes sources ne couvrent pas une
communauté, dis-le clairement plutôt que de généraliser.
```

### Prompt D — Synthèse transversale (à poser EN DERNIER)

```
À partir de tout ce qui précède :
1. Quels messages sont COMMUNS à toutes les communautés (le tronc commun de nos
   pubs) vs spécifiques à chacune (les accents) ?
2. Comment faire des créatifs INCLUSIFS : une vidéo qui parle fortement aux parents
   maghrébins (80 % de notre clientèle) sans exclure les autres familles du quartier ?
3. Propose 5 concepts de vidéos 15-30 s pour les PARENTS, chacun avec : hook (3
   premières secondes), déroulé, texte à l'écran, et à quelle(s) communauté(s) il
   parle. Fonde chaque concept sur des éléments SOURCÉS de tes réponses précédentes.
4. Liste ce que tes sources N'ONT PAS pu couvrir et qu'il faudrait valider
   directement auprès de nos parents (sondage maison, conversations au dojo).
```

---

## 4. Hypothèses de départ (les miennes — à VALIDER par la recherche, pas des faits)

| # | Hypothèse | Si confirmée → action |
|---|---|---|
| H1 | Le bouche-à-oreille communautaire pèse plus que la pub → le parrainage est notre vrai moteur | Doubler la mise sur le programme de parrainage (fichier 08) et le rendre visible dans les pubs (« la famille X vous recommande ») |
| H2 | La réussite scolaire est un argument plus fort que le sport lui-même | Hooks « concentration en classe », bulletin, discipline → avant les médailles |
| H3 | Les mères sont le canal d'entrée (groupes FB/WhatsApp de mamans) et le kickboxing femmes est une porte d'entrée familiale | Créatif « maman s'entraîne pendant que les enfants font karaté » + offre duo |
| H4 | Pendant le Ramadan, l'activité baisse mais l'Aïd et la rentrée sont des pics d'inscription | Calendrier : campagne douce pendant Ramadan, push à l'Aïd + rentrée |
| H5 | Un témoignage authentique d'un parent maghrébin du club en français vaut mieux que n'importe quelle production léchée | Filmer 2-3 parents volontaires (consentement) dès cette semaine |
| H6 | La fierté des champions maghrébins en sports de combat crée un raccourci émotionnel | Référencer ces modèles dans le contenu organique (pas forcément les pubs payantes — droits d'image) |

---

## 5. ÉTAPE 3 — Plan d'intégration des réponses

Quand tu rapportes les réponses NotebookLM dans la conversation :

| Réponse | Met à jour |
|---|---|
| Valeurs, codes culturels, langue (Q1, 4, 5) | [05-creatifs-et-annonces.md](05-creatifs-et-annonces.md) + nouveaux hooks dans [suivi/creatifs.md](suivi/creatifs.md) §3 |
| Canaux de confiance (Q2) | [08-leviers-complementaires.md](08-leviers-complementaires.md) (parrainage, partenariats communautaires) |
| Plateformes/formats (Q3) | [04-meta-ads-setup.md](04-meta-ads-setup.md) (placements) |
| Calendrier Ramadan/Aïd/rentrée (Q6) | [01-plan-90-jours.md](01-plan-90-jours.md) + calendrier 2027 |
| Concepts vidéos (Prompt D) | [suivi/creatifs.md](suivi/creatifs.md) §1 (file de production) |
| Hypothèses H1-H6 confirmées/démenties | [suivi/apprentissages.md](suivi/apprentissages.md) |
| Ce que les sources ne couvrent pas | Mini-sondage maison auprès des parents du club (à préparer ensemble) |
