import { PrismaClient } from '@prisma/client';

/**
 * Barème de l'entente de redevabilité (v1.1) — semé une seule fois : si la
 * table contient déjà des lignes, on ne touche à RIEN (les associées ont pu
 * modifier les valeurs, et toute modification est journalisée).
 *
 * `code` = lignes dérivées AUTOMATIQUEMENT des traces de l'app par
 * src/lib/pointsAuto.ts — ne pas renommer ces codes.
 * mode FIXE : points = valeur × quantité (+ supplement × quantité)
 * mode DUREE : points = (valeur × durée + supplement) × quantité
 */
const BAREME: Array<{
  code?: string; famille: string; nom: string; mode: 'FIXE' | 'DUREE';
  valeur: number; supplement?: number; preuve: 'APP' | 'DECL'; note?: string;
}> = [
  // ---------- ENSEIGNEMENT ----------
  { code: 'COURS_DONNE', famille: 'ENSEIGNEMENT', nom: 'Cours régulier donné', mode: 'DUREE', valeur: 1, supplement: 0.25, preuve: 'APP',
    note: "Automatique : séance TENUE (au moins un pointage) d'un cours dont l'associée est le coach assigné — durée réelle de l'horaire + 0,25" },
  { code: 'SECONDAGE', famille: 'ENSEIGNEMENT', nom: "Secondage d'un cours donné par l'autre", mode: 'DUREE', valeur: 1, preuve: 'DECL',
    note: 'À déclarer au plan (une déclaration pour la soirée) — remplace la permanence automatique de cette soirée' },
  { famille: 'ENSEIGNEMENT', nom: 'Remplacement au pied levé (moins de 24 h d’avis)', mode: 'DUREE', valeur: 1.25, preuve: 'DECL', note: 'Durée × 1,25' },
  { famille: 'ENSEIGNEMENT', nom: 'Cours privé ou rattrapage', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { code: 'PERMANENCE', famille: 'ENSEIGNEMENT', nom: "Permanence d'accueil (soirée sans enseigner ni seconder)", mode: 'FIXE', valeur: 0.5, preuve: 'APP',
    note: 'Automatique : a pointé les cours de la soirée sans en être le coach ; annulée si un secondage est déclaré ce jour-là' },
  { famille: 'ENSEIGNEMENT', nom: 'Ouverture ou fermeture du local hors cours', mode: 'FIXE', valeur: 0.25, preuve: 'DECL' },
  // ---------- COMPÉTITION ----------
  { famille: 'COMPETITION', nom: 'Coaching sur place — demi-journée (4 h et moins)', mode: 'FIXE', valeur: 3, preuve: 'DECL',
    note: 'Les 10 $/athlète = défraiement direct au coach présent, hors formule' },
  { famille: 'COMPETITION', nom: 'Coaching sur place — journée complète (plus de 4 h)', mode: 'FIXE', valeur: 5, preuve: 'DECL' },
  { famille: 'COMPETITION', nom: 'Route hors de Montréal', mode: 'DUREE', valeur: 0.5, preuve: 'DECL', note: 'Heures × 0,5' },
  { code: 'COMPETITION_INSCRIPTION', famille: 'COMPETITION', nom: 'Inscription des athlètes à une compétition', mode: 'FIXE', valeur: 0.25, preuve: 'APP',
    note: 'Automatique (module Événements) — maximum 3 par compétition' },
  { famille: 'COMPETITION', nom: 'Logistique de compétition (transport, hébergement, repas)', mode: 'FIXE', valeur: 2, preuve: 'DECL' },
  // ---------- MEMBRES ----------
  { code: 'POINTAGE_SOIR', famille: 'MEMBRES', nom: 'Pointage d’un cours — fait le soir même', mode: 'FIXE', valeur: 0.1, preuve: 'APP', note: 'Automatique' },
  { code: 'POINTAGE_RETRO', famille: 'MEMBRES', nom: 'Pointage rétroactif (saisi un autre jour)', mode: 'FIXE', valeur: 0.05, preuve: 'APP', note: 'Automatique' },
  { code: 'INSCRIPTION', famille: 'MEMBRES', nom: 'Nouvelle inscription — dossier complété par l’associée', mode: 'FIXE', valeur: 0.5, preuve: 'APP', note: 'Automatique (création du dossier)' },
  { famille: 'MEMBRES', nom: 'Nouvelle inscription — fiche en ligne validée et encaissée', mode: 'FIXE', valeur: 0.25, preuve: 'DECL' },
  { famille: 'MEMBRES', nom: 'Relance humaine d’un paiement en retard (appel consigné)', mode: 'FIXE', valeur: 0.25, preuve: 'DECL',
    note: 'Les relances automatiques de l’app ne comptent pas' },
  { code: 'RENOUVELLEMENT', famille: 'MEMBRES', nom: 'Renouvellement traité', mode: 'FIXE', valeur: 0.25, preuve: 'APP', note: 'Automatique' },
  { code: 'FACTURES', famille: 'MEMBRES', nom: 'Lot de factures annuelles', mode: 'FIXE', valeur: 1.5, preuve: 'APP', note: 'Automatique' },
  { code: 'RETENTION_APPEL', famille: 'MEMBRES', nom: 'Appel de rétention', mode: 'FIXE', valeur: 0.25, preuve: 'APP', note: 'Automatique (page Rétention)' },
  // ---------- ARGENT ----------
  { code: 'ENCAISSEMENT_HEBDO', famille: 'ARGENT', nom: 'Encaissement et saisie hebdomadaires', mode: 'FIXE', valeur: 0.75, preuve: 'APP',
    note: 'Automatique : 0,75 par semaine, au prorata réel des encaissements saisis par chacune' },
  { famille: 'ARGENT', nom: 'Dépôt bancaire', mode: 'FIXE', valeur: 0.5, preuve: 'DECL' },
  { famille: 'ARGENT', nom: 'Conciliation mensuelle', mode: 'FIXE', valeur: 2, preuve: 'DECL' },
  { code: 'REMBOURSEMENT', famille: 'ARGENT', nom: 'Remboursement traité (module Remboursements)', mode: 'FIXE', valeur: 0.5, preuve: 'APP', note: 'Automatique' },
  { code: 'DEPENSE_SAISIE', famille: 'ARGENT', nom: 'Saisie d’une dépense avec reçu', mode: 'FIXE', valeur: 0.1, preuve: 'APP', note: 'Automatique (module Remboursements)' },
  { famille: 'ARGENT', nom: 'Paie des coachs salariés + remises DAS du mois', mode: 'FIXE', valeur: 1, preuve: 'DECL' },
  { famille: 'ARGENT', nom: 'Remise TPS / TVQ trimestrielle', mode: 'FIXE', valeur: 3, preuve: 'DECL' },
  { famille: 'ARGENT', nom: 'Fin d’année comptable', mode: 'FIXE', valeur: 8, preuve: 'DECL' },
  // ---------- DÉVELOPPEMENT ----------
  { code: 'PROSPECT_24H', famille: 'DEVELOPPEMENT', nom: 'Premier contact d’un prospect en moins de 24 h', mode: 'FIXE', valeur: 0.25, preuve: 'APP',
    note: 'Automatique (fil de suivi signé du module Prospects)' },
  { code: 'PROSPECT_RELANCE', famille: 'DEVELOPPEMENT', nom: 'Relance suivante d’un prospect (consignée au fil)', mode: 'FIXE', valeur: 0.1, preuve: 'APP',
    note: 'Automatique — max 0,5 par prospect par mois' },
  { famille: 'DEVELOPPEMENT', nom: 'Portes ouvertes ou cours d’essai animé', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Publication sur les réseaux sociaux', mode: 'FIXE', valeur: 0.25, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Tournage ou montage vidéo', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Création d’une campagne publicitaire', mode: 'FIXE', valeur: 3, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Suivi hebdomadaire des campagnes', mode: 'FIXE', valeur: 0.5, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Mise à jour du site web', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { famille: 'DEVELOPPEMENT', nom: 'Développement / maintenance de l’application', mode: 'DUREE', valeur: 1, preuve: 'DECL',
    note: 'Journal des mises à jour à l’appui ; plafond 15 h/mois (au-delà : accord préalable de l’autre)' },
  { code: 'COMMUNICATION', famille: 'DEVELOPPEMENT', nom: 'Communication groupée aux parents (infolettre, avis)', mode: 'FIXE', valeur: 0.25, preuve: 'APP', note: 'Automatique' },
  { famille: 'DEVELOPPEMENT', nom: 'Tenue de la boîte courriel du club (par jour traité)', mode: 'FIXE', valeur: 0.25, preuve: 'DECL', note: 'Max 1,5 par semaine' },
  // ---------- LOCAL ----------
  { famille: 'LOCAL', nom: 'Nettoyage hebdomadaire complet', mode: 'FIXE', valeur: 1.5, preuve: 'DECL',
    note: 'En alternance (Lyna commence) — la liste affichée au local définit « fait »' },
  { famille: 'LOCAL', nom: 'Nettoyage rapide après cours', mode: 'FIXE', valeur: 0.25, preuve: 'DECL' },
  { famille: 'LOCAL', nom: 'Achat de matériel en magasin (déplacement inclus)', mode: 'DUREE', valeur: 1, preuve: 'DECL', note: 'Facture datée à l’appui' },
  { famille: 'LOCAL', nom: 'Réception et rangement d’une commande', mode: 'FIXE', valeur: 0.5, preuve: 'DECL' },
  { famille: 'LOCAL', nom: 'Réparation ou entretien', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { code: 'VENTE', famille: 'LOCAL', nom: 'Vente d’équipement au comptoir', mode: 'FIXE', valeur: 0.1, preuve: 'APP', note: 'Automatique (module Inventaire)' },
  { famille: 'LOCAL', nom: 'Inventaire trimestriel', mode: 'FIXE', valeur: 2, preuve: 'DECL' },
  // ---------- RELATIONS EXTERNES ----------
  { famille: 'RELATIONS_EXT', nom: 'Affiliation du club à une fédération (par saison)', mode: 'FIXE', valeur: 2, preuve: 'DECL' },
  { code: 'AFFILIATION_ATHLETE', famille: 'RELATIONS_EXT', nom: 'Affiliation d’un athlète à la fédération', mode: 'FIXE', valeur: 0.1, preuve: 'APP', note: 'Automatique' },
  { famille: 'RELATIONS_EXT', nom: 'Inscription du club à un événement fédéral', mode: 'FIXE', valeur: 0.5, preuve: 'DECL' },
  { famille: 'RELATIONS_EXT', nom: 'Organisation d’un passage de grade', mode: 'FIXE', valeur: 3, preuve: 'DECL' },
  { famille: 'RELATIONS_EXT', nom: 'Renouvellement d’assurance', mode: 'FIXE', valeur: 1.5, preuve: 'DECL' },
  { famille: 'RELATIONS_EXT', nom: 'Dossier bail ou propriétaire', mode: 'DUREE', valeur: 1, preuve: 'DECL' },
  { famille: 'RELATIONS_EXT', nom: 'Gestion d’un conflit avec un parent (forfait fixe)', mode: 'FIXE', valeur: 1, preuve: 'DECL',
    note: 'Forfait délibéré : aux heures réelles, on serait payé pour laisser pourrir' },
  { famille: 'RELATIONS_EXT', nom: 'Trouver un remplaçant quand un coach salarié se désiste', mode: 'FIXE', valeur: 0.5, preuve: 'DECL' },
  // ---------- GOUVERNANCE ----------
  { famille: 'GOUVERNANCE', nom: 'Planification de la saison (1× par an)', mode: 'FIXE', valeur: 6, preuve: 'DECL' },
  { famille: 'GOUVERNANCE', nom: 'Construction de l’horaire', mode: 'FIXE', valeur: 3, preuve: 'DECL' },
  { famille: 'GOUVERNANCE', nom: 'Recrutement et entrevue d’un coach (par candidat)', mode: 'FIXE', valeur: 2, preuve: 'DECL' },
  { famille: 'GOUVERNANCE', nom: 'Réunion entre les deux associées', mode: 'FIXE', valeur: 0, preuve: 'DECL',
    note: 'Zéro volontaire : les deux y sont, ça ne mesure rien' },
  // ---------- HORS-LISTE ----------
  { famille: 'HORS_LISTE', nom: 'Hors-liste (travail imprévu, validé par l’autre)', mode: 'DUREE', valeur: 1, preuve: 'DECL',
    note: 'Plafond : 10 % du total personnel du trimestre — drapeau au tableau Trimestre' },
];

export async function seedBaremeSiVide(prisma: PrismaClient): Promise<boolean> {
  const existant = await prisma.tachePoints.count();
  if (existant > 0) return false;
  for (const l of BAREME) {
    await prisma.tachePoints.create({
      data: {
        code: l.code || null, famille: l.famille, nom: l.nom, mode: l.mode,
        valeur: l.valeur, supplement: l.supplement || 0, preuve: l.preuve, note: l.note || null,
      },
    });
  }
  return true;
}
