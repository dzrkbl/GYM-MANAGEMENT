# DEVLOG — CSHP App

Journal de développement de l'application de gestion du 
Centre Sportif de Haute-Performance (CSHP).

---

## 2026-05-20 au 2026-05-24 — Mise en production + correction bugs

### Contexte
Première mise en production sur Render (PostgreSQL gratuit, 
pas d'accès Shell). Stack : Next.js, Prisma, PostgreSQL, Express.
Toutes les modifications passent par Google AI Studio → GitHub → Render.

### Ce qui a été fait
- Migration du système de courriel : Nodemailer → Resend
- Domaine centresportifhp.com vérifié sur Resend
- DNS ajoutés chez Hostinger (DKIM, SPF, MX)
- Cron job configuré sur cron-job.org (8h00 Montréal)
- Route /api/cron/reminders avec auth Bearer
- Import des données réelles karaté (69 membres)
- Nettoyage base de test via /api/reset-db
- 20 bugs corrigés (voir liste ci-dessous)

### Bugs corrigés
| # | Description | Fichier |
|---|---|---|
| 1 | Date UTC vs locale dans pointage | Pointer.tsx |
| 2 | Filtre membres sur MemberSection au lieu de groupe | members.ts |
| 5 | Section rapport prise dans sections[0] | rapports.ts |
| 6 | Grades bloqués si MemberSection vide | grades.ts |
| 7 | Logs JWT en production | auth.ts |
| 8 | Plan MENSUEL base null → montant 0$ | tarifs.ts |
| 9 | Double comptage retards cumulatif | finances.ts |
| 10 | Enum INACTIVE au lieu de INACTIF | members.ts |
| 11 | Enums incompatibles Payment/PaymentVersement | payments.ts |
| 12 | Stats présences sur memberSection.count | attendances.ts |
| 13 | Filtre section paiements ignorait groupe | payments.ts |
| 15 | Dates présences sans T12:00:00 | attendances.ts |
| 16 | Dashboard retards lisait table Payment vide | dashboard.ts |
| A | getRevenusForMonth ignorait groupe | dashboard.ts |
| C | Synchro groupe→MemberSection incomplète | members.ts |
| D | Section null dans mapping paiements | payments.ts |
| E | Dates /stats non normalisées | attendances.ts |
| F | export-csv timeout si type inconnu | rapports.ts |
| G | deleteMany versements sans protection payés | members.ts |
| - | Sélectionneur vide passage de grade | Frontend |

### Erreurs à éviter
- Ne jamais envoyer plus de 4 corrections à AI Studio en même temps
- Toujours vérifier le SHA du fichier pour confirmer la correction
- Tester les routes protégées via console F12 (fetch avec Bearer token)
- Ne pas filtrer les coachs par section dans un dropdown d'examinateur
- Prisma sur Render gratuit = pas de Shell → routes API temporaires obligatoires
- reminderSentAt = new Date() sur tous les versements à l'import pour bloquer le cron

### Décisions d'architecture
- Un membre = une section active à la fois (groupe = section courante)
- PaymentVersement = seule table de paiement active (Payment = legacy vide)
- MemberSection potentiellement redondant avec groupe (à clarifier)
- Import données réelles : passer par route /api/seed-xxx hardcodée

### À faire (suite)
- Renommer U8 → Ninjas dans le frontend
- Multi-section pour les coachs
- Import données Judo et U8/Ninjas
- Activer les rappels (reset reminderSentAt sur versements futurs)

Push et commit avec le message "docs: ajout DEVLOG.md".

---

## 2026-08-21 au 2026-08-22 — Surveillance, courriels de masse, suivi des prospects

### Contexte
Le site public (centresportifhp.com, dépôt séparé) est en production et envoie
ses leads à l'app. Objectif de la période : détecter les pannes avant de perdre
de la business, débloquer les courriels groupés, et redonner de la visibilité
sur le parcours prospect → fiche d'inscription → membre.

### Ce qui a été fait (PR #6, #8, #9)
- **Fiche d'inscription papier 2025-2026** recto-verso alignée sur le modèle
  Member (docs/formulaires/ : HTML source + PDF + procédure de régénération).
- **Surveillance complète** (runbook : docs/surveillance.md) :
  - `GET /api/health/complet` : bilan profond (base + latence, migrations,
    transport courriel, canal admin) ; 503 si un maillon casse. `/api/health`
    reste léger EXPRÈS (ping UptimeRobot 5 min, Neon doit dormir).
  - Workflow `.github/workflows/surveillance.yml` 2×/jour : accueil du site +
    CTA, version.txt, health léger + complet, préflight CORS de /api/leads ;
    alerte Resend si secrets RESEND_API_KEY + ALERTE_EMAIL configurés.
  - **Filet anti-perte de leads** : base indisponible → le lead part par
    courriel à INSCRIPTION_NOTIF_EMAIL, le site reçoit un succès.
  - **Alerte migrations** : échec de `prisma migrate deploy` au démarrage →
    courriel immédiat (avant : schéma décalé silencieux).
- **Courriels groupés débloqués** : l'envoi parallèle individuel plafonnait à
  ~10 (limite Resend 2 req/s → 429). `sendEmailsEnMasse` : batch Resend
  100/requête + pause 600 ms, repli SMTP séquentiel.
- **Colonne « Dernière présence »** (liste Membres) : dernier pointage PRESENT,
  vert ≤ 7 j / ambre ≤ 21 j / rouge au-delà ; une requête groupée.
- **Diagnostic courriels par membre** (fiche, ADMIN) : destinataire effectif,
  renouvellement du contrat en cours ARME/COUVERT, historique ReminderLog,
  bouton « Réarmer » (efface R30/R7/ECHU du contrat en cours). Répond au cas
  « les renouvellements judo ne partent pas » : le muselage anti-rattrapage
  d'un import neutralise les rappels des contrats à ≤ 30 jours.
- **Filtres Membres portés par l'URL** (`?groupe=`, `?statut=`) + vrai retour
  arrière depuis la fiche : le groupe consulté est restauré.
- **Prospects : badge « Fiche reçue »** : `Lead.ficheRecueAt` + `Lead.membreId`
  (migration), correspondance élargie à la réception de la fiche (courriels
  multiples parent+athlète, téléphones en chiffres, nom de l'athlète), carte
  verte + bouton « Voir la fiche membre ».

### Décisions
- Deux endpoints de santé séparés : le léger ne touche JAMAIS la base (Neon
  doit dormir entre les requêtes réelles), le profond se pinge quelques
  fois/jour maximum.
- Quota Resend du club : 100/jour, 3 000/mois → envois groupés par groupe
  plutôt qu'à tout le club ; le batch remonte les échecs par adresse.
- Réarmement des renouvellements = suppression des traces ReminderLog du
  contrat en cours (indistinguable d'un envoi réel en base : le bouton
  l'explique et l'action est auditée).

### Reste à faire (côté propriétaire)
- Secrets GitHub RESEND_API_KEY + ALERTE_EMAIL (alerte courriel du workflow).
- UptimeRobot : contact d'alerte vérifié + moniteur mot-clé « gratuit » sur
  centresportifhp.com + moniteur health/complet à 12 h (PAS 5 min).
- Premier « Run workflow » manuel de la surveillance (aucune run au 22 août).
