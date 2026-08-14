# Documentation — CSHP Gestion

**Ce document est écrit pour quelqu'un (humain ou IA) qui ne connaît RIEN au
projet** et qui doit le comprendre, le déboguer ou le faire évoluer sans autre
contexte. Lisez les sections 1 à 3 avant de toucher au code : elles contiennent
les règles métier et les conventions dont la violation a déjà causé des bugs
réels (documentés en §10).

Dernière mise à jour majeure : **2026-08-12**.

---

## 1. Le contexte métier (à connaître absolument)

**Le client** : le Centre Sportif de Haute-Performance (CSHP), école d'arts
martiaux à Montréal — 6498 rue Beaubien Est, Montréal H1M 1A9, tél 514 747-5865,
courriel général `centrehp@outlook.com`, courriel de facturation/notifications
`payements@centresportifhp.com`. Disciplines : **Karaté, Judo, Ninjas** (enfants
4-9 ans), en groupes (`KARATE_GR1`, `NINJAS_GR1`, etc.). Clientèle : très
majoritairement des **enfants** — l'interlocuteur réel est presque toujours le
**parent** (c'est lui qui reçoit rappels, reçus et factures).

**L'histoire** : le club fonctionnait sur un Google Sheet (une feuille par
groupe, paires « montant payé / date » par ligne de membre, cases rouges
calculées par formules pour les paiements à venir). Cette application remplace
le Sheet. Les données historiques (Karaté ~69 membres, Ninjas ~25) ont été
**importées par CSV** ; le Judo reste à importer. La **sauvegarde quotidienne
Excel** (§7.3) reproduit volontairement le format du Sheet d'origine : c'est le
**plan de secours officiel** — si l'application tombe, le club continue de
fonctionner dans le dernier fichier reçu par courriel.

**Qui utilise quoi** : un ou deux **administrateurs** (propriétaire + adjointe)
gèrent tout ; des **coachs** ne font que le pointage des présences. Le
propriétaire vérifie le tableau de bord et exige que **chaque chiffre soit
exact** — les incohérences entre pages sont considérées comme des bugs graves
(elles coûtent de l'argent : suivis manqués = paiements jamais réclamés).

## 2. Les règles métier (la loi du centre)

Toute modification de code doit respecter ces règles. Elles priment sur toute
« bonne pratique » générique.

### Plans et tarifs
- Deux formules seulement : **TRIMESTRIEL 250 $** et **ANNUEL 790 $**. Le plan
  `MENSUEL` existe encore dans l'enum Prisma (contrainte : on ne supprime pas
  une valeur d'enum Postgres facilement) mais **n'existe plus nulle part dans
  l'interface ni la logique** — c'est un fossile, ne le réintroduisez pas.
- Les forfaits incluent **2 semaines de vacances l'hiver et 2 l'été** (fermeture
  du centre, déjà comprise dans le prix — mentionné sur la fiche d'inscription).
- **Les rabais s'ADDITIONNENT** : famille (−10 %) + rabais manuel (−X %) sur le
  prix de base. Ex. 790 $ famille + 10 % manuel = 790 × 0,80 = **632 $** (et non
  790 × 0,9 × 0,9). Implémenté dans `src/lib/tarifs.ts::calculerMontantFinal`.
- Beaucoup de familles ont des **ententes négociées** : `montantFinal` en base
  fait foi (ex. famille Bidi : 750 $/enfant au lieu de 790 ; famille Camara :
  3 enfants = 2 211 $/an payés 3 × 737 $ répartis un versement par enfant).
  **Ne jamais « recalculer » un montantFinal importé** sans demande explicite.
- Le **1ᵉʳ versement est exigible à l'inscription**. Le TRIMESTRIEL se paie en
  **une seule fois** (le formulaire ne propose pas 2/3 tranches pour ce plan).
- Prix **taxes incluses** (méthode québécoise) : base = montant / 1,14975 ;
  TPS 5 % ; TVQ 9,975 %. Numéros de taxes réels dans `recus.ts`/`factures.ts`.

### Cycle de vie d'un membre
```
Lead (prospect, essai)  →  conversion / fiche en ligne  →  Member EN_ATTENTE
      →  PREMIER PAIEMENT enregistré  →  ACTIF (automatique)
      →  départ : INACTIF (jamais supprimer un membre qui a payé)
```
- **EN_ATTENTE** = fiche reçue, aucun paiement. L'admin est alerté par courriel
  la veille de chaque cours de la section tant que c'est le cas.
- **ACTIF ← EN_ATTENTE est automatique** au premier paiement
  (`src/lib/paiements.ts::activerSiPremierPaiement`, branché sur TOUS les
  endpoints de paiement).
- **INACTIF** (membre parti) est **exclu de tout** : rappels courriel, listes de
  relance, totaux « à récupérer », vue de travail Paiements, prévisions. La
  suppression définitive (`DELETE ?definitif=1`, ADMIN) est **refusée** si le
  membre a des paiements encaissés.
- Un **visiteur d'essai est un Prospect (Lead)**, pas un membre EN_ATTENTE.

### Les trois dates d'un membre (source de confusion classique)
| Champ | Sens | Qui la modifie |
|---|---|---|
| `signupDate` (« Membre depuis ») | **Ancienneté** : première inscription au club | Jamais automatique ; corrigeable en Édition rapide |
| `dateInscription` | Début du **contrat en cours** | Déplacée à chaque **renouvellement** |
| `finContrat` | Fin du contrat en cours = dateInscription + 3 mois (TRIM) ou + 12 mois (ANNUEL) | Recalculée quand plan/dateInscription changent |

**`finContrat` est le moteur du système** : c'est elle qui déclenche les
courriels de renouvellement, la carte « Renouvellements échus » du tableau de
bord, le digest admin hebdomadaire et le badge rouge « Renouvellement dû ». Un
membre dont l'échéancier est soldé n'est « à jour » **que si son contrat
court encore** — c'était le bug le plus coûteux de l'histoire du projet (§10).

**Renouveler un membre** = bouton « 🔄 Renouveler » sur la fiche (bannière ou
carte de formule) : nouveau contrat + échéancier ajouté à la suite +
encaissement immédiat optionnel (reçu sauf CASH). **Le nouveau contrat
commence par défaut à la FIN de l'ancien** (continuité du service : l'athlète
a continué à venir même si le parent paie avec quelques semaines de retard) —
la date reste modifiable dans le modal si l'athlète a fait une vraie pause.
`signupDate` ne bouge jamais ; `finContrat` se recalcule.

### Paiements, reçus, frais de retard, factures
- Un paiement = un **versement** (`PaymentVersement`). Statut **dérivé** :
  payé si `datePaiement` non nulle ; sinon en retard si le **jour civil de
  Montréal** de `datePrevue` est entièrement passé ; sinon à venir.
- **CASH = jamais de reçu automatique** (reçu papier à l'accueil). Les autres
  méthodes déclenchent un reçu PDF par courriel, numéroté, idempotent
  (`receiptSentAt`), avec rappel du prochain versement ou de la fin de contrat.
- **Frais de retard** : compteur automatique **10 $/semaine après 7 jours de
  grâce**, calculé dynamiquement (jamais stocké). L'admin peut :
  (a) **exonérer** (`exonererFraisRetard`) ; (b) **charger un montant de son
  choix** (`fraisRetardFactures`, ex. 4 semaines = 40 $ courus mais on charge
  10 $). Le montant fixé remplace le compteur dans les rappels courriel et
  apparaît en **ligne distincte sur la facture annuelle**. Piloté depuis la
  fiche membre (onglet Paiements) via `PATCH /api/versements/:id/frais-retard`.
- **Factures annuelles** (page Membres → bouton « Factures ») : une facture
  **par famille** (enfants regroupés par lien famille / courriel / téléphone du
  parent — union-find dans `src/lib/factures.ts`), listant les montants
  **réellement versés** dans l'année civile choisie (+ frais chargés), avec
  sous-total par enfant, taxes, référence stable `F{annee}-XXXXXX`.

### Fiche d'inscription en ligne (`/inscription`, publique)
- Remplace le formulaire papier (copie imprimable : `documents/`).
- Autorisations obligatoires ; un **refus du droit à l'image BLOQUE la
  soumission** (message : passez à l'accueil). Consentements stockés sur Member.
- Anti-doublon : même nom (insensible à la casse) → EN_ATTENTE existant est
  **fusionné**, ACTIF existant → 409. Lead correspondant auto-CONVERTED.
- Crée le membre **EN_ATTENTE** + courriels (bienvenue au parent, notification
  à l'admin avec la provenance).
- Le règlement intérieur est **versionné** (`src/lib/reglement.ts`,
  `REGLEMENT_VERSION`) ; la version acceptée + signature + horodatage sont
  stockés sur le membre. **Si le texte change, incrémenter la version.**

### Inventaire, événements et affiliations (règles d'argent STRICTES)
- **Coût de revient (`coutAchat`) = interne club.** Il n'apparaît que sur la
  page admin Inventaire. Ne JAMAIS l'inclure dans un document destiné aux
  parents — seul `prixVente` est montrable.
- **Les ventes d'équipement ne s'ajoutent JAMAIS automatiquement à la facture
  annuelle** (le propriétaire les ajoute manuellement s'il le souhaite) et
  n'entrent pas dans les revenus de cotisations.
- **Affiliations et frais de compétition ne sont PAS des revenus du club** :
  l'argent transite vers la fédération. Ils ne doivent JAMAIS apparaître dans
  le tableau de bord ni les rapports financiers (garanti structurellement :
  rapports/dashboard ne lisent que `PaymentVersement`).
- **Saison d'affiliation = 1er septembre → 31 août** (« 2026-2027 »). C'est
  l'affiliation qui rend un athlète admissible aux compétitions — l'app
  **signale** (badge rouge) mais ne bloque jamais une inscription.
- À l'inscription d'un athlète à un événement, l'app **flag aussi tout solde
  dû au club** sur l'abonnement (retard, reste impayé, renouvellement échu) —
  demande explicite du propriétaire pour percevoir au passage.

### Divers
- Ne **jamais** stocker d'ethnicité ou donnée sensible équivalente (Loi 25) —
  le marketing (dossier `marketing/`, hors code) cible par contenu, pas par attribut.
- Signature courriel officielle : « Chers parents et athlètes, » + bloc
  Administration / CSHP / adresse / **tél 514 747-5865** / centrehp@outlook.com
  (`src/lib/mailer.ts::htmlCourriel` ; passer `salutation: null` pour les
  courriels internes admin).

## 3. Conventions techniques vitales (violer = réintroduire de vieux bugs)

1. **Toutes les dates « jour » sont stockées à MIDI UTC** (`2026-08-15T12:00:00Z`).
   Helper : `src/lib/tarifs.ts::dateAMidi(str)`. Ne jamais faire
   `new Date('2026-08-15')` pour stocker (= minuit UTC = la veille 20 h à
   Montréal, source d'off-by-one).
2. **L'arithmétique de mois se fait par composantes**, jamais par
   `setMonth()` : `src/lib/tarifs.ts::ajouterMoisISO(iso, n)` (bloque le
   débordement de fin de mois : 31 janv + 1 mois = 28/29 févr, pas le 3 mars).
   Utilisée par l'échéancier ET `calculerFinContrat` (partagés front/back).
3. **« Aujourd'hui » = le jour civil de MONTRÉAL**, jamais celui du serveur
   (Render tourne en UTC ; en hiver, 19 h 30 à Montréal est déjà « demain » en
   UTC). Motif standard :
   `new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date())`
   → `AAAA-MM-JJ`, puis `new Date(iso + 'T00:00:00Z')` comme borne. Présent dans
   reminders, payments, dashboard, rapports, finances, sauvegarde. Côté
   navigateur : `todayLocalISO()` / `joursAvantEcheance()` (`src/lib/format.ts`).
4. **Déduplication des courriels = table `ReminderLog`** (unique `type+refKey`).
   Un courriel n'est envoyé que si l'enregistrement n'existe pas ; il est créé
   **après** un envoi réussi (un échec est retenté à la tournée suivante).
   Types et refKeys exacts en §7.1. Ne jamais envoyer un courriel récurrent
   sans passer par ce mécanisme (`envoyerAvecLog`).
5. **`PUT /api/membres/:id` préserve l'identité des versements** : le
   remplacement de l'échéancier rapproche chaque versement de l'ancien (par id,
   sinon par numéro) et **conserve id, receiptNumber, receiptSentAt,
   exonererFraisRetard, fraisRetardFactures**. Sans cela : rappels re-envoyés
   aux parents et numéros de reçus réutilisés (bug historique).
6. **Une seule définition par notion** :
   - Statut de paiement d'un membre (frontend) : `src/lib/echeances.ts::etatPaiement`
     (types : RETARD, RENOUVELLEMENT_DU, ECHEANCE_PROCHE, RESTE_SANS_ECHEANCE,
     RENOUVELLEMENT_PROCHE, A_JOUR, GRATUIT) — utilisée par la liste Membres,
     la fiche, le Pointage.
   - « Encaissé » d'une période = somme des versements dont **datePaiement**
     est dans la période (jamais datePrevue). Partout.
   - Masse salariale : `src/lib/finances.ts::masseSalarialePourMois`
     (override du mois sinon somme CoachSalaire actifs). Partout.
7. **Le serveur ouvre son port EN PREMIER** (`server.ts`) ; migrations et
   montage du frontend suivent en arrière-plan. Render tue un déploiement dont
   le port n'ouvre pas vite (« Timed Out »). La **première tournée de rappels
   attend la fin des migrations** (`basePrete`) — sinon elle peut interroger
   une colonne pas encore créée.
8. Le client d'API frontend (`src/lib/api.ts::apiFetch`) déballe `{success,
   data}` et déclenche la déconnexion sur 401. Le middleware `authenticate`
   lit **le rôle en base à chaque requête** (pas dans le JWT) : un changement
   de rôle est immédiat, un compte désactivé (`actif=false`) est coupé net.

## 4. Stack, build et déploiement

- **Un seul processus Node** : Express sert `/api/*` **et** la SPA React.
- Frontend : React 19 + Vite 6 + React Router + Tailwind v4. Backend :
  Express + Prisma 5 + TypeScript. PDF : jsPDF. Excel : ExcelJS.
- `npm run dev` → `tsx server.ts` (Vite en middleware, import dynamique).
  `npm run build` → `vite build` (SPA → `dist/`) + `esbuild` (serveur →
  `dist/server.cjs`). `npm start` → `node dist/server.cjs` (sert la SPA
  statique dès que `dist/index.html` existe, indépendamment de NODE_ENV).
  Typecheck : `npx tsc --noEmit`.
- **Production** : Render (plan gratuit, service `cshp-backend`,
  https://cshp-backend.onrender.com) — **auto-déploiement de la branche
  `main`** ; build `npm install && npm run build`, start `npm start`.
  Base : **Neon Postgres** (serverless).
- Au démarrage : port ouvert (~1 s) → `prisma migrate deploy` en arrière-plan →
  amorçage `bootstrapIfEmpty` si base vide (admin + sections + cours) →
  libération des tournées de rappels.
- **UptimeRobot** pinge `GET /api/health` toutes les ~5 min : triple rôle —
  garder l'app éveillée (Render gratuit dort), démarrage rapide pour les
  usagers, et **déclencher la tournée quotidienne** (§7.1).
- **Bruit normal dans les logs** (ne pas « corriger ») :
  - `terminating connection due to administrator command` (57P01) : Neon coupe
    les connexions au repos ; Prisma se reconnecte seul.
  - Render : premier accès lent après une sieste (plan gratuit).

### Variables d'environnement (état réel en production)
| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Neon Postgres |
| `JWT_SECRET` | Obligatoire — le serveur refuse de démarrer sans |
| `RESEND_API_KEY` | Transport courriel **actif en prod** (domaine centresportifhp.com vérifié chez Resend) |
| `SMTP_HOST/PORT/USER/PASS` | Transport de repli si RESEND_API_KEY absent |
| `EMAIL_FROM` | Défaut `CSHP <payements@centresportifhp.com>` |
| `EMAIL_REPLY_TO` | Défaut `centrehp@outlook.com` |
| `INSCRIPTION_NOTIF_EMAIL` | **Configurée en prod** (payements@centresportifhp.com) : tout le canal admin (fiches reçues, EN_ATTENTE avant cours, retards répétés, digest renouvellements, prospects à relancer) est muet sans elle |
| `BACKUP_EMAIL` | Sauvegarde quotidienne (défaut `centrehp@outlook.com`) |
| `APP_URL` | URL publique (logo des courriels, liens d'inscription) |
| `CRON_SECRET` | Protège `GET /api/cron/reminders` (cron externe optionnel) |
| `ABSENCE_ALERTES` | `off` = suspendre les courriels d'absence (vacances du centre) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte admin d'amorçage (défaut `ilyes@cshp.ca` — attention : ce n'est **pas** une vraie boîte courriel) |
| `RECU_NOM/ADRESSE/TPS/TVQ/NEQ` | Coordonnées des reçus (numéros réels par défaut) |
| `FACTURE_ADRESSE` / `FACTURE_TEL` | Coordonnées des factures (défauts : 6498 rue Beaubien E… / 514 747-5865) |

## 5. Modèle de données (`prisma/schema.prisma`)

- **Member** — voir §2 pour le sens des champs. Notables : `status`,
  `plan`, `prixBase`, `rabaisFamille`, `rabaisCustomPct`, `raisonRabaisCustom`,
  `montantFinal` (fait foi), `membreFamilleId` (lien famille),
  `referePar`/`refereParNom` (parrainage), `provenance`
  (BOUCHE_A_OREILLE/RESEAUX_SOCIAUX/WEB/ECOLE/AUTRE), `signupDate`,
  `dateInscription`, `finContrat`, contacts parent (`parentName/Phone/Email` —
  **parentEmail est LE destinataire prioritaire** de tous les courriels ;
  plusieurs adresses séparées par `;` acceptées partout), urgence
  (`urgenceNom/Lien/Tel`), santé, consentements (`consentPhoto/Urgence/
  Communications`), règlement (`reglementVersion/AccepteAt/Signataire`).
- **PaymentVersement** — `numeroVersement`, `montant`, `datePrevue`,
  `datePaiement?`, `methodePaiement?` (CASH/VIREMENT/CHEQUE/CARTE),
  `exonererFraisRetard`, `fraisRetardFactures?` (frais chargés, null =
  compteur), `receiptNumber?`, `receiptSentAt?`, `note`. (`reminderSentAt` =
  legacy inutilisé.)
- **MemberSection** — appartenance à un groupe (`section` = code de la table
  `Section`, `belt`). Un membre peut avoir plusieurs groupes ; pour les
  agrégations financières, il est attribué à son **premier** groupe.
- **Course** — cours récurrent (`jours: String[]` ex. `["LUN","MER"]`,
  codes DIM..SAM). Sert au Pointage et à l'alerte « EN_ATTENTE avec cours demain ».
- **Attendance** — présences pointées (unique memberId+courseId+date). **Seuls
  les présents sont pointés** — il n'existe jamais de ligne ABSENT (d'où les
  taux calculés sur `séances × effectif`, §10.16).
- **Lead**, **Section**, **Grade**, **User** (staff : ADMIN / SECTION_MANAGER /
  COACH ; mots de passe bcrypt), **AuditLog** (traçabilité, incl. les erreurs
  courriel `action='ERREUR', entity='Courriel'`), **ReminderLog** (§3.4),
  finances (**MasseSalariale**, **CoachSalaire**, **DepenseConfig**, **Depense**
  — ATTENTION : `Depense.mois = null` signifie « retranchée CHAQUE mois »).
- **ArticleInventaire** — équipement en stock (`nom`, `categorie` KIMONO/GANTS/
  PROTEGE_TIBIAS/PROTEGE_DENTS/CEINTURE/COQUILLE/CHANDAIL/PANTALON/AUTRE,
  `discipline?`, `taille?`, `couleur?`, `marque?`, `quantite`, `seuilAlerte?`).
  **`coutAchat` = coût de revient INTERNE club (jamais montré aux parents) ;
  `prixVente` = seul prix montrable/facturable.** Tout est modifiable dans l'UI.
- **VenteEquipement** — trace « qui a acheté quoi » (`membreId?` null = vente
  comptoir, `prixUnitaire` copié au moment de la vente, `methode?`). La vente
  décrémente le stock ; l'annulation (DELETE) le réincrémente. **JAMAIS ajoutée
  automatiquement à la facture annuelle, JAMAIS comptée dans les revenus**
  (rapports/dashboard ne lisent que PaymentVersement).
- **Affiliation** — affiliation fédération par athlète/discipline (KARATE|JUDO)
  et par **saison « AAAA-AAAA » (1er sept. → 31 août**, calcul dans
  `src/lib/saison.ts`). Unique (membreId+discipline+saison). `montant` = remis
  à la fédération : **PAS un revenu club**. Détermine l'admissibilité aux
  compétitions.
- **Evenement** / **EvenementInscription** — compétitions, passages de grade,
  autres (`fraisInscription` transite vers la fédération). Inscription unique
  (evenementId+membreId), `fraisPaye` = frais remis. L'admissibilité est
  calculée à la volée : affiliation valide pour la **saison de la DATE de
  l'événement** + flag « solde dû au club » (versements en retard, reste
  impayé, renouvellement échu) — on signale, on ne bloque jamais.
- Migrations : baseline unique + migrations additives datées. Nouvelle colonne
  → `prisma/migrations/<timestamp>_<nom>/migration.sql` écrit à la main +
  champ dans schema.prisma (le déploiement l'applique au démarrage).

## 6. API (`server.ts` monte tout sous `/api`)

Réponses : `{ success, data }` / `{ success:false, error }`. Auth : JWT Bearer
(7 j, localStorage `cshp_token`). Rôles vérifiés par `requireRole`.

**Portée par discipline (`src/lib/portee.ts`)** : les ADMIN voient tout ; un
COACH ou SECTION_MANAGER voit **toutes ses disciplines** — le compte porte une
liste de sections séparées par des virgules (la page Coachs coche plusieurs
groupes : « JUDO_GR1,JUDO_GR2 ») ; CHAQUE code résout vers son sport (code de
la table Section → sport ; sinon nom de sport direct ; sinon racine avant
« _ » — robuste aux groupes absents de la table) et couvre TOUS les groupes de
ce sport (+ filtre par préfixe du sport côté membres). Un staff SANS section
attitrée ne voit RIEN (message explicite dans la page Membres) — assigner ses
groupes dans la page Coachs. Concrètement pour le staff non admin :
membres (liste + fiche) limités au sport ; inventaire en lecture (coût de
revient MASQUÉ, réservé admin) + vente au prix affiché uniquement (prix forcé
côté serveur) ; affiliations et événements (CRUD + inscriptions) limités à sa
discipline (les événements « TOUS » sont visibles mais gérés par l'admin
seulement). Création/édition/suppression d'articles, ajustements de stock,
annulation de vente, catalogue : admin seulement. Un compte staff sans
section reconnue garde un filtre strict sur sa valeur de section.

| Route | Accès | Points clés |
|---|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | public / connecté | me lit la base (rôle à jour) |
| `GET /api/membres` | connecté (SM filtré sur sa section) | inclut `sections` + `versements` (le Pointage et les badges s'en servent) |
| `POST /api/membres` | ADMIN, SM | calcule finContrat/montantFinal si plan fourni ; bienvenue + audit |
| `PUT /api/membres/:id` | ADMIN, SM | partiel ; recalcul si plan/date/rabais changent ; **préserve l'identité des versements** (§3.5) ; `membreDepuis` → signupDate |
| `PATCH /api/membres/:id/statut` | ADMIN, SM | ACTIF/INACTIF/EN_ATTENTE, audité |
| `DELETE /api/membres/:id?definitif=1` | ADMIN | refusé si paiements encaissés |
| `POST /api/membres/factures` | ADMIN | `{memberIds[], annee}` → factures par famille (PDF base64), audité |
| `PUT /api/versements/:id/payer` | ADMIN, SM | paie + activation EN_ATTENTE→ACTIF + reçu (sauf CASH) |
| `PATCH /api/versements/:id/frais-retard` | ADMIN | `{exonerer}` et/ou `{montantFacture}` (null = compteur), audité |
| `GET /api/paiements?month&section&status` | connecté | vue mensuelle : dû ∪ payé du mois ; **le mois courant inclut tous les impayés échus** des mois passés (hors INACTIF) ; statut au jour civil |
| `POST /api/paiements`, `PATCH /:id/payer`, etc. | ADMIN, SM | tous appellent activation + reçu |
| `GET /api/dashboard/resume` | ADMIN | revenus (datePaiement), retards (membres distincts), **renouvellements échus**, présences semaine (lundi Montréal), masse salariale (source unique) |
| `GET /api/dashboard/kpis` | ADMIN | MRR (contrats en cours seulement), recouvrement, rétention, **prévision 3 mois** (échéancier hors INACTIF + renouvellements attendus par mois) |
| `GET /api/rapports/financier?mois&annee&cumul=` | ADMIN | mode période/cumul réel ; ou `?from&to` : rapport détaillé (encaissé = payé dans la période, retards+**renouvellementsEchus** pour la relance, présences honnêtes, masse salariale mois écoulés) |
| `GET /api/rapports/export-csv` | ADMIN | export CSV |
| `GET /api/presences/*`, `/api/cours`, `/api/grades`, `/api/sections` | connecté | pointage `POST /api/presences/pointer` |
| `GET/POST/PUT/DELETE /api/coachs` | ADMIN (liste : connecté) | **comptes staff, y compris ADMIN** ; mot de passe temporaire renvoyé une fois ; garde-fou : impossible de rétrograder/désactiver le **dernier admin actif** ; tout audité |
| `POST /api/import` | ADMIN | CSV membres + versements (§9.3) |
| `POST /api/inscription` (public, rate-limité), `GET /api/inscription/sections`, `POST /api/inscription/inviter` (ADMIN/SM) | | fiche en ligne (§2) ; inviter = envoi du lien par courriel |
| `POST /api/leads` (public), CRUD + `POST /:id/convert` (ADMIN) | | conversion : fusion **seulement si courriel/téléphone concordent** (homonyme = nouveau dossier + note) |
| `POST /api/communications` / `test` / `config` | ADMIN | envoi groupé multi-sections ; test vers adresse au choix ; diagnostic transport |
| `POST /api/backup` | ADMIN | sauvegarde Excel immédiate |
| `GET/POST/PUT/DELETE /api/inventaire` + `POST /:id/stock {delta}` | ADMIN | CRUD articles ; DELETE = suppression si aucune vente, sinon désactivation ; `POST /api/inventaire/seed-karate` = catalogue karaté idempotent (prix de VENTE fournis par le club, coût de revient à saisir) |
| `GET/POST /api/inventaire/ventes`, `DELETE /ventes/:id` | ADMIN | vente (décrémente stock, prix copié, membre optionnel), annulation (réincrémente) ; `?membreId=` → achats d'un dossier |
| `GET/POST/PUT/DELETE /api/affiliations` | ADMIN | par membre/discipline/saison (doublon → 400) ; GET renvoie aussi `saisonCourante` |
| `GET/POST/PUT/DELETE /api/evenements` + `/:id/inscriptions` | ADMIN | détail = participants avec `admissibilite` calculée (affiliation de la saison de l'événement + `solde` dû au club) ; PATCH inscription `{fraisPaye}` ; DELETE événement = archivage si inscriptions |
| `GET /api/audit` | ADMIN | journal (cherchez `ERREUR / Courriel` pour les envois ratés) |
| `GET /api/health` | public | ping UptimeRobot |
| `GET /api/cron/reminders` | Bearer CRON_SECRET | tournée à la demande |

## 7. Les automatisations (le cœur du système)

### 7.1 La tournée de rappels (`src/lib/reminders.ts`)
**Déclenchement** : à la première requête entrante entre **8 h et 20 h (heure
de Montréal)**, au plus une fois toutes les **6 h**, après la fin des
migrations. Avec UptimeRobot → concrètement 1-2 tournées/jour. Sans transport
courriel configuré, la tournée s'arrête immédiatement (log explicite).

**Cadences par type (dédup ReminderLog `type` : `refKey`)** — aux parents
(`parentEmail` sinon `email` du membre), INACTIF exclus partout, versements
à 0 $ ignorés :

| Type | Quand | refKey | Plafond |
|---|---|---|---|
| `PAIEMENT_J7` | 7 jours avant l'échéance | id du versement | 1 |
| `PAIEMENT_J0` | le jour de l'échéance | id du versement | 1 |
| `PAIEMENT_RETARD` | étagé : ~J+1, ~J+8, ~J+15 | `id` (étage 0), `id:S1`, `id:S2` | **3 max**, puis silence ; **jamais si le retard a > 90 jours** (historique importé) |
| `RENOUVELLEMENT` | J-30 (fenêtre 8-30 j), J-7 (0-7 j), ÉCHU (1-90 j après) | `id:finISO` (R30), `id:finISO:R7`, `id:finISO:ECHU` | 3 max par contrat ; le courriel inclut le montant de la formule |
| `ABSENCE` | ~14 j et ~28 j sans présence pointée | `id:derniereDateISO:A14/:A28` | 2 max par épisode ; reset au retour ; `ABSENCE_ALERTES=off` pour suspendre |

À l'admin (`INSCRIPTION_NOTIF_EMAIL`) :

| Type | Quand | refKey |
|---|---|---|
| `EN_ATTENTE_COURS` | la veille d'un cours de la section d'un membre EN_ATTENTE | `membreId:dateDemain` |
| `RETARD_REPETE` | ≥ 2 retards (payés en retard ou impayés > 7 j) dans les **6 derniers mois** | `membreId:AAAA-MM` (1/mois) |
| `RENOUVELLEMENTS_ECHUS` | **digest hebdomadaire** : tous les contrats ACTIFS terminés non renouvelés (même sans courriel ou échus > 90 j), avec restes | `SEMAINE:lundiISO` |
| `LEAD_RELANCE` | prospect NEW sans suivi depuis 3 j | id du lead (1 seule fois) |
| `SAUVEGARDE_QUOTIDIENNE` | §7.3 | date Montréal (1/jour) |

Les frais de retard affichés dans les rappels = `fraisRetardFactures` si fixé,
sinon le compteur couru. Les erreurs d'envoi vont dans l'Audit
(`ERREUR/Courriel`) et sont retentées à la tournée suivante.

### 7.2 Courriels transactionnels
- **Bienvenue** (création de membre / fiche en ligne) — avec vidéos de katas si Karaté.
- **Reçu de paiement** (sauf CASH) — PDF, numéro séquentiel, prochain versement
  ou fin de contrat (formulation adaptée si le suivant est déjà échu).
- **Invitation à s'inscrire** (bouton Prospects) — lien vers la fiche en ligne.
- **Notification de fiche reçue** (admin) — avec provenance.
- Envoi groupé manuel : page Courriels (multi-sections, échecs listés).

### 7.3 Sauvegarde quotidienne (`src/lib/sauvegarde.ts`)
Une fois par jour (via la tournée), envoie à `BACKUP_EMAIL` un classeur Excel
**auto-suffisant** calqué sur le Google Sheet d'origine :
- **Une feuille PAR GROUPE** : fiche complète par membre + 5 paires
  « montant/date » de versements. **Convention cruciale** : montant rempli +
  date = **payé** (date de paiement) ; montant **vide** + date = **à
  percevoir** (date prévue).
- Colonne **SUIVI** calculée par de **vraies formules Excel/Sheets**
  (`TODAY()`, `ISNUMBER` — pas ISDATE qui n'existe qu'en Sheets) : « À
  SUIVRE » (rouge) si un paiement vient à échéance sous 7 jours ou est passé,
  ou si la fin de contrat approche. TOTAL PAYÉ (SUM), RESTE, ÂGE (DATEDIF)
  sont aussi des formules → **le fichier reste vivant après un crash**.
- Feuilles Résumé (par groupe, ligne TOTAL, sans double comptage multi-groupes)
  et Transactions (journal complet).
- Le courriel contient le résumé du jour (encaissé, nouvelles inscriptions,
  retards). Envoi manuel : bouton dans Courriels ou `POST /api/backup`.

## 8. Frontend (pages principales)

- **Tableau de bord** (ADMIN) : cartes cliquables — « Retards de versements »
  → `/paiements?statut=EN_RETARD` ; « Renouvellements échus » →
  `/membres?suivi=renouvellement`. Prévision de trésorerie 3 mois (échéancier +
  renouvellements attendus). Toutes les définitions en §3.6.
- **Membres** : table avec badges d'état (`etatPaiement`), filtres
  section/statut/recherche, filtre URL `?suivi=renouvellement`, mode
  **Factures** (cases à cocher + année + génération par famille).
- **Fiche membre** (`/membres/:id`) : **Édition rapide** (groupe, ceinture,
  coordonnées, dates, poids, notes — ne touche JAMAIS au plan/échéancier) vs
  **Profil complet** (assistant 4 étapes). Onglet Paiements : bannières
  renouvellement/solde, échéancier, encaisser, frais de retard
  (exonérer / charger un montant), suppression définitive (double confirmation).
- **MembreForm (Profil complet)** : 4 étapes. Protections importantes : en
  édition, `modeVersement` est forcé à « custom » (l'échéancier existant n'est
  pas régénéré — protection de l'historique de paiements) ; la validation
  « total versements = montant final » ne s'applique qu'aux ACTIFS ; TRIMESTRIEL
  n'offre que « 1 fois »/« Perso. » ; Entrée ne soumet pas le formulaire.
- **Paiements** : vue mensuelle de travail (voir §6 `/api/paiements`), bandeau
  « Reçu ce mois / À venir / En retard (total) », marquer payé.
- **Pointage** (coachs) : liste des ACTIFS de la section du jour + **badge de
  rappel** (retard rouge / échéance ≤ 7 j ambre / renouvellement / solde) pour
  que le coach fasse le rappel en personne.
- **Prospects** : leads avec date de demande + badge « X j sans suivi »,
  conversion, invitation à la fiche en ligne.
- **Rapports** : période, revenus, répartition par groupe, masse salariale
  éditable par mois (total = mois écoulés), **liste de relance** (retards +
  renouvellements échus) exportable PDF/CSV.
- **Finances** : module financier (mois/année, cumul vs période, charges —
  attention au sens de « récurrente = chaque mois »), taxes.
- **Coachs** : comptes staff **et administrateurs** (garde-fou dernier admin),
  mot de passe temporaire affiché une seule fois.
- **Inventaire** (ADMIN) : stock filtrable (discipline/catégorie), coût interne
  vs prix de vente, ± stock, Vendre (recherche membre, prix ajustable),
  Dupliquer (déclinaison par taille), onglet Ventes (« qui a acheté quoi »,
  annulation = stock réajusté), bouton « Catalogue karaté » (seed idempotent).
- **Événements** (ADMIN) : onglet Événements (à venir/passés, détail avec
  participants + badges admissibilité : affilié ✓/✗ pour la saison de
  l'événement, « Doit X $ au club », « Renouvellement échu », frais remis) ;
  onglet Affiliations (par saison/discipline, ajout avec recherche d'athlète).
  La fiche membre (profil) a sa carte « Affiliations fédération » et l'onglet
  Paiements liste les « Achats d'équipement ».
- **Courriels** (Communications) : config transport, test, envoi groupé, backup.
- **Import**, **Audit**, **Sections**, **Planning**, **Inscription** (publique).

## 9. Procédures d'exploitation (recettes)

### 9.1 Encaisser / renouveler
- Encaisser : fiche membre → onglet Paiements → « Encaisser » (ou page
  Paiements → « Marquer comme payé »). CASH = pas de reçu courriel.
- Renouveler : §2 (« Renouveler un membre »). Les badges/cartes/digest révèlent
  qui est échu.

### 9.2 Comptes
Coachs → Ajouter → rôle (Coach / Section Manager / **Administrateur**). Mot de
passe vide = temporaire affiché une fois. Changement de rôle effectif au
rafraîchissement (rôle lu en base).

### 9.3 Import CSV (page Import, ADMIN)
- **Membres** (23 colonnes) : `prenom,nom,dateNaissance,genre,courriel,telephone,
  nomParent,telephoneParent,courrielParent,statut,section,plan,prixBase,
  rabaisFamille,membreFamille,rabaisCustomPct,raisonRabais,montantFinal,
  dateInscription,finContrat,ceinture,notes,membreDepuis`. Dédoublonné par nom
  complet (insensible à la casse) — un existant est **ignoré**, jamais modifié
  (⚠️ ses versements du fichier s'attacheraient au dossier existant : importer
  les membres D'ABORD, vérifier « ignorés = 0 », puis les versements).
  `signupDate` = `membreDepuis` si fournie, sinon `dateInscription`.
- **Muselage anti-rattrapage (automatique)** : pour tout membre importé dont la
  fin de contrat est passée ou à ≤ 30 jours, les trois étages de renouvellement
  (R30/R7/ÉCHU) sont marqués envoyés dans ReminderLog — un import d'historique
  ne déclenche JAMAIS de courriels rétroactifs aux parents (l'admin gère ces
  cas en personne ; le cycle normal reprend au contrat suivant). Les retards
  importés > 90 jours sont déjà silencieux par design. Le rapport d'import
  renvoie `rappelsMuseles`.
- **Versements** : `nomComplet,numero,montant,datePrevue,datePaiement,methode,note`.
  `datePaiement` vide = à percevoir. Rattachement par nom complet en essayant
  **toutes les coupures prénom/nom** (noms composés). Dédoublonné par
  (membre, numéro, montant, datePrevue) — réimporter est sans danger.
- Convention héritée du Sheet : *« date présente + montant de la case
  précédente vide = paiement à venir »*. **Tout montant bizarre doit être
  clarifié avec le propriétaire avant d'être inscrit** (règle posée par lui).

### 9.4 Si l'application est en panne
1. Le dernier courriel « 📦 Sauvegarde CSHP » (quotidien) contient le classeur
   complet : le club opère dedans (formules actives) en attendant.
2. Diagnostic : logs Render (service cshp-backend), page Audit
   (`ERREUR/Courriel`), Neon (base `neondb`). Bruit normal : §4.
3. Re-déploiement : pousser sur `main` (auto), ou Render → Manual Deploy
   (→ Clear build cache si besoin). Un « Timed Out » au deploy = le port n'a
   pas ouvert (voir §3.7) — ne devrait plus arriver.
4. En local : `npm install`, `.env` (DATABASE_URL Postgres local + JWT_SECRET),
   `npx prisma migrate deploy`, `npm run dev`. Admin d'amorçage :
   `ilyes@cshp.ca` / `Admin2026!` (si base vide).

## 10. Historique des bugs corrigés (le POURQUOI des conventions)

Chaque entrée = un bug réel trouvé en audit puis corrigé. Si un symptôme
similaire réapparaît, vérifier qu'une régression n'a pas réintroduit la cause.

1. **« À jour » alors que le contrat était fini** : le solde ignorait
   `finContrat` → renouvellements invisibles (argent perdu). → `etatPaiement`
   + carte dashboard + digest + rappels multi-étapes.
2. **Rappel de retard envoyé UNE seule fois à vie** (refKey = id) → parents
   jamais relancés. → étages S0/S1/S2 plafonnés.
3. **Renouvellement : un seul courriel à J-30, rien après l'échéance.** →
   R30/R7/ÉCHU + digest hebdo.
4. **Absences : un courriel par semaine à l'infini** (y compris pendant les
   fermetures). → 2 par épisode + `ABSENCE_ALERTES=off`.
5. **Édition d'un membre = rappels re-envoyés + numéros de reçus réutilisés**
   (deleteMany+create régénérait les ids). → préservation des ids (§3.5).
6. **Le formulaire admin n'avait AUCUN champ parent** (courriel parent
   impossible à saisir → aucun rappel pour les membres créés à la main).
7. **Échéancier décalé d'un mois** (`new Date('YYYY-MM-DD')` UTC +
   `setMonth` local) : inscription au 1ᵉʳ → versements le 28 du mois
   précédent ; 31 janv + 1 mois = 3 mars. → `ajouterMoisISO`/`dateAMidi`.
8. **Fenêtres de rappels en jours UTC** : en hiver après 19 h, tout partait
   un jour trop tôt. → jours civils de Montréal partout.
9. **« Encaissé » compté en double dans les Rapports** (payé d'avance compté
   dans deux mois). → encaissé = datePaiement dans la période, partout.
10. **Le filtre par défaut de Paiements cachait les impayés des mois passés**
    (les plus urgents). → la vue du mois courant les inclut toujours.
11. **« Mois précédent » cassé les 29/30/31** (débordement setMonth). →
    arithmétique de chaînes.
12. **Masse salariale : 3 sources différentes** (dashboard ≠ finances ≠
    rapports) et mois futurs imputés (« 148 % des revenus »). → source unique
    + mois écoulés.
13. **Conversion d'un prospect homonyme** : fusion silencieuse avec un autre
    membre (inscription perdue). → fusion seulement si coordonnées concordent.
14. **Membres INACTIFS relancés / comptés** partout. → exclus de tout.
15. **Rabais multiplicatifs** (790×0,9×0,9) au lieu d'additifs. → additifs.
16. **Taux de présence toujours 100 %** (seuls les présents sont pointés). →
    présences / (séances × effectif). NB : la page Présences a encore son
    ancienne variante (dette assumée).
17. **Rôle figé dans le JWT** : promotion admin sans effet avant reconnexion ;
    compte désactivé encore actif. → rôle lu en base, `actif` vérifié.
18. **Render « Timed Out »** : port ouvert en dernier + Vite chargé en prod. →
    port d'abord, Vite en import dynamique dev-only.
19. **Course au déploiement** : première tournée avant la fin des migrations
    (« column does not exist », one-shot). → gate `basePrete`.
20. **Adresses multiples « a; b »** : gérées partout via `parseDestinataires`.

## 11. Dette technique restante (assumée, non corrigée)

- Frontend : `any` généralisé, gros composants (`Rapports`, `MembreForm`,
  `MembreDetail`, `Finances`), pas de code-splitting (bundle ~1,6 Mo).
- La page **Présences** calcule encore son propre taux (3ᵉ définition,
  cosmétique) ; la carte Présences du dashboard n'a comme dénominateur que les
  séances ayant au moins un pointage.
- `requireRole` ne cloisonne pas un SECTION_MANAGER à sa section sur toutes
  les routes (durcir si le staff grandit).
- `Modal` sans Échap/focus-trap ; âge par différence d'années (off-by-one
  avant l'anniversaire) dans un affichage.
- SMS non implémenté (tout passe par courriel).
- Les enregistrements datant d'avant la convention « midi UTC » restent à
  minuit UTC (décalage d'affichage d'un jour possible sur de très vieilles
  lignes — sans impact sur les calculs actuels, qui comparent des jours civils).
- Frais de retard chargés : inclus sur la facture et la fiche, mais **pas**
  dans les totaux « encaissé » des rapports (choix : le versement seul fait foi
  dans la comptabilité des revenus).

## 12. Données réelles : particularités à connaître

- Familles avec ententes : Bidi (750 $/enfant), El Kabriti (750), El Maghraoui
  (750), El Ouerdani (792 = 3×264), Nacib (660), Zaamoum (760), Al-honsali
  (200 $/trimestre — entente), Camara (2 211 $/an pour 3 enfants, versements
  répartis entre Karaté et Ninjas).
- Yaici Maelys : **aucun courriel** (téléphone seulement) — invisible pour les
  rappels, suivie via le digest admin et les badges.
- Dossiers Ninjas retirés de la feuille de paiements par le propriétaire
  (statut à clarifier avec lui) : Bekkouche, Neves, Robleh, Senou.
- Les « restes » Daoud (185 $ / 165 $) n'ont volontairement **pas** de
  versement planifié (aucune date convenue) — ils apparaissent comme « Reste
  sans échéance » et dans le digest.

## 13. Arborescence commentée du dépôt

```
server.ts                                 Point d'entrée : Express, montage des routes, port ouvert en premier, migrations+amorçage en arrière-plan, déclencheur intégré des rappels (gate migrations), route cron, service de la SPA (statique en prod, Vite dynamique en dev).
package.json                              Scripts (dev/build/start/lint), dépendances ; postinstall = prisma generate ; "type": "module".
package-lock.json                         Verrou des versions npm (Render fait npm install dessus).
tsconfig.json                             Configuration TypeScript (typecheck : npx tsc --noEmit).
vite.config.ts                            Configuration Vite (build de la SPA, alias, proxy dev).
index.html                                Coquille HTML de la SPA (point d'entrée Vite).
.env.example                              Gabarit des variables d'environnement (voir §4).
.gitignore                                Exclusions git (node_modules, dist, .env…).
README.md                                 Présentation courte du projet.
DEVLOG.md                                 Journal de développement historique (contexte des premières décisions).
DOCUMENTATION.md                          CE document — la référence de reprise.
LOGO.jpg                                  Logo source du club (brut).
public/logo.png                           Logo servi par l'app (courriels, reçus, factures — chargé par recus.ts::chargerLogo).
public/README.md                          Note sur le contenu du dossier public.
documents/fiche-inscription-2026-2027.html  Fiche d'inscription PAPIER (2 pages A4, règlement au verso) — ouvrir dans un navigateur et imprimer en PDF.
marketing/                                Hors code : playbook marketing 90 jours (01-10), suivi/ (tableau de bord, campagnes, budget, apprentissages), templates/. Point d'entrée : marketing/README.md.

prisma/schema.prisma                      Modèle de données (source de vérité — voir §5).
prisma/migrations/20240101000000_init/    Baseline unique alignée sur le schéma d'origine.
prisma/migrations/20260810160000_consentements_fiche/   + consentPhoto/consentUrgence/consentCommunications sur Member.
prisma/migrations/20260810170000_frais_retard/          + exonererFraisRetard sur PaymentVersement.
prisma/migrations/20260810190000_provenance/            + provenance et refereParNom sur Member.
prisma/migrations/20260811150000_membre_depuis_backfill/  Rattrapage : signupDate ← dateInscription (ancienneté, voir §2).
prisma/migrations/20260812010000_frais_retard_factures/   + fraisRetardFactures (frais chargés au choix de l'admin).
prisma/migrations/20260813100000_inventaire_evenements/    + ArticleInventaire, VenteEquipement, Affiliation, Evenement, EvenementInscription (modules inventaire & événements).
prisma/migrations/migration_lock.toml     Verrou Prisma (provider postgresql).
prisma/seed.ts                            Seed officiel : appelle seedInitialData (admin, sections, cours, charges).
prisma/seed-test.ts                       Jeu de données de test local (membres/versements factices).
prisma/seed-test-cleanup.ts               Nettoyage du jeu de test local.
scripts/seed.ts                           Variante CLI du seed (usage ponctuel en dev).
scripts/test-api.ts                       Petit banc d'essai HTTP de l'API en local (axios, localhost:3000).

src/main.tsx                              Bootstrap React (monte <App/> dans index.html).
src/App.tsx                               Routes React Router : toutes les pages, dont /inscription (publique) et /pointer.
src/index.css                             Tailwind v4 + variables du thème (--color-cshp-red…).

src/middleware/auth.ts                    authenticate (JWT + rôle lu EN BASE + refus des comptes désactivés) et requireRole.
src/middleware/rateLimit.ts               Limiteur de débit maison (login 10/15 min, inscription publique 5/h).

src/routes/auth.ts                        POST /login (JWT 7 j), GET /me.
src/routes/members.ts                     CRUD membres (préservation des versements §3.5, parentEmail, membreDepuis), statut, suppression définitive protégée, POST /factures (factures annuelles par famille).
src/routes/versements.ts                  PUT /:id/payer (activation + reçu), PATCH /:id/frais-retard (exonérer / charger un montant).
src/routes/payments.ts                    GET /api/paiements (vue mensuelle de travail §6) + chemins de paiement historiques + /retards.
src/routes/attendances.ts                 POST /pointer (présences en masse), stats de présence par section.
src/routes/courses.ts                     CRUD des cours récurrents (jours de semaine).
src/routes/grades.ts                      Passages de grade (+ mise à jour de la ceinture dans MemberSection).
src/routes/sections.ts                    Catalogue des groupes (codes/labels), consommé par useSections.
src/routes/dashboard.ts                   Agrégats du tableau de bord : résumé (retards, renouvellements échus, présences semaine, masse salariale), revenus, KPIs + prévision 3 mois.
src/routes/rapports.ts                    /financier (mois+cumul OU plage from/to : revenus, relance retards+renouvellements, présences, masse salariale) et /export-csv.
src/routes/coachs.ts                      Comptes du personnel Y COMPRIS administrateurs (mot de passe temporaire une fois, garde-fou dernier admin, audit).
src/routes/masseSalariale.ts              Saisie de la masse salariale par mois (override).
src/routes/coachSalaire.ts                Salaires individuels des coachs (source par défaut de la masse salariale).
src/routes/depenses.ts                    Charges ponctuelles/mensuelles (rappel : mois=null → CHAQUE mois).
src/routes/depenseConfigs.ts              Charges de base à hausse automatique annuelle (ex. LOYER).
src/routes/import.ts                      Import CSV membres + versements (formats §9.3, dédoublonnage, coupures de noms composés).
src/routes/inscription.ts                 Fiche en ligne publique (consentements bloquants, anti-doublon, conversion de lead, courriels) + /inviter + /sections.
src/routes/leads.ts                       Prospects : création publique, gestion, conversion protégée contre les homonymes.
src/routes/communications.ts              Config courriel (diagnostic), envoi de test, envoi groupé multi-sections.
src/routes/backup.ts                      POST /api/backup : sauvegarde Excel immédiate.
src/routes/audit.ts                       Lecture du journal d'audit.
src/routes/inventaire.ts                  Inventaire : CRUD articles (coût interne vs prix de vente), ± stock, seed catalogue karaté idempotent, ventes (décrément/réincrément du stock, membre optionnel).
src/routes/evenements.ts                  Événements + inscriptions avec admissibilité calculée (affiliation de la saison de l'événement + solde dû au club — bilanSoldeGym) ; archivage si inscriptions.
src/routes/affiliations.ts                Affiliations fédération par membre/discipline/saison (unicité, montants = fédé, pas revenus club).

src/lib/prisma.ts                         Client Prisma singleton.
src/lib/api-response.ts                   sendSuccess/sendError (format uniforme des réponses).
src/lib/jwt.ts                            Signature/vérification des jetons.
src/lib/audit.ts                          logAudit(req, …) non bloquant (traçabilité).
src/lib/tarifs.ts                         TARIFS, calculerMontantFinal (rabais ADDITIFS), calculerFinContrat, ajouterMoisISO, dateAMidi — PARTAGÉ front/back (conventions §3.1-3.2).
src/lib/paiements.ts                      fraisRetard (compteur 10 $/sem), activerSiPremierPaiement, normalizeMethodePaiement.
src/lib/echeances.ts                      etatPaiement : LA définition du statut de paiement d'un membre côté interface (§3.6).
src/lib/finances.ts                       Taxes (TPS/TVQ incluses), charges, masseSalarialePourMois (source unique), getRevenusperiode (cumul vs période).
src/lib/reminders.ts                      TOUTES les relances automatiques (cadences/refKeys §7.1) + jour civil de Montréal.
src/lib/recus.ts                          Reçu PDF par versement payé (sauf CASH), numérotation, idempotence, chargerLogo.
src/lib/factures.ts                       Factures annuelles par famille (union-find de regroupement, lignes de frais chargés, référence stable).
src/lib/sauvegarde.ts                     Classeur Excel quotidien (une feuille par groupe, formules vivantes §7.3) + résumé courriel + dédup quotidienne.
src/lib/mailer.ts                         Double transport (Resend sinon SMTP), gabarit htmlCourriel (signature officielle), parseDestinataires (« a; b »), sendEmailBackground (échecs → audit).
src/lib/bienvenue.ts                      Contenu du courriel de bienvenue (+ katas si Karaté).
src/lib/katas.ts                          Programme de katas Heian par grade + liens vidéo + estKarate.
src/lib/reglement.ts                      Règlement intérieur versionné (16 articles) — incrémenter REGLEMENT_VERSION à tout changement.
src/lib/saison.ts                         Saison fédération (1er sept. → 31 août) : saisonPourDate/saisonCourante/saisonsChoix — PARTAGÉ front/back.
src/lib/portee.ts                         Portée par discipline du personnel : porteeStaff (ADMIN = tout ; coach/SM = tous les groupes de SON sport) + disciplineDansPortee.
src/lib/format.ts                         Helpers de dates côté client : formatDateLocal, todayLocalISO, joursAvantEcheance (§3.3).
src/lib/api.ts                            apiFetch (Authorization, déballage {success,data}, déconnexion sur 401).
src/lib/seedData.ts                       seedInitialData + bootstrapIfEmpty (amorçage automatique si base vide).

src/contexts/AuthContext.tsx              Session côté client (token localStorage, re-lecture de /auth/me au chargement).
src/hooks/useAuth.ts                      Accès au contexte d'authentification.
src/hooks/useSections.ts                  Catalogue des sections (codes + labels) avec cache.
src/hooks/useDebounce.ts                  Débounce générique (recherche).

src/pages/Login.tsx                       Connexion.
src/pages/Dashboard.tsx                   Tableau de bord (cartes cliquables : retards → Paiements filtrés, renouvellements → Membres filtrés ; prévision de trésorerie).
src/pages/Membres.tsx                     Liste des membres : badges etatPaiement, filtres (?suivi=renouvellement), mode Factures (cases + année + génération).
src/pages/MembreDetail.tsx                Fiche membre : Édition rapide / Profil complet, échéancier (encaisser, frais de retard), grades, présences, famille, suppression protégée.
src/pages/Paiements.tsx                   Vue mensuelle de travail des versements (?statut=EN_RETARD), marquer payé.
src/pages/Pointer.tsx                     Pointage coach : présences + badge de rappel de paiement/renouvellement par athlète.
src/pages/Planning.tsx                    Horaire hebdomadaire des cours.
src/pages/Sections.tsx                    Gestion du catalogue des groupes.
src/pages/Coachs.tsx                      Gestion des comptes staff/admin (bandeau du mot de passe temporaire).
src/pages/Rapports.tsx                    Rapports par période, masse salariale éditable par mois, liste de relance (retards + renouvellements) PDF/CSV.
src/pages/Inscription.tsx                 Fiche d'inscription en ligne PUBLIQUE (consentements, urgence=parent, règlement intégré, provenance).
src/pages/admin/Finances.tsx              Module financier (revenus/charges/marge, cumul vs période, taxes).
src/pages/admin/Prospects.tsx             Leads : ancienneté + badge « X j sans suivi », conversion, invitation.
src/pages/admin/Communications.tsx        Courriels : diagnostic transport, test, envoi groupé, bouton sauvegarde.
src/pages/admin/Import.tsx                Import CSV (zones membres + versements, rapport d'erreurs par ligne).
src/pages/admin/Audit.tsx                 Journal d'audit (y compris les erreurs de courriels).
src/pages/admin/Inventaire.tsx            Inventaire : stock filtrable (coût interne / prix de vente, ± stock, Dupliquer par taille), modal Vendre avec recherche de membre, onglet Ventes (annulation), bouton Catalogue karaté.
src/pages/admin/Evenements.tsx            Événements (détail : participants + badges affiliation/solde/renouvellement, frais remis) et Affiliations (par saison/discipline, ajout par recherche d'athlète).

src/components/layout/AppLayout.tsx       Gabarit connecté (sidebar + contenu + nav mobile).
src/components/layout/Sidebar.tsx         Menu latéral (entrées selon le rôle).
src/components/layout/BottomNav.tsx       Navigation mobile.
src/components/membres/MembreForm.tsx     Assistant membre en 4 étapes (protections §8) — exporte CEINTURES_LIST.
src/components/forms/CoachForm.tsx        Formulaire de compte staff/admin (rôle, sections, mot de passe).
src/components/forms/CourseForm.tsx       Formulaire de cours (section, jours, heures, coach).
src/components/forms/GradeForm.tsx        Formulaire de passage de grade.
src/components/forms/PaiementForm.tsx     Formulaire de paiement (chemins historiques).
src/components/rapports/SectionPieChart.tsx  Camembert de répartition des revenus par groupe.
src/components/ui/                        Primitifs partagés : Button, Input (label+erreur), Card, Badge, Modal, Spinner.
```
