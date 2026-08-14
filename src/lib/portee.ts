import { prisma } from './prisma';

// Portée d'un membre du personnel sur les données du club.
// - ADMIN : tout voir, tout faire (sections = null → aucun filtre).
// - COACH / SECTION_MANAGER : TOUTE leur discipline (tous les groupes du même
//   sport que leur section attitrée), jamais les autres disciplines. Ex. un
//   coach JUDO_GR1 voit JUDO_GR1/GR2/GR3, affiliations/événements/équipements
//   JUDO, mais rien du karaté.
// - Staff sans section reconnue : filtre strict sur sa valeur de section
//   (sécurité par défaut) — assigner une vraie section au compte pour élargir.

export interface PorteeStaff {
  admin: boolean;
  sport: string | null;      // JUDO, KARATE, NINJAS…
  sections: string[] | null; // codes couverts ; null = aucun filtre (admin)
}

export async function porteeStaff(user: { role: string; section?: string | null }): Promise<PorteeStaff> {
  if (user.role === 'ADMIN') return { admin: true, sport: null, sections: null };

  const code = (user.section || '').trim().toUpperCase();
  if (!code) return { admin: false, sport: null, sections: null };

  const toutes = await prisma.section.findMany({ where: { actif: true } });
  const propre = toutes.find((s) => s.code.toUpperCase() === code);
  // La section du compte peut être un code de groupe (JUDO_GR1) ou directement
  // un sport (JUDO) : les deux résolvent vers la discipline complète.
  const sport = propre
    ? propre.sport.toUpperCase()
    : toutes.some((s) => s.sport.toUpperCase() === code)
      ? code
      : null;

  if (!sport) return { admin: false, sport: null, sections: [code] };
  return {
    admin: false,
    sport,
    sections: toutes.filter((s) => s.sport.toUpperCase() === sport).map((s) => s.code),
  };
}

// Un article/événement est visible par le staff si sa discipline est la
// sienne, « TOUS », ou non renseignée (contenu de club).
export function disciplineDansPortee(discipline: string | null | undefined, portee: PorteeStaff): boolean {
  if (portee.admin) return true;
  if (!discipline || discipline === 'TOUS') return true;
  return !!portee.sport && discipline.toUpperCase() === portee.sport;
}
