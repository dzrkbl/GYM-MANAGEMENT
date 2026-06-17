# Documentation — CSHP Gestion

Application de gestion du **Centre Sportif de Haute-Performance** (école d'arts
martiaux : Karaté, Judo, Ninjas). Gère les membres, les paiements échelonnés, les
présences, les passages de grade, les cours, les finances, l'inscription en ligne
et les relances automatiques.

Ce document décrit l'architecture et la logique pour permettre à un nouveau
développeur (ou une autre IA) de reprendre le projet.

---

## 1. Stack technique

- **Frontend** : React 19 + Vite + React Router + Tailwind CSS v4 (SPA).
- **Backend** : Express + Prisma (TypeScript).
- **Base de données** : PostgreSQL (les modèles utilisent des fonctionnalités
  propres à Postgres : tableaux `String[]`, enums).
- **Courriels** : Resend (`src/lib/mailer.ts`).
- **PDF** : jsPDF (génération des reçus côté serveur).
- **Un seul processus Node** sert à la fois l'API (`/api/*`) et le frontend (la SPA
  buildée en production ; via le middleware Vite en développement).

## 2. Démarrage

| Commande | Rôle |
|---|---|
| `npm run dev` | `tsx server.ts` : API + Vite (middleware) sur le port 3000 |
| `npm run build` | `vite build` (frontend → `dist/`) + `esbuild` (serveur → `dist/server.cjs`) |
| `npm start` | `node dist/server.cjs` (production) |
| `npm run lint` | `tsc --noEmit` (vérification de types) |
| `npm run db:setup` | `prisma db push` + seed (dev) |

Au démarrage (`server.ts`), si `DATABASE_URL` est défini :
1. `prisma migrate deploy` (applique les migrations) ;
2. **amorçage automatique** (`bootstrapIfEmpty`) : si la base n'a **aucun
   utilisateur**, crée l'admin + les sections + les cours + les charges de base.
   Idempotent et sûr (ne touche jamais des données existantes). C'est ce qui permet
   un premier déploiement sans terminal (ex. Render gratuit).

## 3. Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL |
| `JWT_SECRET` | Signature des jetons (≥ 32 caractères) |
| `NODE_ENV` | `development` ou `production` |
| `RESEND_API_KEY` | Envoi des courriels (Resend) |
| `APP_URL` | URL publique (logo dans les courriels, liens) |
| `CRON_SECRET` | Protège `GET /api/cron/reminders` |
| `INSCRIPTION_NOTIF_EMAIL` | Destinataire des avis d'inscription/prospects (optionnel) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte admin créé à l'amorçage (défaut : `ilyes@cshp.ca` / `Admin2026!`) |
| `RECU_NOM` / `RECU_ADRESSE` / `RECU_TPS` / `RECU_TVQ` / `RECU_NEQ` | Coordonnées sur les reçus (numéros de taxes réels en valeurs par défaut) |

## 4. Arborescence

```
server.ts                Point d'entrée Express : monte les routes, sert la SPA,
                         lance migrations + amorçage, route cron des relances.
prisma/
  schema.prisma          Modèle de données
  migrations/            UNE baseline unique alignée sur le schéma (voir §8)
  seed.ts                Appelle seedInitialData()
src/
  routes/                Une route Express par domaine (voir §6)
  lib/                   Logique partagée (voir §7)
  middleware/auth.ts     authenticate + requireRole (JWT)
  pages/                 Pages React (dont admin/)
  components/            ui/, forms/, membres/, layout/, rapports/
  contexts/AuthContext   Auth côté client
  hooks/                 useAuth, useSections, useDebounce
```

## 5. Modèle de données (Prisma)

### Décisions structurantes (IMPORTANT)
- **La (les) section(s) d'un membre = la table `MemberSection`**, et **uniquement
  elle**. Un ancien champ `Member.groupe` a été supprimé (il doublonnait
  `MemberSection` avec une granularité différente et faussait les agrégations). Un
  membre peut appartenir à **plusieurs sections** (`MemberSection` a une contrainte
  unique `(memberId, section)`). La valeur de `section` est un **code** de la table
  `Section` (ex. `KARATE_GR1`).
- **Les paiements = la table `PaymentVersement`**, et **uniquement elle**. Les
  anciennes tables `Payment` et `Subscription` ont été supprimées. Le **statut d'un
  versement est dérivé** : payé si `datePaiement` non nul ; en retard si
  `datePaiement` nul et `datePrevue < aujourd'hui` ; sinon en attente.

### Modèles
- **User** — personnel (staff). `role` ∈ {ADMIN, SECTION_MANAGER, COACH}.
  `section` = sections gérées (séparées par virgule). Relations : `grades`
  (examinateur), `courses`.
- **Member** — athlète. Champs notables : `status` (ACTIF/INACTIF/EN_ATTENTE),
  `plan` (enum Plan), `prixBase`, `montantFinal`, `rabaisFamille`,
  `rabaisCustomPct`, `currentBelt`, contacts parent, **adresse**, **santé**
  (`problemeSante`, `noteSante`), **contact d'urgence** (`urgenceNom/Lien/Tel`),
  **consentement au règlement** (`reglementVersion`, `reglementAccepteAt`,
  `reglementSignataire`). Relations : `sections` (MemberSection[]), `versements`
  (PaymentVersement[]), `attendances`, `grades`.
- **MemberSection** — lien membre↔section (`section` = code, `belt`, `enrollmentDate`).
- **PaymentVersement** — un versement : `numeroVersement`, `montant`, `datePrevue`,
  `datePaiement?`, `methodePaiement?` (enum), `receiptNumber?`, `receiptSentAt?`.
  (`reminderSentAt` existe encore mais n'est plus utilisé — voir ReminderLog.)
- **Course** — cours récurrent : `section`, `jours` (String[], ex. `["MAR","JEU"]`),
  `startTime`, `endTime`, `coachId?`, `actif`.
- **Attendance** — présence : `memberId`, `courseId`, `date`, `status`. Unique
  `(memberId, courseId, date)`.
- **Grade** — passage de grade : `ceinturePrecedente`, `ceintureMontante`, `date`,
  `examinateurId`. Met aussi à jour la ceinture dans `MemberSection`.
- **Lead** — prospect/essai : `sport`, `requestType` (ESSAI/RAPPEL/TARIFS/AUTRE),
  `status` (NEW/CONTACTED/CONVERTED/LOST).
- **Section** — catalogue des sections : `code` (unique, ex. `KARATE_GR1`), `label`,
  `sport`, `ordre`, `actif`.
- **Finances** : **MasseSalariale** (par mois/année), **CoachSalaire**,
  **DepenseConfig** (charge de base avec hausse auto, ex. LOYER), **Depense**
  (charge ponctuelle/mensuelle, `categorie` enum).
- **AuditLog** — traçabilité : `userId`, `userNom`, `action`
  (CREATE/UPDATE/DELETE/PAY), `entity`, `entityId`, `description`, `createdAt`.
- **ReminderLog** — déduplication des relances : unique `(type, refKey)`.

### Enums
- `Plan` : MENSUEL, TRIMESTRIEL, ANNUEL
- `MethodePaiement` : CASH, VIREMENT, CHEQUE, CARTE
- `CategorieDepense` : FIXE, VARIABLE, SALARIALE, AUTRE

## 6. API (montée dans `server.ts`)

Toutes les routes `/api/*`. Réponses standardisées via `lib/api-response.ts`
(`{ success, data }` ou `{ success:false, error }`).

| Préfixe | Fichier | Points notables |
|---|---|---|
| `/api/auth` | auth.ts | `POST /login`, `GET /me` |
| `/api/membres` | members.ts | CRUD membres ; courriel de bienvenue + audit à la création |
| `/api/paiements` | payments.ts | `POST`, `PUT /:id`, `PATCH /:id/payer` (déclenche le reçu) |
| `/api/versements` | versements.ts | `PUT /:id/payer` (déclenche le reçu + audit) |
| `/api/presences` | attendances.ts | `POST /pointer` (createMany), `GET /stats` |
| `/api/cours` | courses.ts | CRUD cours (le frontend utilise ceci, pas `/planning`) |
| `/api/grades` | grades.ts | `POST` (passage + upsert ceinture), `GET` |
| `/api/dashboard` | dashboard.ts | `/resume`, `/revenus`, `/retards`, `/kpis` (MRR, recouvrement, rétention, prévision 3 mois) |
| `/api/rapports` | rapports.ts | `/financier`, `/export-csv` |
| `/api/sections` | sections.ts | catalogue des sections |
| `/api/coachs` | coachs.ts | comptes staff (mots de passe **hachés bcrypt**) |
| `/api/masse-salariale`, `/api/coach-salaire`, `/api/depenses`, `/api/depense-configs` | — | finances (lecture **ADMIN**) |
| `/api/import` | import.ts | import CSV membres + versements |
| `/api/inscription` | inscription.ts | **public** : `GET /sections`, `POST /` (crée un membre EN_ATTENTE + consentement + courriel) |
| `/api/leads` | leads.ts | `POST` **public** (essai), gestion ADMIN, `POST /:id/convert` |
| `/api/communications` | communications.ts | `POST` : courriel groupé par section (ADMIN) |
| `/api/audit` | audit.ts | `GET` journal (ADMIN) |
| `/api/cron/reminders` | server.ts | déclenché par un service externe avec `Authorization: Bearer <CRON_SECRET>` |

## 7. Logique métier (`src/lib/`)

- **tarifs.ts** — `calculerMontantFinal` (prix de base par plan, rabais famille
  −10 %, rabais custom) et `calculerFinContrat`.
- **finances.ts** — charges (loyer avec hausse auto, masse salariale, dépenses) et
  revenus par période. **Taxes** : les prix sont **taxes incluses** (méthode
  québécoise) → base = montant / 1,14975 ; TPS = base × 5 % ; TVQ = base × 9,975 %.
- **paiements.ts** — `normalizeMethodePaiement` : ramène les libellés variés
  (COMPTANT, INTERAC, CHÈQUE…) aux valeurs de l'enum.
- **recus.ts** — génère le **reçu PDF** (avec logo + ventilation de taxes) et
  l'envoie par courriel **quand un versement passe payé, SAUF si la méthode est
  CASH** (reçu papier manuel dans ce cas). Numérotation séquentielle. Idempotent
  (`receiptSentAt`).
- **reminders.ts** — relances déclenchées par le cron : paiement (J-7, jour J,
  retard), renouvellement (J-30 avant `finContrat`), absence (aucune présence depuis
  14 j), prospects (NEW sans suivi depuis 3 j → alerte admin). **Déduplication** via
  `ReminderLog` (unique `type+refKey`).
- **bienvenue.ts** — contenu du courriel de bienvenue (avec section Karaté + vidéos
  de katas).
- **katas.ts** — programme de katas Heian par grade (Karaté) + liens vidéo.
- **reglement.ts** — texte du règlement intérieur **versionné** (`REGLEMENT_VERSION`).
- **seedData.ts** — `seedInitialData` (admin, sections, cours, charges) +
  `bootstrapIfEmpty` (amorçage au démarrage si base vide).
- **audit.ts** — `logAudit(req, …)` (non bloquant).
- **mailer.ts** — `sendEmail` (Resend) + `htmlCourriel` (gabarit commun avec logo).

## 8. Migrations

Le projet historique mélangeait `prisma db push` et migrations, ce qui rendait
l'historique **incomplet** (`migrate deploy` produisait une base cassée). Il a été
remplacé par **une seule baseline** (`prisma/migrations/20240101000000_init/`)
strictement alignée sur `schema.prisma`, + `migration_lock.toml`.

→ Si le schéma change : `prisma migrate dev --name xxx` (génère une nouvelle
migration). Sur une base existante incompatible (dev), faire `prisma migrate reset`.

## 9. Authentification & rôles

- Connexion → JWT (7 j) stocké en `localStorage` (`cshp_token`).
- `src/lib/api.ts` (`apiFetch`) ajoute l'en-tête `Authorization` et émet un
  évènement `cshp-unauthorized` sur 401 (déconnexion auto via `AuthContext`).
- Backend : `authenticate` (vérifie le JWT + charge l'utilisateur) puis
  `requireRole([...])`. Rôles : ADMIN, SECTION_MANAGER, COACH.

## 10. Tâche planifiée (cron)

Configurer un service externe (ex. cron-job.org) pour appeler **une fois par jour** :
`GET <APP_URL>/api/cron/reminders` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
Cela exécute toutes les relances (§7 reminders.ts).

## 11. Dette technique connue / points d'attention

- **Frontend** : usage généralisé de `any` (pas de types partagés), gros composants
  (`Rapports`, `MembreForm`, `MembreDetail`, `Finances`) à découper. Le calcul des
  tarifs est en partie dupliqué côté client.
- **Dates/fuseau** : le pointage des présences normalise à `T12:00:00`, mais
  certaines bornes de mois (dashboard/finances) sont construites en heure locale →
  léger risque de décalage en bordure de mois selon le fuseau du serveur.
- **Cloisonnement par section** : `requireRole` ne filtre PAS par section ; un
  SECTION_MANAGER peut techniquement agir hors de sa section (à durcir si besoin).
- **Neon (gratuit)** : autosuspend → erreurs `57P01` bénignes dans les logs (Prisma
  se reconnecte). Render gratuit : mise en veille après inactivité (1er accès lent).
- **Bundle frontend** ~1,6 Mo (libs PDF) — pourrait être découpé (code-splitting).
- **SMS** : non implémenté (les communications/relances sont par courriel).
- `PaymentVersement.reminderSentAt` est un champ **legacy** non utilisé (les
  relances passent par `ReminderLog`).

## 12. Reprendre le projet en local

```bash
npm install
cp .env.example .env          # remplir DATABASE_URL (Postgres) + JWT_SECRET
npm run db:setup              # pousse le schéma + seed (admin ilyes@cshp.ca / Admin2026!)
npm run dev                   # http://localhost:3000
```

Import des données réelles : se connecter en ADMIN → page **Import** → coller les
CSV (membres + versements) depuis Google Sheets (colonnes documentées sur la page).
