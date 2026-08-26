# PROMPT — Moteur de leads CSHP

Document à copier-coller tel quel dans une session Claude Code ouverte sur le dépôt
`dzrkbl/GYM-MANAGEMENT`. Il contient tout le contexte nécessaire : ne rien supposer
d'autre, et vérifier chaque affirmation dans le code avant de coder.

Rédigé le 24 août 2026. Les faits techniques ci-dessous ont été vérifiés dans le code
réel à cette date (`src/routes/leads.ts`, `prisma/schema.prisma`, `server.ts`,
`src/lib/reminders.ts`, `src/pages/admin/Prospects.tsx`).

---

## 0. Ton rôle et ta mission

Tu construis le **Moteur de leads** du Centre Sportif de Haute-Performance (CSHP) :
un système qui **détecte, qualifie, met en file et relance de VRAIS prospects**, à
l'intérieur de l'application de gestion existante.

**Définition non négociable d'un vrai lead** : une personne réelle, identifiable,
qui a soit (a) manifesté un intérêt explicite (formulaire, pub, appel, DM), soit
(b) une relation d'affaires existante avec le club (membre actuel, ancien membre,
parent d'un membre). Toute autre origine est hors périmètre.

Tu ne fabriques jamais de données. Tu ne scrapes personne. Tu ne contactes personne
sans base légale. Voir §4.

---

## 1. Contexte business

- **Club** : Centre Sportif de Haute-Performance, 6498 rue Beaubien Est, Montréal,
  quartier **Rosemont** (PAS Anjou ni Saint-Léonard — erreur déjà commise deux fois
  dans les docs marketing, ne pas la réintroduire).
- **Disciplines réelles** : Karaté, Judo, Ninjas (4-8 ans). Le kickboxing femmes
  n'existe pas à l'horaire.
- **Cible** : parents de 25-48 ans dans un rayon de 5 km, francophones.
- **Offre d'entrée** : « essai gratuit » pendant la rentrée, bascule prévue vers le
  « Pass Découverte 19 $ » en octobre (`marketing/03-offre-et-tarifs.md`). La pub, le
  site et le script d'appel doivent dire LA MÊME CHOSE — le moteur doit lire l'offre
  courante depuis une seule source de vérité, jamais la coder en dur à deux endroits.
- **Économie unitaire** (`marketing/02`) : CPL cible 7-11 $, CAC cible 45-85 $,
  LTV 900-2 400 $, budget pub actuel 11 $/jour.
- **Le constat qui justifie ce chantier** (`marketing/11` §1) : 300 $/mois de pub
  produisent 4-8 membres/mois, le churn en retire ~4/mois. Croissance nette proche de
  zéro. Les leviers internes (fratrie, réactivation, anti-décrochage) coûtent 0 $ et
  personne ne les exploite parce que **rien dans l'app ne les liste**.
- **La règle des 5 minutes** (`marketing/06` §1) : un lead contacté en 5 minutes a
  ~21× plus de chances d'aboutir. Le délai de premier contact est le KPI n°1 du moteur.
- **Seuils de pilotage** (`marketing/07` §1) : CPL < 20 $, show-up > 65 %, closing
  > 55 %, délai 1er contact < 5 min, churn < 3 %.

---

## 2. Contexte technique existant (vérifié dans le code)

### 2.1 Stack

- Backend : **Express 4** + **TypeScript** + **Prisma 5** sur **PostgreSQL (Neon)**.
  Point d'entrée `server.ts`, routes dans `src/routes/*.ts`, logique dans `src/lib/*.ts`.
- Frontend : **React 19 + Vite + Tailwind 4**, pages dans `src/pages/`, composants UI
  maison dans `src/components/ui/` (`Card`, `Button`, `Input`, `Badge`, `Modal`, `Spinner`).
- Validation : **zod 4**. Réponses normalisées via `sendSuccess` / `sendError`
  (`src/lib/api-response.ts`).
- Auth : **JWT** (`src/middleware/auth.ts`), rôles `ADMIN` / `SECTION_MANAGER` / autres,
  portée par section (`src/lib/portee.ts`).
- Courriels : **Resend** via `src/lib/mailer.ts` (`sendEmail`, `htmlCourriel`), domaine
  `centresportifhp.com` vérifié.
- Journal d'audit : `src/lib/audit.ts` (`logAudit`), consultable dans la page Audit.
- Hébergement : **Render** (plan gratuit, l'app s'endort), base **Neon**.
- Le **site public `centresportifhp.com` est un dépôt SÉPARÉ** (statique, Hostinger).
  Tu n'y touches pas. Tout ce qui le concerne se fait par contrat d'API documenté.

### 2.2 Le modèle `Lead` (prisma/schema.prisma:184)

```prisma
model Lead {
  id          String   @id @default(uuid())
  firstName   String
  lastName    String
  gender      String?
  phone       String?
  email       String?
  sport       String   // KARATE, JUDO, TAEKWONDO, KICKBOXING, PRIVATE
  requestType String   // ESSAI, RAPPEL, TARIFS, AUTRE
  status      String   @default("NEW") // NEW, CONTACTED, CONVERTED, LOST
  source      String?  // ex: "landing-karate-enfant", "meta-instant-form"
  utmSource   String?
  utmCampaign String?
  utmContent  String?  // nom du créatif/de la pub
  note        String?
  ficheRecueAt DateTime?
  membreId     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 2.3 Les endpoints existants (`src/routes/leads.ts`, montés sur `/api/leads`)

| Route | Accès | Comportement à connaître |
|---|---|---|
| `POST /api/leads` | **PUBLIC** | zod `createSchema` ; honeypot `website` (si non vide → succès silencieux, rien créé) ; **filet anti-perte** : si l'écriture base échoue, le lead part par courriel à `INSCRIPTION_NOTIF_EMAIL` et le site reçoit quand même `201` |
| `GET /api/leads?status=` | ADMIN | tri `createdAt desc` |
| `PUT /api/leads/:id` | ADMIN | statut + coordonnées |
| `POST /api/leads/:id/convert` | ADMIN | crée un `Member` en `EN_ATTENTE` ; **ne fusionne avec un homonyme que si courriel OU téléphone concordent**, sinon nouveau dossier + note d'avertissement ; renseigne `membreId` |
| `DELETE /api/leads/:id` | ADMIN | |

**Trois pièges vérifiés, à ne pas réintroduire :**
1. zod **supprime silencieusement** tout champ inconnu — un champ mal nommé n'échoue
   pas, il disparaît. Toujours tester un lead de bout en bout après un changement.
2. `POST /api/leads` **n'a AUCUN rate limit**. Le middleware `rateLimit`
   (`src/middleware/rateLimit.ts`) existe mais n'est branché que sur
   `/api/auth/login` et `/api/inscription` (`server.ts:103` et `:107`).
3. `app.use(cors())` est **ouvert** (`server.ts:55`) — c'est voulu pour le site, mais
   ça veut dire que n'importe qui peut poster des leads depuis n'importe où.

### 2.4 L'automatisation déjà en place

- `src/lib/reminders.ts::sendLeadFollowups` : les leads `NEW` créés il y a plus de
  **3 jours** déclenchent **un courriel à l'admin** (une seule fois, tracé
  `LEAD_RELANCE` dans l'audit). C'est une alerte à l'admin, **pas** une relance du
  prospect. C'est tout ce qui existe aujourd'hui.
- Tournée quotidienne déclenchée par `GET /api/cron/reminders` (protégée par
  `CRON_SECRET`, `server.ts:189`), plus un déclencheur interne au démarrage, plus un
  cron externe sur cron-job.org.
- **n8n** (§8.9 de `PLAN-STRATEGIQUE-CSHP.md`) : deux workflows écrits mais
  **inactifs** — « Rapport Meta Ads + Analyse Claude » (kill rules automatiques) et
  « Lead Meta vers App + Journal » (chaque lead d'un formulaire instantané Meta →
  `POST /api/leads` → data table `cshp_leads` avec la pub d'origine).
- **Surveillance** (`docs/surveillance.md`) : 4 étages de détection, `GET /api/health`
  (léger, cible UptimeRobot 5 min) et `GET /api/health/complet` (profond, réveille
  Neon — max quelques fois par jour).

### 2.5 La page Prospects (`src/pages/admin/Prospects.tsx`, 258 lignes)

Liste filtrable par statut, badge « X j sans suivi », badge « Fiche reçue »
(`ficheRecueAt`), lien vers le dossier membre (`membreId`), bouton de conversion,
bouton d'invitation à la fiche en ligne. **Le moteur doit s'y greffer, pas la
remplacer.**

---

## 3. Ce que le moteur doit faire

Le moteur a **deux moitiés** : la détection (trouver les vrais leads) et le contact
(les traiter en respectant la règle des 5 minutes). Aucune des deux n'envoie quoi que
ce soit sans base légale (§4) et, pour les gisements internes, sans approbation humaine.

### 3.1 Les 6 gisements de détection

**Gisement 1 — Fratries (`marketing/11` §2).**
Regrouper les membres actifs par famille (courriel du parent normalisé, à défaut
téléphone du parent, à défaut `membreFamilleId`). Sortir les familles qui n'ont
**qu'un seul enfant inscrit**. Chacune devient un lead `source="interne-fratrie"`,
`requestType="ESSAI"`, avec en note le prénom de l'enfant déjà inscrit et son groupe.
Priorité haute si l'enfant inscrit a une gradation récente ou une assiduité > 80 %
(le parent est content, c'est le moment de demander).

**Gisement 2 — Anciens membres réactivables.**
Membres `INACTIF` dont la dernière présence date de **plus de 60 jours et moins de
24 mois** (la borne haute est la limite de la relation d'affaires au sens de la LCAP,
§4). Exclure ceux partis en conflit (note contenant un motif de litige — champ à
convenir). `source="interne-reactivation"`. Segmenter par motif présumé de départ
(fin de session vs décrochage) car le message diffère.

**Gisement 3 — Leads froids et perdus.**
Leads `NEW` sans contact depuis > 7 jours, et leads `LOST` de plus de 6 semaines
(vagues de relance des semaines 6, 9 et 12 décrites dans `marketing/06` §6). Ne jamais
relancer plus de 3 fois au total ; après ça, statut `LOST` définitif et sortie de file.

**Gisement 4 — No-shows d'essai.**
Un lead passé `CONTACTED` avec un essai planifié qui n'a produit aucune `Attendance`
dans les 48 h suivant la date prévue. C'est le lead le plus chaud du système et il
n'est relancé par rien aujourd'hui. Message sans reproche (`marketing/06` §3).
**Prérequis** : il n'existe aujourd'hui aucun champ « date d'essai prévue » sur `Lead`.
Il faut l'ajouter (`essaiPrevuAt`) — sinon ce gisement est indétectable.

**Gisement 5 — Sièges vides par cours.**
Croiser `Course` × `Section` × `Attendance` pour estimer, par groupe, la capacité
résiduelle (moyenne de présences des 4 dernières semaines vs capacité déclarée). Ce
gisement ne produit pas de leads : il **priorise** les autres. Un lead Ninjas vaut plus
si le groupe Ninjas du mercredi a 6 sièges vides que s'il est plein.

**Gisement 6 — Inbound (le seul qui produit des inconnus, et légalement).**
- Meta lead ads → activer le workflow n8n existant, qui poste sur `POST /api/leads`.
- Formulaire du site → déjà en place.
- **Codes de parrainage traçables** : générer un code par famille active
  (`PARRAIN-XXXX`), utilisable sur le formulaire du site ; le filleul arrive comme
  lead avec `source="parrainage"` et `utmContent=<code>`, et le parrain est
  automatiquement crédité. C'est le seul canal d'acquisition d'inconnus à CAC nul.
- Appels manqués → hors périmètre v1 (nécessite un fournisseur de téléphonie).

### 3.2 La moitié « contact »

Pour chaque lead en file, le moteur :
1. calcule un **score de priorité** (chaleur × capacité du groupe visé × fraîcheur) ;
2. propose une **action datée** (SMS, appel, courriel) avec le texte **pré-rédigé mot à
   mot depuis `marketing/06`**, jamais généré librement ;
3. attend l'**approbation humaine** pour tout ce qui sort vers un gisement interne
   (§4), envoie automatiquement seulement ce qui répond à un intérêt explicite ;
4. journalise l'issue dans une **timeline** attachée au lead ;
5. escalade à l'humain après 3 tentatives sans réponse.

Le moteur **ne remplace jamais l'appel téléphonique** décrit dans `marketing/06` §1 :
il le déclenche, le chronomètre et le mesure.

---

## 4. Interdits absolus

1. **Aucun faux lead, jamais**, même « pour tester l'interface ». Les jeux de test
   passent par `prisma/seed-test.ts` sur une base de développement, et sont nettoyés
   par `prisma/seed-test-cleanup.ts`. Un faux lead en production corrompt le CPL, le
   taux de closing et les kill rules de n8n — c'est-à-dire la totalité du pilotage.
2. **Aucun scraping.** Pas de collecte de coordonnées sur Facebook, Instagram, les
   annuaires, les sites d'écoles ou de garderies, ni d'achat de listes.
3. **Aucun message commercial sans base légale.** Au Canada, la LCAP/CASL encadre les
   messages électroniques commerciaux (courriel ET SMS) : il faut un consentement, ou
   une exemption — notamment la relation d'affaires existante (généralement 24 mois
   après la fin d'un contrat, 6 mois après une demande de renseignements). Au Québec,
   la Loi 25 encadre la collecte et l'usage des renseignements personnels. Le moteur
   doit donc, pour chaque lead : stocker **la base légale invoquée**, la **date** qui
   la fait courir, et refuser l'envoi si elle est expirée. Tout message sortant doit
   identifier le club, donner une adresse postale et un moyen de désabonnement (« STOP »
   pour le SMS, lien pour le courriel). **Faire valider la politique par un
   professionnel avant la mise en service** — ce document n'est pas un avis juridique.
4. **Aucun envoi hors des heures civilisées** : rien avant 8 h ni après 21 h, heure de
   Montréal, ni le dimanche matin.
5. **Aucun envoi de masse non plafonné.** Quotas quotidiens durs (§6.5).
6. **Aucun contact d'une personne ayant refusé** : l'opt-out est global, définitif et
   prioritaire sur tout le reste.

---

## 5. Architecture cible

### 5.1 Où ça vit

**Dans ce dépôt**, pas dans n8n. Raisons : accès direct à la base, journal d'audit
commun, un seul déploiement, et surtout le moteur doit lire des données membres que
n8n n'a pas. n8n reste le connecteur des sources externes (Meta), rien de plus.

```
Détection (cron quotidien)          Contact (file + approbation)
  src/lib/leadEngine/detect.ts        src/lib/leadEngine/file.ts
  src/lib/leadEngine/score.ts         src/lib/leadEngine/sequences.ts
          |                                    |
          +----> table LeadTache <-------------+
                        |
          src/routes/leadEngine.ts  ->  src/pages/admin/MoteurLeads.tsx
```

### 5.2 Modèle de données (migrations Prisma additives — ne jamais casser l'existant)

Ajouts au modèle `Lead` :

```prisma
  externalId    String?   @unique  // id du lead Meta / n8n : idempotence des retries
  essaiPrevuAt  DateTime?          // débloque le gisement no-show
  origine       String?            // INBOUND | FRATRIE | REACTIVATION | FROID | NOSHOW | PARRAINAGE
  baseLegale    String?            // CONSENTEMENT | RELATION_AFFAIRES | DEMANDE_RENSEIGNEMENTS
  baseLegaleAt  DateTime?          // date qui fait courir le délai
  optOut        Boolean   @default(false)
  optOutAt      DateTime?
  score         Int?               // 0-100, recalculé par le moteur
  premierContactAt DateTime?       // pour mesurer le délai des 5 minutes
  parrainMembreId  String?
```

Nouveaux modèles :

```prisma
model LeadActivite {   // la timeline : chaque contact, chaque issue
  id        String   @id @default(uuid())
  leadId    String
  canal     String   // SMS | COURRIEL | APPEL | NOTE
  sens      String   // SORTANT | ENTRANT
  gabarit   String?  // identifiant du message type utilisé
  contenu   String?
  issue     String?  // ENVOYE | REPONDU | SANS_REPONSE | REFUS | ERREUR
  parUserId String?  // null = moteur
  createdAt DateTime @default(now())
}

model LeadTache {     // la file d'attente d'approbation
  id         String   @id @default(uuid())
  leadId     String
  action     String   // SMS_1 | APPEL_1 | COURRIEL_J1 | RELANCE_S6 ...
  echeanceAt DateTime
  statut     String   @default("PROPOSEE") // PROPOSEE | APPROUVEE | FAITE | REFUSEE | EXPIREE
  priorite   Int
  createdAt  DateTime @default(now())
}
```

### 5.3 Endpoints à créer (`/api/moteur-leads`, tous ADMIN sauf mention)

| Route | Rôle |
|---|---|
| `GET /api/moteur-leads/file` | la file du jour, triée par score, avec le message pré-rédigé |
| `POST /api/moteur-leads/taches/:id/approuver` | approuve et exécute (ou marque « à appeler ») |
| `POST /api/moteur-leads/taches/:id/refuser` | retire de la file avec motif |
| `POST /api/moteur-leads/detecter` | relance la détection à la demande (idempotent) |
| `GET /api/moteur-leads/kpi` | délai moyen 1er contact, leads par origine, show-up, closing |
| `GET /api/cron/moteur-leads` | cron quotidien, protégé par `CRON_SECRET` comme `/api/cron/reminders` |

### 5.4 Écriture machine des leads (pour n8n et le site)

Ne pas ouvrir davantage la route publique. Ajouter à `POST /api/leads` la
reconnaissance d'un en-tête `x-leads-api-key` comparé à `process.env.LEADS_API_KEY` :

- si la clé est valide : honeypot ignoré, `externalId` accepté (donc idempotent),
  `origine` et `baseLegale` acceptés, `createdAt` rétrodatable ;
- si la clé est absente ou fausse : comportement public actuel, **strictement
  inchangé** (le site ne doit rien casser).

Et **brancher enfin `rateLimit` sur la route publique** (ex. 10 requêtes / 10 min / IP,
message de repli téléphone), en exemptant les appels porteurs d'une clé valide.
Vérifier au passage que `app.set('trust proxy', 1)` est actif, sinon derrière Render
toutes les IP se ressemblent et le limiteur devient inutile ou nuisible.

### 5.5 Déduplication et anti-doublon (obligatoire avant toute création)

Clé de dédup = `téléphone normalisé (10 derniers chiffres)` OU `courriel en minuscules`
OU `(prénom + nom + sport)`. Avant de créer un lead :
1. si un `Member` **ACTIF** correspond → **ne pas créer de lead** (c'est un membre,
   pas un prospect) ;
2. si un `Lead` non `LOST` correspond → enrichir l'existant, ne pas dupliquer ;
3. si un `Lead` `LOST` correspond → réouvrir seulement si le gisement l'autorise.

Réutiliser la logique de concordance déjà écrite dans `POST /api/leads/:id/convert`
(fonction `coordonneesConcordent`) plutôt que d'en écrire une seconde.

---

## 6. Règles d'exécution

### 6.1 Cadence
Détection **une fois par jour**, greffée sur la tournée existante de
`src/lib/reminders.ts` (ne pas créer un second système de cron). Le traitement de la
file est temps réel côté interface.

### 6.2 Les 5 minutes
Un lead d'origine `INBOUND` déclenche **immédiatement** (pas au prochain cron) une
tâche `SMS_1` + `APPEL_1` et une notification à l'admin. `premierContactAt` est
horodaté à la première activité sortante ; l'écart avec `createdAt` est le KPI n°1.

### 6.3 Envoi automatique vs approbation
- **Automatique** : uniquement les réponses à un intérêt explicite (accusé de
  réception d'un lead inbound, rappel J-1 d'un essai confirmé, rappel 2 h avant).
- **Approbation humaine obligatoire** : tout gisement interne (fratrie, réactivation,
  froid, no-show) et toute première prise de contact d'une campagne.

### 6.4 Messages
Textes **repris mot à mot** de `marketing/06` (§1 SMS immédiat, §3 rappels, §6
relances semaines 6/9/12), stockés comme gabarits versionnés dans
`src/lib/leadEngine/gabarits.ts` avec substitution stricte de variables. Aucune
génération libre de texte à l'envoi.

### 6.5 Quotas et interrupteurs
- Max **40 messages sortants/jour** toutes origines confondues, max **3 tentatives**
  par lead, max **1 message/lead/72 h**.
- Variable `MOTEUR_LEADS_ACTIF` (`false` par défaut) : interrupteur général.
- Mode `MOTEUR_LEADS_DRY_RUN` : tout est calculé et journalisé, rien n'est envoyé.
  **C'est le mode de la première semaine en production.**
- Toute action du moteur est tracée via `logAudit` avec `userId` nul et une action
  dédiée (`MOTEUR_LEAD`), pour être distinguable d'une action humaine dans la page Audit.

### 6.6 SMS
Le canal SMS n'existe pas encore dans l'app. v1 : le moteur **prépare** le texte et
l'admin l'envoie de son cellulaire (bouton « copier » + lien `sms:`), exactement comme
`marketing/06` le décrit aujourd'hui. v2 seulement : fournisseur (Twilio/Brevo) derrière
une interface `src/lib/sms.ts` calquée sur `src/lib/mailer.ts`, avec gestion du STOP.
Ne pas introduire de dépendance externe en v1.

---

## 7. Interface admin

Nouvelle page `src/pages/admin/MoteurLeads.tsx`, accessible aux `ADMIN`, ajoutée à la
navigation, réutilisant `Card` / `Button` / `Badge` / `Spinner` existants.

- **En-tête** : les 4 chiffres qui comptent — délai moyen de 1er contact (vert < 5 min,
  `marketing/07`), leads en attente de contact, essais prévus cette semaine, conversions
  du mois.
- **La file du jour** : une carte par tâche, triée par priorité, avec le nom, l'origine
  (badge coloré), le pourquoi en une phrase (« famille Tremblay : 1 enfant inscrit,
  gradation le 12 août »), le message pré-rédigé, et 3 boutons : **Approuver et
  envoyer** / **À appeler** / **Refuser**.
- **Timeline** dans le détail d'un lead (`LeadActivite`).
- **Onglet KPI** : leads par origine × statut, taux de conversion par origine, coût
  par origine (0 $ pour les gisements internes — c'est l'argument visuel).

La page Prospects existante reste la vue « toutes les demandes » ; le moteur est la vue
« quoi faire maintenant ».

---

## 8. Livraison par lots (chaque lot est déployable seul)

**Lot 1 — Fondations (le plus urgent).**
Migration additive (`externalId` unique, `essaiPrevuAt`, `origine`, `baseLegale*`,
`optOut*`, `premierContactAt`), `LeadActivite`, dédup partagée, clé `LEADS_API_KEY`,
rate limit sur la route publique. Critère d'acceptation : un lead de test posté deux
fois avec le même `externalId` ne crée qu'une ligne ; un lead posté sans clé se comporte
exactement comme avant.

**Lot 2 — Détection interne.**
Gisements 1 (fratrie), 2 (réactivation), 3 (froids) + scoring + `LeadTache` + page
Moteur en lecture seule. Critère : sur la base de production, la détection produit une
liste **vérifiable à la main** — l'admin reconnaît chaque famille listée.

**Lot 3 — Contact.**
File avec approbation, gabarits, quotas, dry-run, opt-out, timeline, KPI délai de
1er contact. Critère : une semaine complète en dry-run sans anomalie avant activation.

**Lot 4 — Inbound et boucle fermée.**
Activation du workflow n8n Meta avec `externalId`, gisement no-show, codes de
parrainage, KPI par créatif (`utmContent`) croisé avec les conversions réelles — ce que
le Gestionnaire de publicités Meta ne peut pas savoir (`PLAN-STRATEGIQUE-CSHP.md` §8.10).

---

## 9. Tests obligatoires avant chaque push

1. `npm run lint` (c'est `tsc --noEmit`) — zéro erreur.
2. Lead de test **de bout en bout** sur la route publique après TOUT changement de
   `leads.ts` : le champ ajouté arrive-t-il vraiment en base ? (rappel : zod supprime
   les champs inconnus en silence, `docs/surveillance.md` §4).
3. Vérifier que `GET /api/health/complet` répond toujours `ok:true`.
4. Vérifier que la page Prospects existante fonctionne à l'identique.
5. Tests unitaires de la dédup (homonyme avec coordonnées différentes = deux personnes,
   c'est un bug déjà corrigé une fois, ne pas le réintroduire).
6. Dry-run du moteur sur une copie de la base : compter les messages qui SERAIENT
   partis, et les relire un par un.

---

## 10. Conventions du dépôt à respecter

- **Tout est en français** : noms de variables métier, commentaires, messages
  d'interface, messages de commit.
- Les commentaires expliquent **le pourquoi**, pas le quoi (lire `src/routes/leads.ts`
  et `src/routes/retention.ts` pour le ton : ils expliquent la décision métier derrière
  le code).
- Pas de nouvelle dépendance npm sans nécessité démontrée.
- Réponses API via `sendSuccess` / `sendError` uniquement.
- Migrations Prisma **additives**, jamais destructives.
- Mettre à jour `DEVLOG.md`, `DOCUMENTATION.md` et `docs/surveillance.md` (nouveau
  maillon = nouveau détecteur) dans le même lot.

---

## 11. À trancher avant de coder (poser ces questions, ne pas deviner)

1. **Offre courante** : « essai gratuit » ou « Pass Découverte 19 $ » au moment de la
   mise en service ? Où est la source de vérité unique ?
2. **Champ « famille »** : le regroupement se fait-il sur le courriel du parent, le
   téléphone, ou `membreFamilleId` ? Lequel est le plus fiable dans les vraies données ?
3. **Anciens membres** : y a-t-il des départs conflictuels à exclure, et comment sont-ils
   marqués aujourd'hui ?
4. **SMS** : v1 manuelle assistée (recommandé) ou fournisseur dès le départ ?
5. **Validation juridique** : qui valide la politique de consentement et le texte de
   désabonnement avant activation ?
6. **Volume acceptable** : combien de contacts sortants par jour l'admin peut-il
   réellement traiter ? (Le quota doit refléter la capacité humaine, pas l'inverse.)
