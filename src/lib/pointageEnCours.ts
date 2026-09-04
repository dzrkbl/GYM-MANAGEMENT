/**
 * BROUILLON DU POINTAGE EN COURS — sessionStorage.
 *
 * Le pointage coche des cases en mémoire jusqu'au bouton « Pointer » : toute
 * navigation (ouvrir la fiche d'un enfant pour corriger son groupe, surtout
 * au téléphone) démontait l'écran et perdait les coches. Le brouillon est
 * donc écrit ici à chaque geste : jour, groupe, cours, cases cochées. La page
 * Pointage se ré-hydrate au retour, et la fiche membre affiche « Revenir au
 * pointage » tant qu'un brouillon est frais. Purgé à la soumission.
 *
 * sessionStorage : propre à l'onglet, survit aux allers-retours et au
 * rechargement, meurt avec l'onglet. Toujours sous try/catch (navigation
 * privée, iOS…) — sans storage, tout marche comme avant, sans mémoire.
 */

const CLE = 'cshp-pointage-en-cours';
// Au-delà, le brouillon est considéré abandonné (on ne ressuscite pas les
// coches d'avant-hier par surprise).
const FRAICHEUR_MS = 6 * 60 * 60 * 1000;

export interface PointageEnCours {
  dateCours: string; // AAAA-MM-JJ
  section: string;
  courseId: string;
  coches: string[]; // memberIds cochés non soumis
  t: number; // horodatage d'écriture
}

export function lirePointageEnCours(): PointageEnCours | null {
  try {
    const brut = sessionStorage.getItem(CLE);
    if (!brut) return null;
    const p = JSON.parse(brut) as PointageEnCours;
    if (!p || typeof p.t !== 'number' || Date.now() - p.t > FRAICHEUR_MS) return null;
    if (!Array.isArray(p.coches)) return null;
    return p;
  } catch {
    return null;
  }
}

export function ecrirePointageEnCours(p: Omit<PointageEnCours, 't'>): void {
  try {
    sessionStorage.setItem(CLE, JSON.stringify({ ...p, t: Date.now() }));
  } catch {
    // Pas de storage : pas de brouillon, rien ne casse.
  }
}

export function purgerPointageEnCours(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    // rien
  }
}
