# CSHP — Système de gestion

Application de gestion pour le **Centre Sportif de Haute-Performance** : membres,
paiements/versements, présences, grades de ceinture, planning des cours, coachs,
dépenses et rapports financiers.

## Stack

- **Frontend** : React 19 + Vite + React Router + Tailwind CSS v4
- **Backend** : Express + Prisma (TypeScript), servi par le même processus que Vite
- **Base de données** : PostgreSQL
- **Courriels** : Resend (rappels de paiement)

## Prérequis

- Node.js 18+
- Une base de données PostgreSQL accessible

## Installation

```bash
npm install
cp .env.example .env   # puis remplir les valeurs (voir ci-dessous)
npm run db:setup       # prisma db push + seed (admin + sections + cours de base)
npm run dev            # démarre l'API + le frontend sur http://localhost:3000
```

Compte admin créé par le seed : `ilyes@cshp.ca` / `Admin2026!`
> ⚠️ Changez ce mot de passe après la première connexion. Ne le laissez pas en
> production.

## Variables d'environnement

Voir [`.env.example`](.env.example) :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL |
| `JWT_SECRET` | Secret de signature des jetons (min. 32 caractères) |
| `NODE_ENV` | `development` ou `production` |
| `APP_URL` | URL publique de l'app |
| `RESEND_API_KEY` | Clé API Resend pour les courriels |
| `CRON_SECRET` | Secret Bearer protégeant `/api/cron/reminders` |

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Démarre le serveur (API + Vite) en développement |
| `npm run build` | Build le frontend + bundle le serveur dans `dist/` |
| `npm start` | Lance le serveur de production (`dist/server.cjs`) |
| `npm run lint` | Vérification de types (`tsc --noEmit`) |
| `npm run db:setup` | Pousse le schéma Prisma et exécute le seed |

## Structure

```
server.ts              Point d'entrée Express (monte les routes + sert le frontend)
prisma/schema.prisma   Modèle de données
src/routes/            Routes API (Express)
src/lib/               Logique partagée (prisma, jwt, tarifs, finances, mailer…)
src/middleware/        Authentification (JWT)
src/pages/             Pages React
src/components/        Composants (ui, forms, layout…)
```

## Déploiement

Pensé pour Render (PostgreSQL managé). Au démarrage en production, le serveur
applique automatiquement les migrations Prisma (`prisma migrate deploy`).
