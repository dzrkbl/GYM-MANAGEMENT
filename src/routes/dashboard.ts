import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { masseSalarialePourMois } from '../lib/finances';
import { clePeriode, cleMois, debutFenetre, jourMontreal, type Granularite } from '../lib/periodes';

const router = Router();

// Jour courant à Montréal (AAAA-MM-JJ) : le serveur tourne en UTC, où « new
// Date() » après 20 h de Montréal est déjà demain.
function aujourdhuiMontreal(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

// « En retard » du tableau de bord : impayés dont le jour d'échéance est passé
// (jour civil), membres INACTIF exclus — mêmes règles que la page Paiements.
function whereRetards() {
  return {
    datePaiement: null,
    datePrevue: { lt: new Date(aujourdhuiMontreal() + 'T00:00:00Z') },
    member: { status: { not: 'INACTIF' } },
  };
}

// Renouvellements échus : membres ACTIFS dont le contrat est terminé — ils
// doivent re-payer leur formule (c'est de l'argent à percevoir, invisible dans
// les versements puisque l'ancien échéancier est soldé).
async function renouvellementsEchus() {
  const membres = await prisma.member.findMany({
    where: { status: 'ACTIF', finContrat: { lt: new Date(aujourdhuiMontreal() + 'T00:00:00Z') } },
    include: { versements: true },
  });
  let montantARenouveler = 0;
  let resteAnciensContrats = 0;
  for (const m of membres) {
    montantARenouveler += m.montantFinal || 0;
    const paye = m.versements.filter((v) => v.datePaiement).reduce((n, v) => n + v.montant, 0);
    const reste = Math.round(((m.montantFinal || 0) - paye) * 100) / 100;
    if (reste > 0) resteAnciensContrats += reste;
  }
  return {
    count: membres.length,
    montantARenouveler: Math.round(montantARenouveler * 100) / 100,
    resteAnciensContrats: Math.round(resteAnciensContrats * 100) / 100,
  };
}

// Revenus d'un mois CIVIL de Montréal (month : indice 0-11). `datePaiement`
// peut être un vrai horodatage (encaissement saisi « maintenant ») : un
// paiement du 31 à 20 h 30 heure de Montréal est déjà le 1er en UTC — la
// fenêtre SQL est donc élargie d'un jour de chaque côté, puis chaque
// versement est rattaché à son mois par le jour civil de Montréal.
const getRevenusForMonth = async (year: number, month: number) => {
  const moisCible = `${year}-${String(month + 1).padStart(2, '0')}`;
  const startDate = new Date(Date.UTC(year, month, 1) - 36 * 3_600_000);
  const endDate = new Date(Date.UTC(year, month + 1, 1) + 36 * 3_600_000);

  const bruts = await prisma.paymentVersement.findMany({
    where: {
      datePaiement: { gte: startDate, lte: endDate }
    },
    select: {
      montant: true,
      datePaiement: true,
      member: {
        select: {
          sections: { select: { section: true } }
        }
      }
    }
  });
  const versements = bruts.filter((v) => v.datePaiement && cleMois(v.datePaiement) === moisCible);

  const total = versements.reduce((sum, v) => sum + v.montant, 0);

  const bySection = versements.reduce((acc, v) => {
    const s = v.member?.sections?.[0]?.section || 'INCONNU';
    acc[s] = (acc[s] || 0) + v.montant;
    return acc;
  }, {} as Record<string, number>);

  return { total, section: bySection, bySection };
};

// GET /api/dashboard/revenus
router.get('/revenus', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const reqMonth = req.query.month as string || aujourdhuiMontreal().slice(0, 7); // AAAA-MM (Montréal)
    const [yearStr, monthStr] = reqMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1; // 0-based

    const moisActuel = await getRevenusForMonth(year, monthIndex);
    
    // Mois précédent
    let prevYear = year;
    let prevMonthIndex = monthIndex - 1;
    if (prevMonthIndex < 0) {
      prevMonthIndex = 11;
      prevYear -= 1;
    }
    const moisPrecedent = await getRevenusForMonth(prevYear, prevMonthIndex);

    const variation = moisActuel.total - moisPrecedent.total;

    return sendSuccess(res, { moisActuel, moisPrecedent, variation });
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des revenus', 500);
  }
});

// GET /api/dashboard/revenus/section
router.get('/revenus/section', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const reqMonth = req.query.month as string || aujourdhuiMontreal().slice(0, 7); // AAAA-MM (Montréal)
    const [yearStr, monthStr] = reqMonth.split('-');
    
    const revenues = await getRevenusForMonth(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1);
    
    return sendSuccess(res, { bySection: revenues.section });
  } catch (error) {
    return sendError(res, 'Erreur', 500);
  }
});

// GET /api/dashboard/retards
router.get('/retards', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const overdues = await prisma.paymentVersement.findMany({ where: whereRetards() });

    const count = new Set(overdues.map((p) => p.membreId)).size;
    const montantTotal = overdues.reduce((sum, p) => sum + p.montant, 0);

    return sendSuccess(res, { count, versements: overdues.length, montantTotal });

  } catch (error) {
    return sendError(res, 'Erreur', 500);
  }
});

// GET /api/dashboard/membres
router.get('/membres', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
   try {
     const membres = await prisma.member.findMany({
       where: { status: 'ACTIF' },
       include: { sections: true }
     });

     let total = membres.length;
     const parSection: Record<string, number> = {};

     for (const m of membres) {
       const sectionName = m.sections[0]?.section;
       if (sectionName) {
         parSection[sectionName] = (parSection[sectionName] || 0) + 1;
       }
     }

     return sendSuccess(res, { total, parSection });
   } catch (error) {
     return sendError(res, 'Erreur', 500);
   }
});

// GET /api/dashboard/resume
router.get('/resume', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    // Mois courant = mois CIVIL de Montréal (le soir du dernier jour du mois,
    // « new Date().getMonth() » sur le serveur UTC est déjà le mois suivant —
    // revenus à 0 $ et variation absurde à l'écran chaque fin de mois).
    const [anneeMtl, moisMtl] = aujourdhuiMontreal().split('-').map(Number);
    const moisActuel = await getRevenusForMonth(anneeMtl, moisMtl - 1);
    let prevYear = anneeMtl;
    let prevMonthIndex = moisMtl - 2;
    if (prevMonthIndex < 0) { prevMonthIndex = 11; prevYear -= 1; }
    const moisPrecedent = await getRevenusForMonth(prevYear, prevMonthIndex);
    
    // Retards (mêmes règles que la page Paiements) + renouvellements échus
    const overdues = await prisma.paymentVersement.findMany({ where: whereRetards() });
    const retardsCount = new Set(overdues.map((p) => p.membreId)).size;
    const retardsMontant = overdues.reduce((sum, p) => sum + p.montant, 0);
    const renouvellements = await renouvellementsEchus();

    // Membres
    const membres = await prisma.member.findMany({
       where: { status: 'ACTIF' },
       include: { sections: true }
    });
    const parSection: Record<string, number> = {};
    for (const m of membres) {
       const sectionName = m.sections[0]?.section;
       if (sectionName) {
         parSection[sectionName] = (parSection[sectionName] || 0) + 1;
       }
    }

    // Présences de la semaine : du lundi 00 h au dimanche 23 h 59 (jours civils
    // de Montréal). L'ancien calcul gardait l'heure courante (le lundi matin
    // disparaissait dès l'après-midi) et, le dimanche, visait la semaine SUIVANTE.
    const [ay, am, aj] = aujourdhuiMontreal().split('-').map(Number);
    const ref = new Date(Date.UTC(ay, am - 1, aj));
    const decalage = (ref.getUTCDay() + 6) % 7; // 0 = lundi
    const weekStart = new Date(ref);
    weekStart.setUTCDate(ref.getUTCDate() - decalage);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const attendances = await prisma.attendance.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { course: true }
    });
    
    // Group weekly attendances by session (courseId + date) to calculate rates per section
    const sessionsMap = new Map<string, { courseId: string; dateStr: string; sectionName: string; attendCount: number }>();
    for (const a of attendances) {
      const dateKey = a.date instanceof Date ? a.date.toISOString().split('T')[0] : new Date(a.date).toISOString().split('T')[0];
      const sessionKey = `${a.courseId}_${dateKey}`;
      const existingSession = sessionsMap.get(sessionKey);
      if (existingSession) {
        existingSession.attendCount += 1;
      } else {
        sessionsMap.set(sessionKey, {
          courseId: a.courseId,
          dateStr: dateKey,
          sectionName: a.course?.section || '',
          attendCount: 1
        });
      }
    }

    let totalPossibleAttendances = 0;
    for (const session of sessionsMap.values()) {
      const secCount = parSection[session.sectionName] || 0;
      totalPossibleAttendances += secCount || 1;
    }

    let tauxCetteSemaine = 0;
    if (totalPossibleAttendances > 0) {
      tauxCetteSemaine = Math.round((attendances.length / totalPossibleAttendances) * 100);
      if (tauxCetteSemaine > 100) tauxCetteSemaine = 100;
    }

    // Masse salariale : MÊME source que le Module financier (override du mois
    // sinon « Gérer les coachs ») — le Dashboard affichait un 3e chiffre.
    const masseSalariale = await masseSalarialePourMois(moisMtl, anneeMtl);

    return sendSuccess(res, {
      revenus: {
        moisActuel: moisActuel.total,
        moisPrecedent: moisPrecedent.total,
        variation: moisActuel.total - moisPrecedent.total
      },
      membres: {
        total: membres.length,
        parSection
      },
      retards: {
        count: retardsCount,
        versements: overdues.length,
        montantTotal: retardsMontant
      },
      renouvellements,
      presences: {
        tauxCetteSemaine
      },
      masseSalariale
    });

  } catch (error) {
    return sendError(res, 'Erreur du dashboard résumé', 500);
  }
});

// GET /api/dashboard/kpis — indicateurs de pilotage
router.get('/kpis', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  try {
    // Tout est calé sur le jour/mois CIVIL de Montréal (le serveur tourne en
    // UTC : le soir, « new Date() » est déjà demain — voire le mois suivant).
    const [anneeMtl, moisMtl] = aujourdhuiMontreal().split('-').map(Number);

    // MRR : équivalent mensuel des cotisations des membres actifs dont le
    // contrat COURT ENCORE (un contrat expiré ne rapporte plus : il est dans
    // « Renouvellements échus », pas dans le récurrent).
    const debutJour = new Date(aujourdhuiMontreal() + 'T00:00:00Z');
    const actifs = await prisma.member.findMany({
      where: { status: 'ACTIF', OR: [{ finContrat: null }, { finContrat: { gte: debutJour } }] },
      select: { plan: true, montantFinal: true },
    });
    let mrr = 0;
    for (const m of actifs) {
      const montant = m.montantFinal || 0;
      if (m.plan === 'ANNUEL') mrr += montant / 12;
      else if (m.plan === 'TRIMESTRIEL') mrr += montant / 3;
      else if (m.plan === 'MENSUEL') mrr += montant;
    }
    mrr = Math.round(mrr * 100) / 100;

    // Rétention : actifs / (actifs + inactifs). EN_ATTENTE exclus (pas encore démarrés).
    const [nbActifs, nbInactifs] = await Promise.all([
      prisma.member.count({ where: { status: 'ACTIF' } }),
      prisma.member.count({ where: { status: 'INACTIF' } }),
    ]);
    const retentionPct = (nbActifs + nbInactifs) > 0
      ? Math.round((nbActifs / (nbActifs + nbInactifs)) * 1000) / 10
      : 0;

    // Recouvrement : parmi les versements échus, part déjà encaissée (en
    // montant). Les membres INACTIF sont EXCLUS, comme partout ailleurs :
    // leurs impayés ne rentreront jamais et plombaient le pourcentage à
    // chaque départ (mêmes règles que `whereRetards` et que les prévisions).
    const echus = await prisma.paymentVersement.findMany({
      where: {
        datePrevue: { lte: new Date(aujourdhuiMontreal() + 'T23:59:59Z') },
        member: { status: { not: 'INACTIF' } },
      },
      select: { montant: true, datePaiement: true },
    });
    let totalEchu = 0, encaisseEchu = 0;
    for (const v of echus) { totalEchu += v.montant; if (v.datePaiement) encaisseEchu += v.montant; }
    const recouvrementPct = totalEchu > 0 ? Math.round((encaisseEchu / totalEchu) * 1000) / 10 : 100;

    // Prévision de trésorerie : 3 prochains mois (versements prévus, à partir du mois courant).
    const moisLabels = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const previsions = [];
    for (let i = 0; i < 3; i++) {
      // Bornes UTC du mois (les échéances sont ancrées à midi UTC) ; le mois
      // de départ est le mois civil de Montréal, pas celui du serveur.
      const debut = new Date(Date.UTC(anneeMtl, moisMtl - 1 + i, 1));
      const fin = new Date(Date.UTC(anneeMtl, moisMtl + i, 0, 23, 59, 59));
      // Versements planifiés du mois (les membres INACTIF n'apportent plus rien).
      const vers = await prisma.paymentVersement.findMany({
        where: { datePrevue: { gte: debut, lte: fin }, member: { status: { not: 'INACTIF' } } },
        select: { montant: true, datePaiement: true },
      });
      let total = 0, encaisse = 0;
      for (const v of vers) { total += v.montant; if (v.datePaiement) encaisse += v.montant; }
      // Renouvellements attendus : contrats de membres ACTIFS se terminant ce
      // mois-là — au renouvellement, la formule est re-payée (montantFinal).
      const finissants = await prisma.member.findMany({
        where: { status: 'ACTIF', finContrat: { gte: debut, lte: fin } },
        select: { montantFinal: true },
      });
      const renouvellementsAttendus = finissants.reduce((n, m) => n + (m.montantFinal || 0), 0);
      previsions.push({
        label: `${moisLabels[debut.getUTCMonth()]} ${debut.getUTCFullYear()}`,
        total: Math.round(total * 100) / 100,
        encaisse: Math.round(encaisse * 100) / 100,
        aVenir: Math.round((total - encaisse) * 100) / 100,
        renouvellements: Math.round(renouvellementsAttendus * 100) / 100,
      });
    }

    return sendSuccess(res, {
      mrr,
      retention: { pct: retentionPct, actifs: nbActifs, inactifs: nbInactifs },
      recouvrement: { pct: recouvrementPct, encaisse: Math.round(encaisseEchu * 100) / 100, total: Math.round(totalEchu * 100) / 100 },
      previsions,
    });
  } catch (error) {
    return sendError(res, 'Erreur lors du calcul des KPIs', 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Indicateurs de pilotage : recrutement, attrition, entonnoir des prospects.
// Toutes les clés de période passent par `src/lib/periodes.ts`, donc par le
// jour civil de MONTRÉAL : le serveur tourne en UTC et une inscription du
// 31 août à 20 h basculerait sinon dans le mois de septembre.
// ─────────────────────────────────────────────────────────────────────────────

function granulariteDe(v: unknown): Granularite {
  return v === 'semaine' || v === 'trimestre' ? v : 'mois';
}
const borne = (v: unknown, defaut: number, max: number) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : defaut;
};

// GET /api/dashboard/inscriptions?granularite=mois|semaine|trimestre&mois=6
// Nouvelles inscriptions par période, par discipline et par provenance.
router.get('/inscriptions', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const granularite = granulariteDe(req.query.granularite);
    const mois = borne(req.query.mois, 6, 60);
    const debut = debutFenetre(mois);

    // AUCUN filtre sur le statut : un membre inscrit en mars puis parti en juin
    // reste une inscription de mars. Filtrer sur ACTIF ferait rétrécir le passé
    // à chaque départ, et le graphique se réécrirait tout seul.
    const membres = await prisma.member.findMany({
      where: { signupDate: { gte: debut } },
      select: {
        status: true,
        signupDate: true,
        provenance: true,
        sections: { select: { section: true } },
      },
      orderBy: { signupDate: 'asc' },
    });

    const parPeriode = new Map<string, { total: number; parDiscipline: Record<string, number> }>();
    const parDiscipline: Record<string, number> = {};
    const parProvenance: Record<string, number> = {};
    let encoreActifs = 0;

    for (const m of membres) {
      const cle = clePeriode(m.signupDate, granularite);
      if (!parPeriode.has(cle)) parPeriode.set(cle, { total: 0, parDiscipline: {} });
      const bloc = parPeriode.get(cle)!;
      bloc.total++;

      const discipline = m.sections[0]?.section || 'AUTRE';
      bloc.parDiscipline[discipline] = (bloc.parDiscipline[discipline] || 0) + 1;
      parDiscipline[discipline] = (parDiscipline[discipline] || 0) + 1;

      const prov = m.provenance || 'NON_SPECIFIE';
      parProvenance[prov] = (parProvenance[prov] || 0) + 1;
      if (m.status === 'ACTIF') encoreActifs++;
    }

    return sendSuccess(res, {
      granularite,
      depuis: jourMontreal(debut),
      periodes: [...parPeriode.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periode, v]) => ({ periode, ...v })),
      parDiscipline,
      parProvenance,
      total: membres.length,
      // Combien de ces recrues sont encore là : la rétention des cohortes
      // récentes, sans fausser le compte des inscriptions.
      encoreActifs,
    });
  } catch (error) {
    console.error('Erreur GET /api/dashboard/inscriptions:', error);
    return sendError(res, 'Erreur lors du calcul des inscriptions', 500);
  }
});

// GET /api/dashboard/churn?mois=6 — départs et motifs.
router.get('/churn', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const mois = borne(req.query.mois, 6, 60);
    const debut = debutFenetre(mois);

    // La date de départ vient du JOURNAL D'AUDIT, pas de `updatedAt` : ce
    // dernier bouge à chaque modification de fiche (téléphone corrigé,
    // paiement encaissé, ceinture changée), et daterait un départ de janvier
    // au jour de la dernière retouche. `PATCH /membres/:id/statut` écrit
    // « → INACTIF » dans la description ; c'est cette trace qui fait foi.
    const traces = await prisma.auditLog.findMany({
      where: { entity: 'Member', description: { contains: '→ INACTIF' }, createdAt: { gte: debut } },
      select: { entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const dateDepartParMembre = new Map<string, Date>();
    for (const t of traces) {
      if (t.entityId && !dateDepartParMembre.has(t.entityId)) dateDepartParMembre.set(t.entityId, t.createdAt);
    }

    const inactifs = await prisma.member.findMany({
      where: { status: 'INACTIF' },
      select: {
        id: true, firstName: true, lastName: true, raisonDepart: true,
        signupDate: true, updatedAt: true, sections: { select: { section: true } },
      },
    });

    const parPeriode = new Map<string, number>();
    const parDiscipline: Record<string, number> = {};
    const parRaison: Record<string, number> = {};
    const departs: any[] = [];

    for (const m of inactifs) {
      const precise = dateDepartParMembre.get(m.id);
      // Sans trace d'audit (départ antérieur à la journalisation, ou statut
      // changé par un autre chemin), on retombe sur `updatedAt` — mais c'est
      // signalé, jamais présenté comme une date sûre.
      const date = precise ?? (m.updatedAt >= debut ? m.updatedAt : null);
      if (!date) continue;

      const cle = clePeriode(date, 'mois');
      parPeriode.set(cle, (parPeriode.get(cle) || 0) + 1);
      const discipline = m.sections[0]?.section || 'AUTRE';
      parDiscipline[discipline] = (parDiscipline[discipline] || 0) + 1;
      const raison = m.raisonDepart || 'Non spécifiée';
      parRaison[raison] = (parRaison[raison] || 0) + 1;

      departs.push({
        id: m.id,
        nom: `${m.firstName} ${m.lastName}`,
        discipline,
        dateDepart: jourMontreal(date),
        dateEstimee: !precise,
        raison: m.raisonDepart || null,
        moisDeVie: m.signupDate
          ? Math.max(0, Math.round((date.getTime() - m.signupDate.getTime()) / (30 * 86_400_000)))
          : null,
      });
    }
    departs.sort((a, b) => b.dateDepart.localeCompare(a.dateDepart));

    const actifs = await prisma.member.count({ where: { status: 'ACTIF' } });
    // Approximation assumée : départs par mois rapportés au parc moyen
    // (actifs actuels + partis sur la fenêtre). La formule exacte demanderait
    // l'effectif au premier jour de chaque mois, que l'historique ne conserve pas.
    const parcMoyen = actifs + departs.length;
    const tauxMensuelPct = parcMoyen > 0
      ? Math.round(((departs.length / mois) / parcMoyen) * 1000) / 10
      : 0;

    const dureeMoyenneMois = departs.filter((d) => d.moisDeVie !== null).length
      ? Math.round(departs.reduce((s, d) => s + (d.moisDeVie || 0), 0) / departs.filter((d) => d.moisDeVie !== null).length)
      : null;

    return sendSuccess(res, {
      depuis: jourMontreal(debut),
      periodes: [...parPeriode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periode, total]) => ({ periode, total })),
      parDiscipline,
      parRaison,
      departs,
      total: departs.length,
      datesEstimees: departs.filter((d) => d.dateEstimee).length,
      avecRaison: departs.filter((d) => d.raison).length,
      actifs,
      tauxMensuelPct,
      dureeMoyenneMois,
    });
  } catch (error) {
    console.error('Erreur GET /api/dashboard/churn:', error);
    return sendError(res, "Erreur lors du calcul de l'attrition", 500);
  }
});

// GET /api/dashboard/conversion-funnel?jours=30 — prospects → membres.
router.get('/conversion-funnel', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const jours = borne(req.query.jours, 30, 730);
    const debut = new Date(Date.now() - jours * 86_400_000);

    const leads = await prisma.lead.findMany({
      where: { createdAt: { gte: debut } },
      select: {
        status: true, sport: true, requestType: true, source: true,
        createdAt: true, updatedAt: true, ficheRecueAt: true,
      },
    });

    const parStatut: Record<string, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, LOST: 0 };
    const parSport: Record<string, number> = {};
    const parDemande: Record<string, number> = {};
    const parSource: Record<string, number> = {};
    for (const l of leads) {
      parStatut[l.status] = (parStatut[l.status] || 0) + 1;
      parSport[l.sport] = (parSport[l.sport] || 0) + 1;
      parDemande[l.requestType] = (parDemande[l.requestType] || 0) + 1;
      parSource[l.source || 'NON_SPECIFIE'] = (parSource[l.source || 'NON_SPECIFIE'] || 0) + 1;
    }

    const total = leads.length;
    // « Sortis de la file d'attente » : tout sauf NEW. Un prospect marqué LOST
    // sans avoir été appelé y figure aussi — d'où le nom, plutôt que « contactés ».
    const traites = total - parStatut.NEW;
    const convertis = parStatut.CONVERTED;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    // Délai de conversion : `ficheRecueAt` est posé à l'instant exact où la
    // fiche d'inscription arrive. `updatedAt` ne sert que de repli, car il
    // bouge à chaque retouche du prospect.
    const delais = leads
      .filter((l) => l.status === 'CONVERTED')
      .map((l) => ((l.ficheRecueAt ?? l.updatedAt).getTime() - l.createdAt.getTime()) / 86_400_000)
      .filter((d) => d >= 0);
    const delaiMoyenJours = delais.length
      ? Math.round((delais.reduce((s, d) => s + d, 0) / delais.length) * 10) / 10
      : null;

    return sendSuccess(res, {
      periode: { jours, debut: jourMontreal(debut), fin: jourMontreal(new Date()) },
      entonnoir: { total, traites, convertis, perdus: parStatut.LOST, enAttente: parStatut.NEW },
      taux: {
        traitementPct: pct(traites, total),
        conversionPct: pct(convertis, traites),
        globalPct: pct(convertis, total),
      },
      parStatut, parSport, parDemande, parSource,
      delaiMoyenJours,
      delaisMesures: delais.length,
    });
  } catch (error) {
    console.error('Erreur GET /api/dashboard/conversion-funnel:', error);
    return sendError(res, "Erreur lors du calcul de l'entonnoir", 500);
  }
});

export default router;
