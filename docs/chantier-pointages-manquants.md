# Chantier reporté : détection des cours non pointés

Conception arrêtée le 24 août 2026, **mise en œuvre reportée** à la demande du
propriétaire. Ce document existe pour reprendre le sujet sans refaire l'analyse.
Il contient la conception validée, quatre corrections à appliquer avant de
coder, et les prérequis.

---

## 1. Le besoin

Un coach oublie de pointer son cours. Personne ne s'en aperçoit, et l'absence
de données casse en silence deux choses qui en dépendent : la page **Rétention**
(qui ne voit un décrochage que si les présences sont saisies) et les
statistiques de fréquentation.

L'objectif est de le détecter dans les minutes qui suivent la fin du cours,
d'alerter le coach, et de permettre à l'administration d'annuler explicitement
une séance qui n'a pas eu lieu.

## 2. Conception validée

- **Nouveau modèle `SeanceAnnulee`** : le modèle `Course` est récurrent et ne
  connaît aucune date. Il manque une entité « séance » (cours + date) pour
  distinguer « pas encore pointé » de « n'a pas eu lieu ». C'est la bonne
  décision, à conserver.
- **Détection** : une séance est considérée non pointée si aucune ligne
  `Attendance` n'existe pour ce `courseId` à cette date. C'est la même
  inférence que celle utilisée par la page Rétention (`src/routes/retention.ts`),
  qui la documente en détail. Rester cohérent avec elle.
- **Annulation réservée à l'ADMIN**, avec **motif obligatoire**, tracée dans le
  journal d'audit. Un coach peut pointer en retard, jamais annuler.
- **Destinataire de l'alerte** : le coach du cours (`Course.coachId`), à défaut
  le canal admin (`INSCRIPTION_NOTIF_EMAIL`).
- **Widgets** : sur la page Pointage pour le coach (ses cours), sur le tableau
  de bord pour l'admin (tous les cours, avec le bouton d'annulation).
- **Anti-doublon** : réutiliser `ReminderLog` comme les autres rappels, avec
  une `refKey` de la forme `courseId:AAAA-MM-JJ`.

### Déclenchement : option A seulement

Render (offre gratuite) n'a pas de planificateur interne. Deux mécanismes
existent : UptimeRobot qui ping `/api/health` toutes les ~5 min, et
cron-job.org qui appelle `/api/cron/reminders` à 8 h.

**Retenir l'option A** : un intergiciel qui se greffe sur le trafic entrant
existant, ce qui donne une latence de 2 à 7 minutes après la fin du cours.
Le propriétaire a confirmé que « 2 ou 5 minutes, ce n'est pas grave ».

**Écarter l'option B** (cron dédié toutes les minutes) : elle gagne trois
minutes sur une notification dont le délai n'a pas d'importance, au prix d'une
dépendance externe supplémentaire pouvant tomber en silence, et de 300 réveils
de base par jour (voir la correction n° 3).

---

## 3. Les quatre corrections à appliquer AVANT de coder

### 3.1 La fenêtre horaire doit couvrir le samedi et 20 h

Une fenêtre « 16 h à 21 h en semaine » rate **les trois cours Ninjas du samedi
de 9 h à 12 h**. Et le dernier cours de la semaine finit à **20 h 00** : réutiliser
la garde du déclencheur de rappels existant (`h >= 8 && h < 20`) ferait que la
vérification de 20 h 02 ne se produirait jamais.

Fenêtre correcte : **lundi au vendredi de 17 h à 21 h, ET samedi de 9 h à 13 h.**

Horaires réels (`src/lib/seedData.ts`) : Karaté mardi et jeudi 17 h-20 h ;
Judo lundi et vendredi 17 h-19 h 30 ; Ninjas mercredi 17 h-20 h et samedi 9 h-12 h.

### 3.2 Les fermetures doivent neutraliser l'alerte

Le type d'événement **`FERMETURE`** existe depuis le calendrier de saison
(PR #13). Sans le prendre en compte, les deux semaines de fermeture des Fêtes
produiraient une alerte par créneau, deux fois par jour, pendant quatorze jours.
Un coach noyé sous ces courriels désactive la notification et la fonction meurt.

La détection doit donc vérifier qu'aucun `Evenement` de type `FERMETURE` ne
couvre la date (attention : `date` à `dateFin` inclus) avant d'alerter.

### 3.3 Ne pas réveiller Neon à chaque ping

`/api/health` ne touche **pas** la base, volontairement : c'est ce qui permet à
Neon de s'endormir et de rester dans le quota d'heures de calcul de l'offre
gratuite. Un contrôle qui interrogerait la base à chaque ping réveillerait Neon
**toutes les 5 minutes, 24 h sur 24**, y compris la nuit.

Conception correcte : garder l'horaire des cours **en mémoire** (rafraîchi une
fois par heure) et **ne toucher à la base que si un cours vient réellement de
finir**. Cela ramène les réveils de 288 par jour à une dizaine, sans perdre en
précision.

### 3.4 Assigner les coachs aux cours d'abord

Les cours créés par l'amorçage ont tous `coachId` à **null** (vérifié dans
`src/lib/seedData.ts`). Avec la règle « au coach, à défaut à l'admin », **toutes
les alertes des dix-huit créneaux hebdomadaires arriveraient chez le
propriétaire**.

Prérequis d'exploitation, pas de code : assigner les coachs aux cours dans le
Planning avant d'activer la fonction.

---

## 4. Ordre de priorité

Le **widget vaut plus que le courriel**. Un coach à 20 h 02 range le tatami et
parle aux parents, il ne lit pas ses courriels ; mais il a son téléphone, et le
Pointage est dans la barre de navigation mobile. Construire le widget d'abord,
le courriel ensuite comme filet.

## 5. Ce qui a été livré séparément

La traçabilité du pointage (qui a pointé, quand) et la liste des présences dans
le calendrier ont été livrées indépendamment de ce chantier, car elles ne
dépendent d'aucun mécanisme de déclenchement. Elles fournissent d'ailleurs la
donnée dont ce chantier aura besoin pour distinguer « pointé en retard » de
« pointé à l'heure ».
