# Meta Ads — infrastructure et configuration exacte

Principe directeur à 10 $/jour : **tout consolider**. Une seule campagne, un seul ensemble de publicités, audience large, formulaires natifs Meta (pas de landing page externe — le CPL y est plus bas et il n'y a rien à héberger). La pile technologique coûte 0 $/mois.

---

## 1. Infrastructure — checklist d'installation dans l'ordre

### A. Meta Business Suite (jour 1)

- [ ] Créer le portefeuille d'entreprise sur [business.facebook.com](https://business.facebook.com)
- [ ] Y associer la page Facebook du CSHP (la créer si besoin, avec adresse, heures, photos récentes)
- [ ] Associer le compte Instagram professionnel
- [ ] Créer le compte publicitaire : devise CAD, fuseau America/Toronto
- [ ] Ajouter le moyen de paiement + définir une **limite de dépense du compte à 350 $/mois** (sécurité anti-dérapage)
- [ ] Activer l'authentification à deux facteurs (les comptes pub piratés sont une plaie réelle)

### B. Politique de confidentialité (jour 1 — bloquant)

Les formulaires instantanés Meta **exigent une URL de politique de confidentialité**. C'est aussi une obligation de la Loi 25 au Québec dès que vous collectez des renseignements personnels.

- [ ] Générer une politique simple (générateur gratuit type CookieYes/Termly, adapté avec vos coordonnées) couvrant : quelles données (nom, courriel, téléphone, âge de l'enfant), pourquoi (vous recontacter pour l'essai), qui y accède (vous seul), durée de conservation, droit de retrait
- [ ] L'héberger gratuitement : page « Politique de confidentialité » sur votre site si vous en avez un, sinon une page gratuite Systeme.io fait l'affaire
- [ ] Désigner un responsable de la protection des renseignements personnels (vous, par défaut — exigence Loi 25) et l'indiquer dans la politique

### C. Formulaire instantané (jour 2)

Créer dans Meta Business Suite → Instruments de publication → Formulaires, ou directement à la création de la pub :

- **Type : « Intention plus forte »** (ajoute un écran de confirmation — légère friction voulue)
- **Intro :** « Pass Découverte CSHP — 2 cours + t-shirt pour 19 $. Répondez à 3 questions, on vous rappelle en 5 minutes pour réserver la place de votre enfant. »
- **Champs préremplis :** nom complet, courriel, téléphone
- **Questions personnalisées :**
  1. « Quel âge a votre enfant ? » — choix multiples : `4-5 ans` / `6-8 ans` / `9-13 ans` / `14 ans et +`
  2. « Qu'est-ce qui vous intéresse le plus ? » — choix : `Dépenser son énergie / bouger` / `Confiance et discipline` / `Vrai sport de compétition` / `Les deux arts (karaté + judo)`
- **Écran de remerciement :** « Merci ! [Prénom du coach] vous appelle d'ici quelques minutes pour réserver le premier cours. Gardez votre téléphone proche 📞 » + bouton « Voir la page du club »
- [ ] Lier l'URL de politique de confidentialité (étape B)

> Plan B intégré : si plus tard les leads ne répondent pas au téléphone, ajouter une 3e question « Êtes-vous prêt à vous déplacer au 6498 Beaubien Est pour les cours ? Oui/Non » — ça filtre les clics distraits.

### D. Acheminement des leads (jour 2)

- [ ] **Meta → Google Sheets** : dans le gestionnaire de publicités, section « Intégration CRM » du formulaire → connecter le compte Google → chaque lead tombe en temps réel dans une feuille. Importer d'abord [templates/leads-tracker.csv](templates/leads-tracker.csv) comme structure de référence (le flux Meta alimente les premières colonnes, vous remplissez le suivi à la main).
- [ ] **Meta → Brevo** (plan gratuit, 300 courriels/jour) : connecter l'intégration « Facebook Lead Ads » dans Brevo → liste « Leads CSHP » → déclencher automatiquement le courriel n°1 de la séquence ([06-funnel-et-suivi.md](06-funnel-et-suivi.md))
- [ ] **Notification instantanée pour VOUS** : activer les notifications de leads dans l'app Meta Business Suite sur votre téléphone (Paramètres → Notifications → Prospects). C'est ce qui rend la règle des 5 minutes possible.

### E. Test de bout en bout (avant tout lancement — non négociable)

- [ ] Utiliser l'outil de test de formulaires Meta (Testing Tool des formulaires de prospects) ou soumettre un vrai lead avec votre propre numéro
- [ ] Vérifier : ligne créée dans Google Sheets ✚ contact créé dans Brevo ✚ courriel n°1 reçu ✚ notification push reçue sur votre téléphone
- [ ] Chronométrer : si la notification met plus de 2 minutes, régler avant de lancer

---

## 2. Configuration de la campagne (semaine 3)

Dans le Gestionnaire de publicités (**jamais le bouton « Booster »** — il choisit les mauvais objectifs) :

### Campagne
| Paramètre | Valeur |
|---|---|
| Objectif | **Prospects** (Leads) |
| Budget | **CBO, 10 $/jour** |
| Nom | `CSHP-Leads-Enfants-2026` |

### Ensemble de publicités (UN SEUL)
| Paramètre | Valeur |
|---|---|
| Conversion | Formulaires instantanés |
| Zone | Épingle sur **6498 Beaubien Est** + rayon **4 km** |
| Âge | **25-50 ans** (les parents; l'enfant n'a pas de compte FB) |
| Genre | Tous |
| Ciblage détaillé | **AUCUN centre d'intérêt.** Audience Advantage+ / large. Le créatif fait le ciblage. |
| Placements | Advantage+ (automatiques) |

### Publicités (2 au lancement, dans le même ensemble)
- Pub 1 : vidéo U8 (5-8 ans) + texte principal correspondant ([05-creatifs-et-annonces.md](05-creatifs-et-annonces.md))
- Pub 2 : vidéo coach 9-13 ans + texte correspondant
- Titre : « Pass Découverte : 2 cours + t-shirt pour 19 $ »
- Bouton : « S'inscrire » ou « En savoir plus »
- Les deux pubs pointent vers le **même formulaire**

### Les règles de discipline (là où 90 % des gens échouent)

1. **Ne rien modifier pendant 14 jours.** Chaque modification (budget, audience, créatif) remet la phase d'apprentissage à zéro. À 10 $/jour, l'algorithme apprend déjà lentement — le toucher chaque jour le rend aveugle.
2. **Un seul changement à la fois** ensuite, tous les 7-14 jours minimum.
3. **Juger sur 7 jours glissants**, jamais sur une journée (le volume quotidien est trop petit pour être significatif).
4. À 10 $/jour, vous n'aurez jamais les ~50 conversions/semaine qui font sortir officiellement de la phase d'apprentissage. **C'est accepté et prévu** — la consolidation (1 campagne, 1 ensemble, audience large) en compense l'essentiel. Ignorez l'étiquette « Apprentissage limité », regardez le CPL.

---

## 3. Évolutions prévues (ne pas faire avant l'heure)

| Quand | Quoi |
|---|---|
| Semaine 6 (~17 août) | Couper la pub au CPL le plus élevé, ajouter la vidéo témoignage |
| Semaine 7 (rentrée) | Passer les textes à l'angle rentrée; option budget 15-20 $/jour si CAC < 100 $ |
| Semaines 8-9 | Si 1 000+ vues vidéo cumulées : retargeting 2 $/jour (audience personnalisée = vues 50 % de vidéo sur 30 jours + ouvertures de formulaire non soumises) avec image statique « Dernières places U8 » |
| Toutes les 3-4 semaines | Une nouvelle vidéo en rotation pour contrer la fatigue créative |
| Janvier 2027 | Deuxième pic annuel (résolutions) — même machine, angle « nouvelle année » |

---

## 4. Erreurs qui brûlent un petit budget (vues cent fois)

- Booster des publications depuis la page → mauvais objectif, aucun contrôle. Toujours le Gestionnaire de publicités.
- Diviser 10 $ entre 3 campagnes ou 3 audiences → aucune n'apprend. Une seule campagne.
- Cibler « parents » + « karaté » + « arts martiaux » en centres d'intérêt → audience minuscule, CPM qui explose. Large + rayon géo, point.
- Laisser tourner sans répondre aux leads → un lead rappelé après 24 h est mort (21× moins de chances de conversion qu'à 5 minutes).
- Paniquer au jour 3 et tout changer → voir règles de discipline.
- Oublier la limite de dépense du compte → un bug de config peut vider une carte. La limite à 350 $/mois est votre filet.
