import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate } from '../middleware/auth';
import { porteeStaff, clauseSectionsPortee } from '../lib/portee';
import { logAudit } from '../lib/audit';

const router = Router();

// Fenêtre d'analyse : au-delà, un membre n'est plus « en train de décrocher »,
// il est parti (l'admin le passe INACTIF à la main).
const FENETRE_JOURS = 120;
const TYPE_LOG = 'RETENTION_APPEL';

const jourDebut = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoJour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/retention — la liste d'appels du jour.
 *
 * Principe : un enfant cesse de venir plusieurs semaines AVANT que le parent
 * résilie. On repère donc les membres actifs qui ont manqué au moins deux
 * séances depuis leur dernière présence.
 *
 * Point important : on ne compte que les séances **réellement tenues**, une
 * séance étant une date où au moins un membre du cours a été pointé. Cela
 * neutralise automatiquement les fermetures (vacances, jours fériés, cours
 * annulés) sans avoir à tenir un calendrier de fermetures : si personne n'a
 * été pointé ce jour-là, le cours n'a pas eu lieu, donc personne ne l'a manqué.
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const portee = await porteeStaff(req.user!);
    const clause = clauseSectionsPortee(portee);
    const depuis = jourDebut(new Date(Date.now() - FENETRE_JOURS * 86_400_000));

    const [membres, cours, presences] = await Promise.all([
      prisma.member.findMany({
        where: { status: 'ACTIF', ...(clause ? { sections: { some: clause } } : {}) },
        include: { sections: true },
      }),
      prisma.course.findMany({ where: { actif: true }, select: { id: true, section: true } }),
      prisma.attendance.findMany({
        where: { date: { gte: depuis } },
        select: { memberId: true, courseId: true, date: true, status: true },
      }),
    ]);
    if (membres.length === 0) return sendSuccess(res, { membres: [], jamaisPointes: 0 });

    // Cours par code de section.
    const coursParSection = new Map<string, string[]>();
    for (const c of cours) {
      const liste = coursParSection.get(c.section) || [];
      liste.push(c.id);
      coursParSection.set(c.section, liste);
    }

    // Séances réellement tenues, par cours (dates distinctes où quelqu'un a été pointé).
    const seancesTenues = new Map<string, Set<string>>();
    // Index des pointages d'un membre : "courseId|jour" -> statut.
    const pointageMembre = new Map<string, string>();
    // Dernière présence effective par membre.
    const dernierePresence = new Map<string, Date>();

    for (const p of presences) {
      const jour = isoJour(p.date);
      if (!seancesTenues.has(p.courseId)) seancesTenues.set(p.courseId, new Set());
      seancesTenues.get(p.courseId)!.add(jour);
      pointageMembre.set(`${p.memberId}|${p.courseId}|${jour}`, p.status);
      if (p.status === 'PRESENT') {
        const actuelle = dernierePresence.get(p.memberId);
        if (!actuelle || p.date > actuelle) dernierePresence.set(p.memberId, p.date);
      }
    }

    // Appels déjà passés pour l'épisode d'absence en cours.
    const contacts = await prisma.reminderLog.findMany({
      where: { type: TYPE_LOG, memberId: { in: membres.map((m) => m.id) } },
      select: { refKey: true, sentAt: true },
    });
    const contactParRef = new Map(contacts.map((c) => [c.refKey, c.sentAt]));

    const maintenant = jourDebut(new Date());
    let jamaisPointes = 0;
    const resultat: any[] = [];

    for (const m of membres) {
      const derniere = dernierePresence.get(m.id);
      // Jamais pointé : on ne sait pas s'il venait, donc pas d'alerte de
      // décrochage (les membres importés n'ont aucun historique de présence).
      if (!derniere) { jamaisPointes++; continue; }

      const codes = m.sections.map((s) => s.section);
      const idsCours = codes.flatMap((code) => coursParSection.get(code) || []);
      if (idsCours.length === 0) continue; // aucun cours actif pour ses groupes

      const jourDerniere = isoJour(derniere);
      let manquees = 0;
      for (const courseId of idsCours) {
        for (const jour of seancesTenues.get(courseId) || []) {
          if (jour <= jourDerniere) continue; // séance antérieure à sa dernière venue
          // Une absence EXCUSÉE est déjà justifiée : le parent a prévenu.
          if (pointageMembre.get(`${m.id}|${courseId}|${jour}`) === 'EXCUSED') continue;
          manquees++;
        }
      }
      if (manquees < 2) continue;

      const refKey = `${m.id}:${jourDerniere}`;
      const contacteAt = contactParRef.get(refKey) || null;
      const niveau = manquees >= 5 ? 'DECROCHE' : manquees >= 3 ? 'URGENT' : 'ALERTE';

      resultat.push({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        sections: codes,
        phone: m.phone,
        parentName: m.parentName,
        parentPhone: m.parentPhone,
        email: m.email,
        parentEmail: m.parentEmail,
        dernierePresence: derniere,
        joursDepuis: Math.floor((maintenant.getTime() - jourDebut(derniere).getTime()) / 86_400_000),
        seancesManquees: manquees,
        niveau,
        contacteAt,
      });
    }

    // Ordre d'appel : d'abord les non contactés dans la fenêtre où le membre
    // se récupère encore (2 à 4 séances), puis les décrochés, puis ceux déjà
    // appelés pour cet épisode.
    const priorite = (r: any) => (r.contacteAt ? 2 : r.seancesManquees <= 4 ? 0 : 1);
    resultat.sort((a, b) => priorite(a) - priorite(b) || b.seancesManquees - a.seancesManquees);

    return sendSuccess(res, { membres: resultat, jamaisPointes });
  } catch (error) {
    console.error('Erreur GET /api/retention:', error);
    return sendError(res, 'Erreur lors du calcul de la liste de rétention', 500);
  }
});

// POST /api/retention/:id/contact — marquer « appelé » pour l'épisode en cours.
// La clé inclut la date de dernière présence : si le membre revient puis
// décroche à nouveau, un nouvel épisode démarre et il réapparaît dans la liste.
router.post('/:id/contact', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const membre = await prisma.member.findUnique({
      where: { id: req.params.id },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!membre) return sendError(res, 'Membre introuvable', 404);

    const derniere = await prisma.attendance.findFirst({
      where: { memberId: membre.id, status: 'PRESENT' },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!derniere) return sendError(res, 'Aucune présence enregistrée pour ce membre.', 400);

    const refKey = `${membre.id}:${isoJour(derniere.date)}`;
    await prisma.reminderLog.upsert({
      where: { type_refKey: { type: TYPE_LOG, refKey } },
      update: { sentAt: new Date() },
      create: { type: TYPE_LOG, memberId: membre.id, refKey },
    });
    logAudit(req, {
      action: 'CREATE', entity: 'Retention', entityId: membre.id,
      description: `Appel de rétention noté — ${membre.firstName} ${membre.lastName}`,
    });
    return sendSuccess(res, { ok: true });
  } catch (error) {
    return sendError(res, "Erreur lors de l'enregistrement de l'appel", 500);
  }
});

// DELETE /api/retention/:id/contact — annuler la marque (clic par erreur).
router.delete('/:id/contact', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const derniere = await prisma.attendance.findFirst({
      where: { memberId: req.params.id, status: 'PRESENT' },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!derniere) return sendSuccess(res, { ok: true });
    await prisma.reminderLog.deleteMany({
      where: { type: TYPE_LOG, refKey: `${req.params.id}:${isoJour(derniere.date)}` },
    });
    return sendSuccess(res, { ok: true });
  } catch (error) {
    return sendError(res, "Erreur lors de l'annulation", 500);
  }
});

export default router;
