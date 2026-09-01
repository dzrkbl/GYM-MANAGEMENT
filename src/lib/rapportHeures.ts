import { prisma } from './prisma';
import { dureeCours, heuresHebdo } from './horaire';
import { cleSemaineIso } from './periodes';
import {
  DIVISEUR_TAXES, getLoyerPourAnnee, masseSalarialePourMois, type BaseFinanciere,
} from './finances';

/**
 * RAPPORT « HEURES & COURS » — le modèle de coût (L1) et la table de décision
 * (L2) branchés sur les données réelles. Rien ne se ressaisit :
 *  - inscrits            = MemberSection des membres ACTIFS, par section ;
 *  - présents            = Attendance (moyenne des 4 dernières semaines TENUES,
 *                          une séance tenue = une date où quelqu'un a été
 *                          pointé — la méthode du module Rétention) ;
 *  - valeur d'une séance = les montantFinal RÉELS des inscrits (annualisés),
 *                          répartis au prorata multi-sections, divisés par les
 *                          séances de la saison — plus de tarif théorique ;
 *  - coût du local       = le loyer du Module financier (net de CTI/RTI en
 *                          base « net ») ÷ les heures ouvertes par semaine ;
 *  - coût du coach       = User.tauxHoraire × durée (ou forfait réparti).
 *
 * TROIS COÛTS JAMAIS CONFONDUS : marginal (garder ouvert une heure de plus),
 * opportunité (plancher d'un prix de location), complet (santé d'un cours).
 * L'API n'envoie jamais un « coût » sans étiquette.
 */

const arr2 = (n: number) => Math.round(n * 100) / 100;
const arr1 = (n: number) => Math.round(n * 10) / 10;

export type VerdictCours =
  | 'HORAIRE_INVALIDE'   // durée illisible : corriger le cours d'abord
  | 'AUCUN_INSCRIT'
  | 'SANS_REVENU'        // des inscrits, mais aucun contrat chiffré
  | 'DEUXIEME_ENTRAINEUR'// U8 plein à 1 entraîneur : passer à 2 (15 → 25) avant de dédoubler
  | 'A_DEDOUBLER'        // plein N semaines consécutives ET moitiés viables
  | 'CAPACITE_ATTEINTE'  // plein, mais pas encore N semaines consécutives
  | 'STRATEGIQUE'        // maintenu à perte en connaissance de cause
  | 'A_FUSIONNER'        // sous le seuil coach seul
  | 'RENTABLE'           // couvre coach + local
  | 'A_SURVEILLER';      // paie son coach mais pas tout son loyer

export async function parametresRentabilite() {
  const existant = await prisma.parametreRentabilite.findUnique({ where: { id: 1 } });
  if (existant) return existant;
  return prisma.parametreRentabilite.create({ data: { id: 1 } });
}

/** Σ heures hebdo des cours actifs + créneaux loués actifs (le dénominateur automatique). */
export async function heuresAutoSemaine(): Promise<number> {
  const [cours, creneaux] = await Promise.all([
    prisma.course.findMany({ where: { actif: true }, select: { startTime: true, endTime: true, jours: true } }),
    prisma.creneauLoue.findMany({ where: { actif: true }, select: { heureDebut: true, heureFin: true, jours: true } }),
  ]);
  const total =
    cours.reduce((a, c) => a + heuresHebdo(c), 0) +
    creneaux.reduce((a, l) => a + heuresHebdo({ startTime: l.heureDebut, endTime: l.heureFin, jours: l.jours }), 0);
  return arr2(total);
}

export async function calculerRapportHeures(base: BaseFinanciere) {
  const isoAuj = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const annee = Number(isoAuj.slice(0, 4));
  const mois = Number(isoAuj.slice(5, 7));

  const param = await parametresRentabilite();
  const [cours, creneaux, sections, membres, configLoyer] = await Promise.all([
    prisma.course.findMany({
      where: { actif: true },
      include: {
        coach: { select: { id: true, firstName: true, lastName: true, role: true, tauxHoraire: true, remuneration: true } },
      },
      orderBy: [{ section: 'asc' }, { startTime: 'asc' }],
    }),
    prisma.creneauLoue.findMany({ where: { actif: true } }),
    prisma.section.findMany(),
    prisma.member.findMany({
      where: { status: 'ACTIF' },
      select: { plan: true, montantFinal: true, sections: { select: { section: true } } },
    }),
    prisma.depenseConfig.findUnique({ where: { code: 'LOYER' } }),
  ]);

  const avertissements: string[] = [];
  const labelDe = new Map(sections.map((s) => [s.code, s.label]));
  const nomCours = (c: { section: string; jours: string[]; startTime: string; endTime: string }) =>
    `${labelDe.get(c.section) || c.section} (${c.jours.join('/')} ${c.startTime}-${c.endTime})`;

  // ---- Dénominateur : les heures ouvertes par semaine ----------------------
  for (const c of cours) {
    if (dureeCours(c.startTime, c.endTime) === 0) {
      avertissements.push(`Horaire illisible : ${nomCours(c)} — durée comptée 0, corriger le cours.`);
    }
  }
  const heuresAuto = arr2(
    cours.reduce((a, c) => a + heuresHebdo(c), 0) +
    creneaux.reduce((a, l) => a + heuresHebdo({ startTime: l.heureDebut, endTime: l.heureFin, jours: l.jours }), 0)
  );
  const heuresOuvertes = param.heuresOuvertesSemaine ?? heuresAuto;
  if (heuresOuvertes <= 0) {
    avertissements.push('Aucune heure ouverte connue : le coût du local par heure ne peut pas être calculé.');
  }

  // ---- Coût du local par heure (loyer seul — l'hydro et l'usure vivent dans
  // le coût MARGINAL, jamais ici) --------------------------------------------
  const loyerTTC = await getLoyerPourAnnee(annee);
  const loyerTaxable = configLoyer?.taxable ?? true;
  const loyerBase = base === 'net' && loyerTaxable ? loyerTTC / DIVISEUR_TAXES : loyerTTC;
  const loyerHebdo = (loyerBase * 12) / 52;
  const coutLocalHeure = heuresOuvertes > 0 ? loyerHebdo / heuresOuvertes : 0;

  // ---- Inscrits et valeur de séance PAR SECTION ----------------------------
  // Séances hebdo d'une section = Σ jours de ses cours actifs (dénominateur de
  // la valeur de séance ET poids du prorata multi-sections, comme rentabilite).
  const ssemSection = new Map<string, number>();
  for (const c of cours) ssemSection.set(c.section, (ssemSection.get(c.section) || 0) + c.jours.length);

  const inscritsSection = new Map<string, number>();
  const revenuAnnuelSection = new Map<string, number>(); // dans la base demandée, non arrondi
  for (const m of membres) {
    for (const s of m.sections) inscritsSection.set(s.section, (inscritsSection.get(s.section) || 0) + 1);
    const mf = m.montantFinal || 0;
    const annuelBrut = m.plan === 'ANNUEL' ? mf : m.plan === 'TRIMESTRIEL' ? mf * 4 : m.plan === 'MENSUEL' ? mf * 12 : 0;
    if (annuelBrut <= 0 || m.sections.length === 0) continue;
    const annuelBase = base === 'net' ? annuelBrut / DIVISEUR_TAXES : annuelBrut;
    const secs = m.sections.map((s) => s.section);
    const poids = secs.map((sec) => ssemSection.get(sec) || 0);
    const totalPoids = poids.reduce((a, b) => a + b, 0);
    const parts = totalPoids > 0 ? poids.map((p) => p / totalPoids) : secs.map(() => 1 / secs.length);
    for (let i = 0; i < secs.length; i++) {
      revenuAnnuelSection.set(secs[i], (revenuAnnuelSection.get(secs[i]) || 0) + annuelBase * parts[i]);
    }
  }
  // Valeur d'UNE séance de la section (tous inscrits confondus) : le revenu
  // annualisé de la section ÷ ses séances de saison. Deux cours du même groupe
  // (kickboxing jeudi et dimanche) partagent cette valeur — les inscrits ne
  // sont plus jamais comptés deux fois.
  const valeurSeanceSection = (sec: string) => {
    const ssem = ssemSection.get(sec) || 0;
    const seancesSaison = ssem * param.semainesSaison;
    return seancesSaison > 0 ? (revenuAnnuelSection.get(sec) || 0) / seancesSaison : 0;
  };

  // ---- Présents : moyenne des 4 dernières semaines TENUES ------------------
  // Une séance tenue = une date où au moins un membre du cours a été pointé
  // (même définition que Rétention : neutralise vacances et annulations).
  const FENETRE_JOURS = 120;
  const presences = await prisma.attendance.findMany({
    where: { date: { gte: new Date(Date.now() - FENETRE_JOURS * 86_400_000) }, courseId: { in: cours.map((c) => c.id) } },
    select: { courseId: true, date: true, status: true },
  });
  // Par cours : jour ISO -> nombre de PRESENT (la date compte comme séance
  // tenue même si le seul pointage est EXCUSED).
  const seancesParCours = new Map<string, Map<string, number>>();
  for (const p of presences) {
    const jour = p.date.toISOString().slice(0, 10);
    let m = seancesParCours.get(p.courseId);
    if (!m) { m = new Map(); seancesParCours.set(p.courseId, m); }
    m.set(jour, (m.get(jour) || 0) + (p.status === 'PRESENT' ? 1 : 0));
  }
  const statsPresence = (courseId: string, capacite: number | null) => {
    const seances = seancesParCours.get(courseId);
    if (!seances || seances.size === 0) {
      return { presentsMoyens: null as number | null, seancesObservees: 0, semainesPleines: 0 };
    }
    // Regrouper les séances tenues par semaine ISO, de la plus récente à la
    // plus ancienne.
    const parSemaine = new Map<string, { presents: number; seances: number }>();
    for (const [jour, presents] of seances) {
      const sem = cleSemaineIso(new Date(jour + 'T12:00:00Z'));
      const e = parSemaine.get(sem) || { presents: 0, seances: 0 };
      e.presents += presents;
      e.seances += 1;
      parSemaine.set(sem, e);
    }
    const semaines = [...parSemaine.keys()].sort().reverse();
    const fenetre = semaines.slice(0, 4).map((s) => parSemaine.get(s)!);
    const totalPresents = fenetre.reduce((a, e) => a + e.presents, 0);
    const totalSeances = fenetre.reduce((a, e) => a + e.seances, 0);
    // Semaines PLEINES consécutives depuis la plus récente (garde-fou du
    // dédoublement : N semaines de suite, pas un pic isolé).
    let semainesPleines = 0;
    if (capacite !== null && capacite > 0) {
      for (const s of semaines) {
        const e = parSemaine.get(s)!;
        if (e.presents / e.seances >= capacite) semainesPleines++;
        else break;
      }
    }
    return {
      presentsMoyens: totalSeances > 0 ? arr1(totalPresents / totalSeances) : null,
      seancesObservees: totalSeances,
      semainesPleines,
    };
  };

  // ---- Coût du coach par séance --------------------------------------------
  // Heures hebdo par coach (pour répartir un forfait mensuel sur ses cours).
  const heuresParCoach = new Map<string, number>();
  for (const c of cours) {
    if (c.coachId) heuresParCoach.set(c.coachId, (heuresParCoach.get(c.coachId) || 0) + heuresHebdo(c));
  }
  const coutCoachDe = (c: (typeof cours)[number], duree: number) => {
    if (!c.coach) {
      return { cout: 0, source: 'NON_ASSIGNE' as const, nom: null as string | null };
    }
    const nom = [c.coach.firstName, c.coach.lastName].filter(Boolean).join(' ') || null;
    if (c.coach.tauxHoraire !== null && c.coach.tauxHoraire !== undefined) {
      return { cout: c.coach.tauxHoraire * duree, source: 'TAUX' as const, nom };
    }
    if (c.coach.role === 'ADMIN') {
      // L'heure d'une proprio : valorisée seulement si le paramètre existe
      // (premier trimestre clos de Points & partage, ou saisie manuelle).
      const p = param.valeurHeureProprio;
      return { cout: p !== null && p !== undefined ? p * duree : 0, source: 'PROPRIO' as const, nom };
    }
    if ((c.coach.remuneration || 0) > 0) {
      // Forfait mensuel réparti sur les heures hebdo de SES cours actifs.
      const sesHeures = heuresParCoach.get(c.coach.id) || 0;
      if (sesHeures <= 0) return { cout: 0, source: 'SANS_TAUX' as const, nom };
      const tauxImplicite = ((c.coach.remuneration || 0) * 12) / 52 / sesHeures;
      return { cout: tauxImplicite * duree, source: 'FORFAIT_REPARTI' as const, nom };
    }
    return { cout: 0, source: 'SANS_TAUX' as const, nom };
  };

  // ---- Une ligne par cours --------------------------------------------------
  const lignes = cours.map((c) => {
    const duree = dureeCours(c.startTime, c.endTime);
    const ssem = c.jours.length;
    const inscrits = inscritsSection.get(c.section) || 0;
    const valSeance = valeurSeanceSection(c.section);         // toute la séance
    const vs = inscrits > 0 ? valSeance / inscrits : 0;        // par inscrit
    const { presentsMoyens, seancesObservees, semainesPleines } = statsPresence(c.id, c.capacite);

    const coach = coutCoachDe(c, duree);
    const coutCoachSeance = coach.cout;
    const coutLocalSeance = coutLocalHeure * duree;
    if (coach.source === 'NON_ASSIGNE') {
      avertissements.push(`Coach non assigné : ${nomCours(c)} — coût coach compté 0 $ (assigner le coach au cours).`);
    } else if (coach.source === 'SANS_TAUX') {
      avertissements.push(`Ni taux horaire ni rémunération : ${coach.nom} (${nomCours(c)}) — coût coach compté 0 $.`);
    }
    if (c.capacite === null) {
      avertissements.push(`Capacité manquante : ${nomCours(c)} — les verdicts de dédoublement sont désactivés.`);
    }

    // Formules du Livrable 2, verbatim. Plancher du seuil coach : un cours
    // sans débours de coach (proprio non valorisée, coach à assigner) doit au
    // moins couvrir le coût MARGINAL de tenir le créneau.
    const plancherSeance = coutCoachSeance === 0 ? param.coutMarginalHeure * duree : coutCoachSeance;
    const seuilCoach = vs > 0 ? Math.ceil(Math.max(coutCoachSeance, plancherSeance) / vs) : null;
    const seuilComplet = vs > 0 ? Math.ceil((coutCoachSeance + coutLocalSeance) / vs) : null;
    const margeCoachHebdo = (inscrits * vs - coutCoachSeance) * ssem;
    const margeCompletHebdo = (inscrits * vs - coutCoachSeance - coutLocalSeance) * ssem;
    const ecartPct = inscrits > 0 && presentsMoyens !== null
      ? Math.round(((inscrits - presentsMoyens) / inscrits) * 100)
      : null;

    // Verdict — l'ordre du Livrable 2, plus le garde-fou des N semaines.
    let verdict: VerdictCours;
    if (duree === 0) verdict = 'HORAIRE_INVALIDE';
    else if (inscrits === 0) verdict = 'AUCUN_INSCRIT';
    else if (vs === 0) verdict = 'SANS_REVENU';
    else if (c.capacite !== null && presentsMoyens !== null && presentsMoyens >= c.capacite) {
      if (c.capaciteDeuxCoachs !== null && presentsMoyens < c.capaciteDeuxCoachs) {
        verdict = 'DEUXIEME_ENTRAINEUR';
      } else if (
        semainesPleines >= param.semainesAvantDedoublement &&
        seuilComplet !== null && inscrits / 2 >= seuilComplet
      ) {
        verdict = 'A_DEDOUBLER';
      } else {
        verdict = 'CAPACITE_ATTEINTE';
      }
    }
    else if (c.strategique && margeCompletHebdo < 0) verdict = 'STRATEGIQUE';
    else if (seuilCoach !== null && inscrits < seuilCoach) verdict = 'A_FUSIONNER';
    else if (seuilComplet !== null && inscrits >= seuilComplet) verdict = 'RENTABLE';
    else verdict = 'A_SURVEILLER';

    return {
      id: c.id,
      section: c.section,
      label: labelDe.get(c.section) || c.section,
      jours: c.jours,
      startTime: c.startTime,
      endTime: c.endTime,
      duree,
      ssem,
      heuresHebdo: arr2(duree * ssem),
      coach: coach.nom,
      coachSource: coach.source,
      capacite: c.capacite,
      capaciteDeuxCoachs: c.capaciteDeuxCoachs,
      strategique: c.strategique,
      inscrits,
      presentsMoyens,
      seancesObservees,
      semainesPleines,
      ecartPct,
      decrochage: ecartPct !== null && ecartPct >= 30,
      valeurSeance: arr2(valSeance),
      valeurParInscrit: arr2(vs),
      coutCoachSeance: arr2(coutCoachSeance),
      coutLocalSeance: arr2(coutLocalSeance),
      seuilCoach,
      seuilComplet,
      margeCoachHebdo: arr2(margeCoachHebdo),
      margeCompletHebdo: arr2(margeCompletHebdo),
      verdict,
    };
  });

  // ---- Réconciliation paie (§ 1.4 du spec) ----------------------------------
  // Le coût par cours est une VENTILATION analytique ; le P&L global reste
  // masseSalarialePourMois. L'écart entre les deux est AFFICHÉ, jamais tu.
  // (Les heures de proprio et les planchers marginaux n'y entrent pas : seuls
  // les salaires réellement versés se réconcilient.)
  const ventileMensuel = lignes.reduce((a, l) => {
    if (l.coachSource === 'TAUX' || l.coachSource === 'FORFAIT_REPARTI') {
      return a + (l.coutCoachSeance * l.ssem * 52) / 12;
    }
    return a;
  }, 0);
  const masseSalarialeMois = await masseSalarialePourMois(mois, annee);

  const classementBloque = param.valeurHeureProprio === null || param.valeurHeureProprio === undefined;
  if (classementBloque) {
    avertissements.push(
      "Valeur de l'heure de proprio indéfinie : aucun classement de sections — elle se remplira au premier trimestre clos de Points & partage, ou à la main dans les paramètres."
    );
  }

  return {
    base,
    calculeLe: isoAuj,
    parametres: {
      heuresOuvertesSemaine: param.heuresOuvertesSemaine, // null = auto
      heuresAutoSemaine: heuresAuto,
      heuresOuvertesEffectives: arr2(heuresOuvertes),
      semainesSaison: param.semainesSaison,
      coutMarginalHeure: param.coutMarginalHeure,
      valeurHeureProprio: param.valeurHeureProprio,
      semainesAvantDedoublement: param.semainesAvantDedoublement,
    },
    loyerMensuel: arr2(loyerBase),
    coutLocalHeure: arr2(coutLocalHeure),
    cours: lignes,
    reconciliationPaie: {
      ventileMensuel: arr2(ventileMensuel),
      masseSalarialeMois: arr2(masseSalarialeMois),
      ecart: arr2(ventileMensuel - masseSalarialeMois),
    },
    totaux: {
      margeCompletHebdo: arr2(lignes.reduce((a, l) => a + l.margeCompletHebdo, 0)),
      heuresCoursSemaine: arr2(lignes.reduce((a, l) => a + l.heuresHebdo, 0)),
      heuresLoueesSemaine: arr2(creneaux.reduce((a, l) => a + heuresHebdo({ startTime: l.heureDebut, endTime: l.heureFin, jours: l.jours }), 0)),
    },
    classementBloque,
    avertissements,
  };
}
