import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { sendEmail, htmlCourriel } from '../lib/mailer';

const router = Router();

// Les données du lead partent telles quelles dans un courriel HTML : on échappe
// pour qu'un prospect (ou un robot) ne puisse pas injecter de balises.
const echapper = (v?: string | null) =>
  (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STATUTS = ['NEW', 'CONTACTED', 'CONVERTED', 'LOST'] as const;

const createSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  sport: z.string().optional().nullable(),
  requestType: z.enum(['ESSAI', 'RAPPEL', 'TARIFS', 'AUTRE']).optional().default('ESSAI'),
  website: z.string().optional().nullable(), // honeypot anti-spam
  // Attribution marketing (landing pages, pubs Meta) — bornée pour éviter les abus.
  source: z.string().max(120).optional().nullable(),
  utmSource: z.string().max(120).optional().nullable(),
  utmCampaign: z.string().max(120).optional().nullable(),
  utmContent: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

// POST /api/leads — création publique (formulaire « essai/rappel » du site)
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = createSchema.parse(req.body);
    if (data.website && data.website.trim() !== '') {
      return sendSuccess(res, { ok: true }); // honeypot : on ignore silencieusement
    }
    let lead;
    try {
      lead = await prisma.lead.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender || null,
          phone: data.phone || null,
          email: data.email || null,
          sport: data.sport || 'AUTRE',
          requestType: data.requestType,
          status: 'NEW',
          source: data.source || null,
          utmSource: data.utmSource || null,
          utmCampaign: data.utmCampaign || null,
          utmContent: data.utmContent || null,
          note: data.note || null,
        },
      });
    } catch (erreurBase) {
      // Base indisponible (Neon en panne, migration en cours…) : le contact ne
      // doit JAMAIS être perdu. On l'envoie par courriel à l'admin pour saisie
      // manuelle, et le site reçoit un succès : le visiteur a fait sa part.
      // Si le courriel échoue aussi, on retombe dans le catch global (500) et
      // le site affiche son message de repli avec le téléphone.
      const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
      if (!notif) throw erreurBase;
      const detail = erreurBase instanceof Error ? erreurBase.message : String(erreurBase);
      await sendEmail({
        to: notif,
        subject: `⚠️ Lead reçu mais base indisponible — ${data.firstName} ${data.lastName}`,
        html: htmlCourriel(`
          <p>Le formulaire du site a reçu une demande, mais la base de données
          n'a pas répondu. <strong>À saisir manuellement dans Prospects</strong> :</p>
          <ul>
            <li>Nom : ${echapper(data.firstName)} ${echapper(data.lastName)}</li>
            <li>Téléphone : ${echapper(data.phone) || '—'}</li>
            <li>Courriel : ${echapper(data.email) || '—'}</li>
            <li>Sport : ${echapper(data.sport) || 'AUTRE'} · Demande : ${echapper(data.requestType)}</li>
            <li>Provenance : ${echapper(data.source) || '—'}${data.utmContent ? ' · Pub : ' + echapper(data.utmContent) : ''}</li>
            ${data.note ? `<li>Note : ${echapper(data.note)}</li>` : ''}
          </ul>
          <p>Erreur technique : ${echapper(detail)}</p>`,
          { salutation: null }),
      });
      console.error('Lead sauvé par courriel (base indisponible) :', detail);
      return sendSuccess(res, { ok: true, secours: true }, 201);
    }
    return sendSuccess(res, { ok: true, id: lead.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur lors de l'enregistrement de la demande", 500);
  }
});

// GET /api/leads?status=NEW — liste (ADMIN)
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const status = req.query.status as string | undefined;
    const where = status && (STATUTS as readonly string[]).includes(status) ? { status } : {};
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { notes: true } },
        // Seulement la dernière : le badge affiche un compte, la modale le fil.
        notes: { orderBy: { createdAt: 'desc' }, take: 1, select: { texte: true, auteurNom: true, createdAt: true } },
      },
    });
    return sendSuccess(res, leads.map((l) => ({
      ...l,
      nbNotes: l._count.notes,
      derniereNote: l.notes[0] ?? null,
      _count: undefined,
      notes: undefined,
    })));
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des prospects', 500);
  }
});

const updateSchema = z.object({
  status: z.enum(STATUTS).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  sport: z.string().optional().nullable(),
  requestType: z.enum(['ESSAI', 'RAPPEL', 'TARIFS', 'AUTRE']).optional(),
});

// PUT /api/leads/:id — mise à jour (statut, infos) (ADMIN)
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = updateSchema.parse(req.body);
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data });
    if (data.status) {
      logAudit(req, {
        action: 'UPDATE', entity: 'Lead', entityId: lead.id,
        description: `Prospect ${lead.firstName} ${lead.lastName} → ${data.status}`,
      });
    }
    return sendSuccess(res, lead);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la mise à jour du prospect', 500);
  }
});

// POST /api/leads/:id/convert — convertir un prospect en membre EN_ATTENTE (ADMIN)
router.post('/:id/convert', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return sendError(res, 'Prospect introuvable', 404);

    // Si un membre du même nom existe déjà (ex. fiche d'inscription en ligne
    // déjà soumise), on ne crée PAS de doublon : on marque simplement converti.
    // MAIS un simple homonyme (même nom, coordonnées différentes) est une autre
    // personne : avant, son inscription était silencieusement fusionnée avec le
    // dossier de l'autre — perdue. On ne fusionne que si les coordonnées
    // concordent (ou si le prospect n'a aucune coordonnée à comparer).
    const memesNoms = await prisma.member.findMany({
      where: {
        firstName: { equals: lead.firstName, mode: 'insensitive' },
        lastName: { equals: lead.lastName, mode: 'insensitive' },
      },
    });
    const chiffres = (t?: string | null) => (t || '').replace(/\D/g, '');
    const emailLead = (lead.email || '').toLowerCase().trim();
    const telLead = chiffres(lead.phone);
    const coordonneesConcordent = (m: any) => {
      const emailsMembre = [m.email, m.parentEmail]
        .filter(Boolean)
        .flatMap((e: string) => e.split(/[;,]/))
        .map((e: string) => e.toLowerCase().trim());
      if (emailLead && emailsMembre.includes(emailLead)) return true;
      if (telLead.length >= 7 && [chiffres(m.phone), chiffres(m.parentPhone)].includes(telLead)) return true;
      return false;
    };
    const sansCoordonnees = !emailLead && telLead.length < 7;
    const deja = memesNoms.find((m) => coordonneesConcordent(m)) || (sansCoordonnees ? memesNoms[0] : undefined);

    if (deja) {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED', membreId: deja.id } });
      logAudit(req, { action: 'UPDATE', entity: 'Lead', entityId: lead.id, description: `Prospect ${lead.firstName} ${lead.lastName} lié au dossier membre existant` });
      return sendSuccess(res, { membreId: deja.id, dejaExistant: true });
    }
    // Homonyme détecté mais coordonnées différentes : on crée un nouveau
    // dossier et on le signale dans les notes pour lever toute ambiguïté.
    const noteHomonyme = memesNoms.length > 0
      ? ` ⚠️ Attention : un autre membre porte le même nom (coordonnées différentes).`
      : '';

    const membre = await prisma.member.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        gender: lead.gender,
        phone: lead.phone,
        email: lead.email,
        status: 'EN_ATTENTE',
        notes: [
          `Prospect converti — intérêt initial : ${lead.sport}.${noteHomonyme}`,
          lead.source ? `Source : ${lead.source}` : null,
          lead.utmContent ? `Pub : ${lead.utmContent}` : null,
          lead.note ? `Note : ${lead.note}` : null,
        ].filter(Boolean).join('\n'),
      },
    });

    await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED', membreId: membre.id } });

    logAudit(req, { action: 'CREATE', entity: 'Member', entityId: membre.id, description: `Conversion du prospect ${lead.firstName} ${lead.lastName}` });

    return sendSuccess(res, { membreId: membre.id }, 201);
  } catch (error) {
    return sendError(res, 'Erreur lors de la conversion', 500);
  }
});

// ---------- Fil de suivi (notes internes) ----------
// En ajout seulement : deux administrateurs qui se partagent les relances
// doivent voir l'historique complet, pas la dernière version écrasée.

// GET /api/leads/:id/notes
router.get('/:id/notes', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const notes = await prisma.leadNote.findMany({
      where: { leadId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    return sendSuccess(res, notes);
  } catch {
    return sendError(res, 'Erreur lors du chargement du suivi', 500);
  }
});

// POST /api/leads/:id/notes
router.post('/:id/notes', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { texte } = z.object({ texte: z.string().min(1, 'Note vide').max(2000) }).parse(req.body);
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!lead) return sendError(res, 'Prospect introuvable', 404);

    const u = req.user;
    const note = await prisma.leadNote.create({
      data: {
        leadId: lead.id,
        texte: texte.trim(),
        auteurId: u?.userId ?? null,
        auteurNom: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.userId : null,
      },
    });
    return sendSuccess(res, note, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Note invalide', 400, error.issues);
    return sendError(res, "Erreur lors de l'ajout de la note", 500);
  }
});

// DELETE /api/leads/notes/:noteId — corriger une saisie, pas réécrire l'histoire.
router.delete('/notes/:noteId', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const note = await prisma.leadNote.delete({ where: { id: req.params.noteId } });
    // Le fil est « ajout seulement » : toute suppression laisse une trace.
    logAudit(req, {
      action: 'DELETE', entity: 'LeadNote', entityId: note.id,
      description: `Note de suivi supprimée (prospect ${note.leadId}) : « ${note.texte.slice(0, 80)} »`,
    });
    return sendSuccess(res, { ok: true });
  } catch {
    return sendError(res, 'Erreur lors de la suppression', 500);
  }
});

// DELETE /api/leads/:id (ADMIN)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const lead = await prisma.lead.delete({ where: { id: req.params.id } });
    logAudit(req, {
      action: 'DELETE', entity: 'Lead', entityId: lead.id,
      description: `Prospect supprimé : ${lead.firstName} ${lead.lastName}${lead.email ? ` (${lead.email})` : ''}`,
    });
    return sendSuccess(res, { ok: true });
  } catch (error) {
    return sendError(res, 'Erreur lors de la suppression du prospect', 500);
  }
});

export default router;
