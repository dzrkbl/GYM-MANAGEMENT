# Surveillance : savoir qu'un truc est cassé avant de perdre de la business

Dernière mise à jour : 21 août 2026. Ce document décrit tout ce qui peut casser
dans la chaîne « site public → API → base → courriels », qui le détecte, et
comment l'alerte arrive. À lire avec `DOCUMENTATION.md` (architecture) et, côté
site, la passation du dépôt du site.

## 1. La chaîne à protéger

```
Visiteur → centresportifhp.com (Hostinger, statique)
         → POST /api/leads (Render, cshp-backend)
         → base Neon (table Lead)
         → page Prospects + relance J+3 (INSCRIPTION_NOTIF_EMAIL, via Resend)
```

Un maillon cassé = des essais gratuits perdus sans bruit. Le but : chaque panne
possible a un détecteur, et chaque détecteur aboutit à un courriel.

## 2. Les quatre étages de détection

| Étage | Outil | Fréquence | Détecte | Alerte |
|---|---|---|---|---|
| 1 | UptimeRobot (existant) | ~5 min | Render couché, API morte | Courriel UptimeRobot |
| 2 | Workflow GitHub `surveillance.yml` (ce dépôt) | 2×/jour + manuel | Site cassé, CORS cassé, santé profonde dégradée | Courriel Resend + onglet Actions |
| 3 | Auto-surveillance de l'app | continu | Migrations échouées, lead non enregistrable, envois en échec | Courriel à `INSCRIPTION_NOTIF_EMAIL` + journal d'audit |
| 4 | Battement de cœur quotidien | 1×/jour | Tournée de rappels morte | ABSENCE du courriel de sauvegarde = alarme |

L'étage 4 est passif mais fiable : le courriel de sauvegarde quotidien
(`BACKUP_EMAIL`) part avec la tournée de rappels. **S'il ne rentre pas un
matin, la tournée n'a pas tourné** (UptimeRobot cassé + cron-job.org cassé en
même temps, ou app en erreur). C'est le seul signal qui ne dépend d'aucun
moniteur externe.

## 3. Ce qui peut casser côté app (GYM-MANAGEMENT)

| Panne | Symptôme | Détecteur | Réflexe |
|---|---|---|---|
| Render couché (plan gratuit) | Premier accès très lent, formulaire du site en repli | UptimeRobot (étage 1) | Vérifier le moniteur UptimeRobot lui-même : c'est lui qui garde l'app éveillée |
| Neon en panne ou saturé | Erreurs 500 partout, leads en échec | `/api/health/complet` (503, `base.ok=false`) via étage 2 | Console Neon : état du projet, quotas du plan gratuit |
| Migrations échouées au déploiement | Pages en erreur aléatoires après un merge | Courriel immédiat « échec des migrations » + `migrations.ok=false` au bilan | Logs Render, corriger la migration, redéployer |
| Lead reçu mais base indisponible | Rien : le filet le rattrape | Courriel « lead reçu mais base indisponible » avec les coordonnées à saisir | Saisir le prospect à la main dans Prospects |
| Resend cassé (clé révoquée, quota) | Aucun rappel, aucun reçu ne part | `courriel.ok=false` au bilan + entrées ERREUR dans le journal d'audit | Tableau de bord Resend : quota, état du domaine |
| `INSCRIPTION_NOTIF_EMAIL` effacée | Tout le canal admin muet | `canalAdmin.ok=false` au bilan | La redéfinir dans Render → Environment |
| Déploiement Render raté (build cassé) | L'ancienne version continue de tourner | Onglet Events de Render (courriels Render si activés) | Render → Manual Deploy après correction |
| Tournée de rappels morte | Parents non relancés, retards qui s'accumulent | Étage 4 : pas de courriel de sauvegarde le matin | Vérifier UptimeRobot et cron-job.org, puis `GET /api/cron/reminders` avec le Bearer |

### Les deux endpoints de santé

- `GET /api/health` : léger, ne touche pas la base. C'est la cible UptimeRobot
  toutes les 5 min (garde Render éveillé, laisse Neon dormir). Ne pas le
  « enrichir » : c'est voulu.
- `GET /api/health/complet` : profond. Vérifie la base (SELECT 1 + latence),
  l'état des migrations du dernier déploiement, le transport courriel et le
  canal admin. Répond `200 {"ok":true,...}` ou `503` avec le détail du maillon
  cassé. Réveille Neon : à appeler quelques fois par jour, pas plus.

## 4. Ce qui peut casser côté site (centresportifhp.com)

Le site est statique : il ne « crash » presque jamais tout seul. Les risques
réels sont autour :

| Panne | Symptôme | Détecteur | Réflexe |
|---|---|---|---|
| Déploiement FTPS raté (secret expiré, FTP cassé) | Le site affiche une vieille version | Run rouge dans le dépôt du site + comparer `/version.txt` avec `git log -1` | Incidents §9 de la passation du site (530 Login, doublon public_html) |
| `.htaccess` cassé ou effacé | 403/500 sur tout le site, redirections mortes | Étage 2 : le check « accueil + CTA » échoue | Redéployer ; au besoin, restaurer depuis le dépôt du site |
| CDN Hostinger qui sert du vieux cache ou des 404 | Ressource absente quelques minutes après déploiement | Généralement transitoire | Attendre ou vider le cache dans le hPanel |
| Domaine ou SSL expiré | Site inaccessible, avertissement navigateur | Étage 2 (curl échoue) + courriels Hostinger | hPanel : renouvellement domaine/SSL |
| CORS cassé côté app | Le formulaire échoue dans le navigateur alors que l'API répond en curl | Étage 2 : check OPTIONS dédié | Vérifier `app.use(cors())` dans server.ts (ne pas restreindre sans mettre les deux domaines) |
| Contrat API modifié sans synchro | Leads sans attribution, ou 400 | Revue des PR touchant `leads.ts` + lead de test après chaque changement | Le zod supprime les champs inconnus en silence : tester de bout en bout |
| Render endormi au moment du POST (UptimeRobot cassé) | ~50 s d'attente, visiteur parti | Étage 1 (UptimeRobot down lui-même = courriel) | Voir aussi les recommandations §6 côté site |
| Pixel Meta en échec | Pas de perte de leads (découplé), pertes de données pub | `LeadFormEchec` visible dans le Gestionnaire d'événements Meta une fois le pixel actif | Non bloquant |

## 5. Configuration à faire UNE FOIS (côté propriétaire)

1. **UptimeRobot** (déjà en place pour `/api/health`) :
   - Vérifier que le contact d'alerte (courriel) est bien configuré et testé.
   - Ajouter un moniteur HTTP `https://centresportifhp.com/` avec mot-clé
     « essai gratuit » (type Keyword), intervalle 5 min.
   - Optionnel : moniteur `https://cshp-backend.onrender.com/api/health/complet`
     avec mot-clé `"ok":true`, intervalle 12 h (PAS 5 min : il réveille Neon).
2. **Secrets GitHub de ce dépôt** (Settings → Secrets → Actions) pour que le
   workflow de surveillance envoie ses alertes par courriel :
   - `RESEND_API_KEY` : la même clé que dans Render.
   - `ALERTE_EMAIL` : l'adresse qui reçoit les alertes (ex. payements@…).
   - Sans ces secrets le workflow fonctionne quand même, mais l'échec n'est
     visible que dans l'onglet Actions et les notifications GitHub.
3. **Notifications GitHub** : profil → Settings → Notifications → Actions :
   cocher les notifications d'échec de workflow (par courriel).
4. **cron-job.org** : vérifier que le job de 8 h sur `/api/cron/reminders`
   est toujours actif et en succès (il sert de ceinture ET de bretelles avec
   le déclencheur intégré).
5. **Render** : Settings du service → Notifications : activer les courriels
   d'échec de déploiement.

## 6. À implémenter côté dépôt du site (recommandations)

Le formulaire est le point de contact avec la business : trois protections
valent la peine, dans l'ordre :

1. **Préchauffage** : au chargement de toute page portant le formulaire,
   `fetch(apiLeads.replace('/api/leads','/api/health'), {method:'GET', keepalive:true})`
   en arrière-plan. Si Render dormait (UptimeRobot cassé), il se réveille
   pendant que le visiteur lit la page, et le POST part sur une app chaude.
2. **Timeout long + un retry** : le POST du formulaire avec un timeout d'au
   moins 60 s et UNE nouvelle tentative après 5 s en cas d'échec réseau,
   avant d'afficher le message de repli téléphone.
3. **Tampon local** : en cas d'échec définitif, garder le payload en
   `localStorage` et retenter silencieusement à la prochaine visite. Coût
   faible, sauve les leads d'une panne passagère.

Le filet côté app est déjà en place : si la base est indisponible mais que
Resend fonctionne, le lead arrive par courriel à l'admin et le visiteur voit
un succès normal.

## 7. Playbook : une alerte arrive, dans quel ordre regarder

1. `https://centresportifhp.com/version.txt` : le site répond-il, et avec la
   bonne version ?
2. `https://cshp-backend.onrender.com/api/health` : Render debout ?
3. `https://cshp-backend.onrender.com/api/health/complet` : quel maillon est
   `ok:false` ? Le JSON désigne le coupable (base, migrations, courriel,
   canal admin).
4. Logs Render (service cshp-backend) : erreurs récentes. Rappel : les 57P01
   Neon sont du bruit normal.
5. Journal d'audit de l'app (page Audit) : les entrées `ERREUR / Courriel`
   listent les envois échoués avec le contexte.
6. Si le problème est côté site : passation du site §9 (incidents connus,
   avec solutions éprouvées).
