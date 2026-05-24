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
