import { prisma } from './prisma';

// Portée d'un membre du personnel sur les données du club.
// - ADMIN : tout voir, tout faire.
// - COACH / SECTION_MANAGER : TOUTES les disciplines de ses sections attitrées
//   (la page Coachs enregistre une liste séparée par des virgules, ex.
//   « JUDO_GR1,JUDO_GR2 ») — chaque code résout vers son sport et couvre TOUS
//   les groupes de ce sport. Un coach JUDO_GR1 voit JUDO_GR1/GR2/GR3, les
//   affiliations/événements/équipements JUDO, mais rien du karaté.
// - Staff SANS section attitrée : portée vide (il ne voit rien — assigner ses
//   groupes dans la page Coachs). Seuls les administrateurs voient tout.
//
// Robustesse : un code est résolu (1) par correspondance avec un code de la
// table Section, (2) par correspondance directe avec un nom de sport, (3) par
// sa racine avant « _ » (JUDO_GR1 → JUDO) si elle correspond à un sport connu.
// Le filtre membres combine les codes couverts ET un préfixe par sport, pour
// couvrir les groupes absents de la table Section (ex. code importé mais
// section jamais créée dans la page Sections).

export interface PorteeStaff {
  admin: boolean;
  sports: string[];   // disciplines couvertes (JUDO, KARATE…)
  sections: string[]; // codes de groupes couverts
}

export async function porteeStaff(user: { role: string; section?: string | null }): Promise<PorteeStaff> {
  if (user.role === 'ADMIN') return { admin: true, sports: [], sections: [] };

  const codes = (user.section || '')
    .split(/[;,]/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) return { admin: false, sports: [], sections: [] };

  const toutes = await prisma.section.findMany();
  const sportsConnus = new Set(toutes.map((s) => (s.sport || '').toUpperCase()).filter(Boolean));

  const sports = new Set<string>();
  const sections = new Set<string>();
  for (const code of codes) {
    sections.add(code);
    const propre = toutes.find((s) => s.code.toUpperCase() === code);
    const racine = code.split(/[_\s-]/)[0];
    const sport = propre
      ? (propre.sport || '').toUpperCase()
      : sportsConnus.has(code)
        ? code
        : sportsConnus.has(racine)
          ? racine
          : null;
    if (sport) sports.add(sport);
  }
  // Tous les groupes des sports couverts (actifs ou non : les fiches membres
  // référencent les codes indépendamment de l'état de la table Section).
  for (const s of toutes) {
    if (sports.has((s.sport || '').toUpperCase())) sections.add(s.code.toUpperCase());
  }

  return { admin: false, sports: [...sports], sections: [...sections] };
}

// Filtre Prisma sur MemberSection.section pour cette portée.
// null = aucun filtre (admin) ; sinon clause à mettre dans sections.some.
export function clauseSectionsPortee(portee: PorteeStaff): any | null {
  if (portee.admin) return null;
  return {
    OR: [
      { section: { in: portee.sections } },
      ...portee.sports.map((sp) => ({ section: { startsWith: sp } })),
    ],
  };
}

// Le membre (via ses groupes) est-il dans la portée ?
export function membreDansPortee(sectionsMembre: { section: string }[], portee: PorteeStaff): boolean {
  if (portee.admin) return true;
  return sectionsMembre.some((s) => {
    const code = s.section.toUpperCase();
    return portee.sections.includes(code) || portee.sports.some((sp) => code.startsWith(sp));
  });
}

// Un article/événement est visible par le staff si sa discipline est couverte,
// « TOUS », ou non renseignée (contenu de club).
export function disciplineDansPortee(discipline: string | null | undefined, portee: PorteeStaff): boolean {
  if (portee.admin) return true;
  if (!discipline || discipline === 'TOUS') return true;
  return portee.sports.includes(discipline.toUpperCase());
}
