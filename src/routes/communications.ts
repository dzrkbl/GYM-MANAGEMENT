import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { sendEmail, htmlCourriel, parseDestinataires } from '../lib/mailer';
import { logAudit } from '../lib/audit';

const router = Router();

const schema = z.object({
  section: z.string().optional().nullable(), // code de section, ou 'TOUS'/vide
  sujet: z.string().min(1, 'Sujet requis'),
  message: z.string().min(1, 'Message requis'),
  inclureInactifs: z.boolean().optional().default(false),
});

// POST /api/communications — envoi d'un courriel groupé aux membres (ADMIN)
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = schema.parse(req.body);

    const where: any = {};
    where.status = data.inclureInactifs ? { in: ['ACTIF', 'INACTIF'] } : 'ACTIF';
    if (data.section && data.section !== 'TOUS') {
      where.sections = { some: { section: data.section } };
    }

    const membres = await prisma.member.findMany({
      where,
      select: { email: true, parentEmail: true },
    });

    // Destinataires uniques (parent en priorité), en séparant les courriels multiples
    // (familles séparées) et sans doublon.
    const set = new Set<string>();
    for (const m of membres) {
      for (const e of parseDestinataires(m.parentEmail || m.email)) set.add(e);
    }
    const destinataires = Array.from(set);

    if (destinataires.length === 0) {
      return sendError(res, 'Aucun destinataire avec une adresse courriel pour ce filtre.', 400);
    }

    const html = htmlCourriel(`<div style="white-space:pre-line">${data.message}</div>`);

    const resultats = await Promise.allSettled(
      destinataires.map((to) => sendEmail({ to, subject: data.sujet, html }))
    );
    const envoyes = resultats.filter((r) => r.status === 'fulfilled').length;
    const echecs = resultats.length - envoyes;

    logAudit(req, {
      action: 'CREATE',
      entity: 'Communication',
      description: `Courriel groupé « ${data.sujet} » → ${envoyes} destinataire(s)${data.section && data.section !== 'TOUS' ? ' (' + data.section + ')' : ''}`,
    });

    return sendSuccess(res, { destinataires: destinataires.length, envoyes, echecs });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/communications:', error);
    return sendError(res, "Erreur lors de l'envoi groupé", 500);
  }
});

export default router;
