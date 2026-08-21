# Contrat d'intégration : landing pages du site → app de gestion CSHP

Document à transmettre à l'IA qui développe le site. Les faits ci-dessous sont vérifiés
dans le code réel de l'app de gestion (`src/routes/leads.ts`, `prisma/schema.prisma`,
`server.ts`) — ils priment sur toute documentation.

## 1. Le contrat API RÉEL de `POST /api/leads` (aujourd'hui)

L'endpoint public accepte UNIQUEMENT ces champs (validation zod ; **tout champ inconnu est
silencieusement supprimé**, pas rejeté) :

```json
{
  "firstName": "string (requis)",
  "lastName":  "string (requis)",
  "gender":    "string (optionnel)",
  "phone":     "string (optionnel)",
  "email":     "string (optionnel)",
  "sport":     "string (optionnel) — ex. KARATE, JUDO, NINJAS, KICKBOXING",
  "requestType": "ESSAI | RAPPEL | TARIFS | AUTRE (défaut ESSAI)",
  "website":   "honeypot anti-spam — DOIT être présent et vide"
}
```

**⚠️ Il n'existe AUCUN champ `provenance`, `note` ou `message` sur le modèle Lead.**
L'affirmation « l'app valide provenance contre un enum fermé (BOUCHE_A_OREILLE,
RESEAUX_SOCIAUX…) » ne correspond pas au code actuel. Conséquence : si les landings
envoient `provenance: "RESEAUX_SOCIAUX"`, l'angle `[karate-enfant]` dans un message, et
les UTM — **tout cela est jeté à la poubelle par zod**. Les leads arriveront, mais SANS
attribution : on ne saura jamais quelle page ni quelle pub les a produits.

## 2. Le contrat CIBLE (à implémenter côté app de gestion — Claude gym-management s'en charge)

Champs à AJOUTER au modèle Lead et au endpoint, que le site pourra alors envoyer :

```json
{
  "source":      "string — ex. 'landing-karate-enfant', 'landing-ninjas', 'meta-instant-form'",
  "utmSource":   "string — utm_source",
  "utmCampaign": "string — utm_campaign",
  "utmContent":  "string — utm_content (le nom de la pub/créatif)",
  "note":        "string — texte libre (âge de l'enfant, question posée…)"
}
```

Tant que ce chantier n'est pas déployé : le site peut concaténer l'angle et les UTM dans
un champ existant qui SURVIT à la validation — le seul candidat est `gender` (mauvaise
idée) ou attendre le déploiement (recommandé : le chantier prend une heure).

## 3. Questions précises à poser à l'IA du site

1. **URL et corps exacts** : vers quelle URL exacte le formulaire POST-il, et avec quel
   JSON exact (montre un exemple de payload réel) ? Confirme qu'il inclut le honeypot
   `website: ""`.
2. **Valeurs de `sport`** : quelle valeur envoie chaque landing ? Attendu :
   `KARATE` (karaté enfant), `NINJAS` (4-8 ans), `KICKBOXING` (femmes). Toute autre
   graphie s'affichera brute dans la page Prospects.
3. **Où vont les UTM aujourd'hui ?** Vu le §1, confirme qu'ils ne sont PAS envoyés dans
   des champs inexistants — et adapte-toi au contrat du §2 dès qu'il est déployé.
4. **Événement `Lead` du pixel** : est-il déclenché uniquement APRÈS une réponse 200 de
   l'API (pas au clic) ? Avec un `eventID` unique pour la déduplication future (CAPI) ?
5. **Repli en cas d'échec API** : quel comportement exact (lien tel: affiché ? message ?)
   et l'échec est-il journalisé quelque part ?
6. **Politique de confidentialité** : existe-t-elle en page publique avec URL stable ?
   (Obligatoire pour les formulaires instantanés Meta ET cohérente avec le bandeau
   Loi 25.) Donne l'URL exacte.
7. **Page /essai-gratuit-kickboxing-femmes/** : le programme kickboxing femmes n'existe
   pas dans l'horaire actuel du gym (cours réels : karaté, judo, ninjas). Quel horaire et
   quels tarifs cette page affiche-t-elle ? La mettre hors ligne tant que le programme
   n'est pas décidé — ne jamais envoyer de pub vers un cours qui n'existe pas.
8. **Vitesse mobile** : poids total de chaque landing et temps de chargement en 4G
   (cible < 3 s) — c'est le premier facteur de coût par lead sur du trafic payant.
9. **CORS — information, pas une demande** : `server.ts` fait `app.use(cors())` sans
   restriction, donc les POST cross-origin passent DÉJÀ. Ne pas « ajouter une ligne » ;
   le vrai chantier (optionnel, sécurité) serait au contraire de RESTREINDRE cors aux
   deux domaines connus.
10. **Test de bout en bout** : soumettre un lead de test depuis chaque landing et
    confirmer qu'il apparaît dans la page Prospects de l'app avec le bon sport.

## 4. Décision stratégique : Instant Forms d'abord, landings en second

La campagne C1 du 15 août reste sur les **formulaires instantanés Meta**
(voir CAMPAGNE-META-CHECKLIST.md) : moins de friction, CPL plus bas, et le pixel du site
est trop jeune pour optimiser des conversions web avec 11 $/jour. Les landings servent
dès maintenant à tout le reste : lien de la fiche Google, campagne de réactivation des
anciens membres, QR codes au dojo, référencements — et elles nourrissent le pixel pour
le retargeting de la vague de janvier, où on testera landing vs instant form avec de
vraies données. Une seule exception : la campagne C2 (réactivation) peut pointer vers
les landings dès septembre, l'audience étant déjà chaude.

## 5. Création du pixel Meta (pour donner l'ID au site)

Gestionnaire d'événements Meta (business.facebook.com/events_manager) → « Connecter des
données » → « Web » → nommer « Pixel CSHP » → copier l'ID (15-16 chiffres) → le donner à
l'IA du site pour `metaPixelId` dans `src/data/marketing.json`.
