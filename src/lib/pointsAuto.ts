import { prisma } from './prisma';
import { jourMontreal, cleSemaineIso } from './periodes';
import { dureeCours } from './horaire';

/**
 * POINTS AUTOMATIQUES — le cœur de l'exigence « tout ce qui peut être déduit
 * de l'application ne doit jamais être saisi à la main ».
 *
 * Pour une période donnée, dérive les points des DEUX ASSOCIÉES (comptes
 * ADMIN actifs — les coachs salariés n'ont jamais de points) à partir des
 * traces déjà existantes : présences pointées (avec l'identité de qui a
 * pointé), journal d'audit (encaissements, inscriptions, renouvellements,
 * factures, rétention, ventes, affiliations, remboursements, communications),
 * et fil de suivi des prospects (notes signées).
 *
 * Les valeurs viennent du barème (TachePoints par `code`) : modifier le
 * barème change les périodes AFFICHÉES ensuite — les tâches du PLAN, elles,
 * figent leurs points au moment du « fait ». Un règlement trimestriel clos
 * se fige en pratique par le versement (et l'audit garde toute l'histoire).
 */

export interface LigneAuto {
  code: string;
  nom: string;
  parUser: Record<string, { quantite: number; points: number }>;
}

export interface PointsAuto {
  associes: { id: string; nom: string }[];
  lignes: LigneAuto[];
  totaux: Record<string, number>;
}

const arrondir = (n: number) => Math.round(n * 100) / 100;
const isoJour = (d: Date) => d.toISOString().slice(0, 10);

export async function calculerPointsAuto(debut: Date, fin: Date): Promise<PointsAuto> {
  // Les associées = les comptes ADMIN actifs. Les heures des coachs salariés
  // sont une charge du club, jamais des points.
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', actif: true },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const adminIds = new Set(admins.map((a) => a.id));
  const associes = admins.map((a) => ({
    id: a.id,
    nom: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email,
  }));

  // Valeurs du barème par code.
  const bareme = await prisma.tachePoints.findMany({ where: { code: { not: null }, actif: true } });
  const parCode = new Map(bareme.map((b) => [b.code as string, b]));
  const valeurDe = (code: string) => parCode.get(code)?.valeur ?? 0;
  const supplementDe = (code: string) => parCode.get(code)?.supplement ?? 0;

  const lignes = new Map<string, LigneAuto>();
  const crediter = (code: string, userId: string, quantite: number, points: number) => {
    if (!adminIds.has(userId) || points === 0) return;
    const b = parCode.get(code);
    if (!b) return; // ligne retirée du barème : rien à créditer
    let l = lignes.get(code);
    if (!l) { l = { code, nom: b.nom, parUser: {} }; lignes.set(code, l); }
    const e = l.parUser[userId] || { quantite: 0, points: 0 };
    e.quantite = arrondir(e.quantite + quantite);
    e.points = arrondir(e.points + points);
    l.parUser[userId] = e;
  };

  // Bornes : `debut`/`fin` sont des dates-jour à midi UTC ; le journal d'audit
  // porte de vrais horodatages — on couvre les jours civils complets.
  const debutJour = new Date(isoJour(debut) + 'T00:00:00Z');
  const finJour = new Date(isoJour(fin) + 'T23:59:59Z');

  // ---------------------------------------------------------------
  // 1. PRÉSENCES : pointages (soir même / rétroactif), cours donnés,
  //    permanences d'accueil — depuis Attendance + l'horaire des cours.
  // ---------------------------------------------------------------
  const presences = await prisma.attendance.findMany({
    where: { date: { gte: debutJour, lte: finJour } },
    select: {
      courseId: true, date: true, pointeParId: true, pointeAt: true,
      course: { select: { coachId: true, startTime: true, endTime: true } },
    },
  });

  // Une SÉANCE = (cours, jour). On compte chaque séance une seule fois.
  interface Seance {
    jour: string; coachId: string | null; duree: number;
    // pointeur → nb de présences saisies, et si AU MOINS UNE l'a été le soir même
    pointeurs: Map<string, { n: number; soirMeme: boolean }>;
  }
  const seances = new Map<string, Seance>();
  for (const p of presences) {
    const jour = isoJour(p.date);
    const cle = `${p.courseId}|${jour}`;
    let s = seances.get(cle);
    if (!s) {
      s = { jour, coachId: p.course?.coachId ?? null, duree: dureeCours(p.course?.startTime || '0:00', p.course?.endTime || '0:00'), pointeurs: new Map() };
      seances.set(cle, s);
    }
    if (p.pointeParId) {
      const e = s.pointeurs.get(p.pointeParId) || { n: 0, soirMeme: false };
      e.n += 1;
      // « Soir même » = saisi le jour civil (Montréal) du cours. Une trace
      // sans pointeAt (historique d'avant la traçabilité) compte soir même.
      if (!p.pointeAt || jourMontreal(p.pointeAt) === jour) e.soirMeme = true;
      s.pointeurs.set(p.pointeParId, e);
    }
  }

  // Secondages DÉCLARÉS au plan : annulent la permanence automatique du jour.
  const secondages = await prisma.planTache.findMany({
    where: { statut: { in: ['FAIT', 'REPRIS'] }, faitLe: { gte: debutJour, lte: finJour }, tache: { code: 'SECONDAGE' } },
    select: { faitParId: true, faitLe: true },
  });
  const aSeconde = new Set(secondages.map((s) => `${s.faitParId}|${isoJour(s.faitLe as Date)}`));

  const permanencesFaites = new Set<string>(); // (user|jour) déjà créditée
  for (const s of seances.values()) {
    // Cours donné : séance TENUE d'un cours dont l'associée est le coach assigné.
    if (s.coachId && adminIds.has(s.coachId) && s.duree > 0) {
      crediter('COURS_DONNE', s.coachId, 1, arrondir(s.duree * valeurDe('COURS_DONNE') + supplementDe('COURS_DONNE')));
    }
    // Pointage : la séance est créditée au pointeur MAJORITAIRE (une seule fois).
    let meilleur: { id: string; n: number; soirMeme: boolean } | null = null;
    for (const [id, e] of s.pointeurs) {
      if (!meilleur || e.n > meilleur.n) meilleur = { id, ...e };
    }
    if (meilleur && adminIds.has(meilleur.id)) {
      const code = meilleur.soirMeme ? 'POINTAGE_SOIR' : 'POINTAGE_RETRO';
      crediter(code, meilleur.id, 1, valeurDe(code));
      // Permanence : a pointé ce soir-là SANS être le coach de la séance —
      // une fois par (personne, jour), annulée si un secondage est déclaré.
      const clePerm = `${meilleur.id}|${s.jour}`;
      if (s.coachId !== meilleur.id && !aSeconde.has(clePerm) && !permanencesFaites.has(clePerm)) {
        // il ne doit être coach d'AUCUNE séance tenue ce jour-là
        const enseigneCeJour = [...seances.values()].some((x) => x.jour === s.jour && x.coachId === meilleur!.id);
        if (!enseigneCeJour) {
          permanencesFaites.add(clePerm);
          crediter('PERMANENCE', meilleur.id, 1, valeurDe('PERMANENCE'));
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // 2. JOURNAL D'AUDIT : tout le reste des traces automatiques.
  // ---------------------------------------------------------------
  const audits = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: debutJour, lte: finJour },
      userId: { in: [...adminIds] },
      entity: { in: ['PaymentVersement', 'Member', 'Facture', 'Retention', 'VenteEquipement', 'Affiliation', 'EvenementInscription', 'DepenseAdmin', 'Communication'] },
    },
    select: { userId: true, entity: true, action: true, description: true, entityId: true, createdAt: true },
  });

  // Encaissement hebdomadaire : 0,75 par semaine, au prorata réel des saisies.
  const semaines = new Map<string, Map<string, number>>();
  for (const a of audits) {
    if (a.entity === 'PaymentVersement' && a.action === 'PAY' && a.userId) {
      const sem = cleSemaineIso(a.createdAt);
      const m = semaines.get(sem) || new Map<string, number>();
      m.set(a.userId, (m.get(a.userId) || 0) + 1);
      semaines.set(sem, m);
    }
  }
  for (const m of semaines.values()) {
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    if (total === 0) continue;
    for (const [userId, n] of m) {
      crediter('ENCAISSEMENT_HEBDO', userId, arrondir(n / total), arrondir((n / total) * valeurDe('ENCAISSEMENT_HEBDO')));
    }
  }

  // Compteurs simples (avec annulations soustraites là où elles existent).
  const compte = new Map<string, number>(); // `${code}|${userId}` → quantité
  const bump = (code: string, userId: string | null, delta = 1) => {
    if (!userId) return;
    const cle = `${code}|${userId}`;
    compte.set(cle, (compte.get(cle) || 0) + delta);
  };
  const inscriptionsCompetition = new Map<string, number>(); // cap 3 / compétition / personne
  const idsInscriptions = audits.filter((a) => a.entity === 'EvenementInscription' && a.action === 'CREATE' && a.entityId).map((a) => a.entityId as string);
  const inscMap = new Map(
    (await prisma.evenementInscription.findMany({ where: { id: { in: idsInscriptions } }, select: { id: true, evenementId: true } }))
      .map((x) => [x.id, x.evenementId])
  );

  for (const a of audits) {
    switch (a.entity) {
      case 'Member':
        if (a.action === 'CREATE') bump('INSCRIPTION', a.userId);
        else if (a.action === 'UPDATE' && (a.description || '').startsWith('Renouvellement')) bump('RENOUVELLEMENT', a.userId);
        break;
      case 'Facture':
        if (a.action === 'CREATE') bump('FACTURES', a.userId);
        break;
      case 'Retention':
        if (a.action === 'CREATE') bump('RETENTION_APPEL', a.userId);
        else if (a.action === 'DELETE') bump('RETENTION_APPEL', a.userId, -1);
        break;
      case 'VenteEquipement':
        if (a.action === 'CREATE') bump('VENTE', a.userId);
        else if (a.action === 'DELETE') bump('VENTE', a.userId, -1);
        break;
      case 'Affiliation':
        if (a.action === 'CREATE') bump('AFFILIATION_ATHLETE', a.userId);
        break;
      case 'EvenementInscription':
        if (a.action === 'CREATE' && a.userId) {
          const evenementId = inscMap.get(a.entityId || '') || `?${a.entityId}`;
          const cle = `${evenementId}|${a.userId}`;
          const deja = inscriptionsCompetition.get(cle) || 0;
          if (deja < 3) { // max 3 par compétition (entente, art. 3.2)
            inscriptionsCompetition.set(cle, deja + 1);
            bump('COMPETITION_INSCRIPTION', a.userId);
          }
        }
        break;
      case 'DepenseAdmin':
        if (a.action === 'CREATE') bump('DEPENSE_SAISIE', a.userId);
        else if (a.action === 'UPDATE' && (a.description || '').startsWith('Remboursé')) bump('REMBOURSEMENT', a.userId);
        break;
      case 'Communication':
        if (a.action === 'CREATE') bump('COMMUNICATION', a.userId);
        break;
    }
  }
  for (const [cle, n] of compte) {
    if (n <= 0) continue;
    const [code, userId] = cle.split('|');
    crediter(code, userId, n, arrondir(n * valeurDe(code)));
  }

  // ---------------------------------------------------------------
  // 3. PROSPECTS : premier contact < 24 h + relances consignées
  //    (fil de suivi signé — max 0,5 / prospect / mois).
  // ---------------------------------------------------------------
  const notesPeriode = await prisma.leadNote.findMany({
    where: { createdAt: { gte: debutJour, lte: finJour }, auteurId: { in: [...adminIds] } },
    select: { leadId: true, auteurId: true, createdAt: true },
  });
  const leadIds = [...new Set(notesPeriode.map((n) => n.leadId))];
  if (leadIds.length > 0) {
    const [leads, toutesNotes] = await Promise.all([
      prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, createdAt: true } }),
      prisma.leadNote.findMany({ where: { leadId: { in: leadIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, leadId: true, auteurId: true, createdAt: true } }),
    ]);
    const creeLe = new Map(leads.map((l) => [l.id, l.createdAt]));
    const premiereNote = new Map<string, { auteurId: string | null; createdAt: Date }>();
    for (const n of toutesNotes) if (!premiereNote.has(n.leadId)) premiereNote.set(n.leadId, n);

    const relancesParMois = new Map<string, number>(); // lead|auteur|AAAA-MM → points de relance
    for (const n of notesPeriode) {
      const premiere = premiereNote.get(n.leadId);
      const estPremiere = premiere && premiere.auteurId === n.auteurId && premiere.createdAt.getTime() === n.createdAt.getTime();
      if (estPremiere) {
        const cree = creeLe.get(n.leadId);
        if (cree && n.createdAt.getTime() - cree.getTime() <= 24 * 3_600_000 && n.auteurId) {
          crediter('PROSPECT_24H', n.auteurId, 1, valeurDe('PROSPECT_24H'));
        }
        continue; // la première note n'est jamais aussi une « relance »
      }
      if (!n.auteurId) continue;
      const mois = jourMontreal(n.createdAt).slice(0, 7);
      const cle = `${n.leadId}|${n.auteurId}|${mois}`;
      const deja = relancesParMois.get(cle) || 0;
      if (deja + valeurDe('PROSPECT_RELANCE') <= 0.5 + 1e-9) { // plafond 0,5 / prospect / mois
        relancesParMois.set(cle, arrondir(deja + valeurDe('PROSPECT_RELANCE')));
        crediter('PROSPECT_RELANCE', n.auteurId, 1, valeurDe('PROSPECT_RELANCE'));
      }
    }
  }

  const totaux: Record<string, number> = {};
  for (const a of associes) totaux[a.id] = 0;
  for (const l of lignes.values()) {
    for (const [userId, e] of Object.entries(l.parUser)) {
      totaux[userId] = arrondir((totaux[userId] || 0) + e.points);
    }
  }

  return { associes, lignes: [...lignes.values()], totaux };
}
