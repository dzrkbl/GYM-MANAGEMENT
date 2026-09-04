import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { sendEmail, sendEmailsEnMasse, htmlCourriel, parseDestinataires, configCourriel } from '../lib/mailer';
import { logAudit } from '../lib/audit';

const router = Router();

// GET /api/communications/config — état de la configuration courriel (ADMIN)
router.get('/config', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  const cfg = configCourriel();
  return sendSuccess(res, { configure: cfg.provider !== null, provider: cfg.provider, from: cfg.from, details: cfg.details });
});

// POST /api/communications/test — envoie un courriel de test et remonte l'erreur réelle (ADMIN)
router.post('/test', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  const cfg = configCourriel();
  if (!cfg.provider) {
    return sendError(res, `Courriel non configuré : ${cfg.details}`, 400);
  }
  const to = (req.body?.to && String(req.body.to).trim()) || req.user?.email;
  if (!to) return sendError(res, 'Aucune adresse de destination.', 400);
  try {
    await sendEmail({
      to,
      subject: 'Test courriel — CSHP ✅',
      html: htmlCourriel(`<p>La configuration courriel fonctionne (transport : ${cfg.details}).</p>`),
    });
    logAudit(req, { action: 'CREATE', entity: 'Courriel', description: `Test courriel réussi → ${to} (${cfg.details})` });
    return sendSuccess(res, { ok: true, provider: cfg.provider, details: cfg.details, to });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    logAudit(req, { action: 'ERREUR', entity: 'Courriel', description: `Test courriel échoué → ${to} : ${message}` });
    return sendError(res, `Échec de l'envoi (${cfg.details}) : ${message}`, 502);
  }
});

// GET /api/communications/adresses?sections=A,B&statuts=ACTIF,EN_ATTENTE,INACTIF
// TOUTES les adresses des fiches visées (courriel de l'enfant ET du parent,
// adresses multiples séparées, sans doublon) — pour un envoi de MASSE depuis
// la boîte personnelle de l'admin, quand le fournisseur intégré plafonne.
// Rien n'est envoyé ici ; l'extraction est journalisée (renseignements
// personnels sortis de l'app).
router.get('/adresses', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const STATUTS_VALIDES = ['ACTIF', 'EN_ATTENTE', 'INACTIF'];
    const statuts = String(req.query.statuts || '')
      .split(',').map((s) => s.trim().toUpperCase())
      .filter((s) => STATUTS_VALIDES.includes(s));
    const codes = String(req.query.sections || '').split(',').map((s) => s.trim()).filter(Boolean);

    const where: any = { status: { in: statuts.length > 0 ? statuts : STATUTS_VALIDES } };
    if (codes.length > 0) where.sections = { some: { section: { in: codes } } };

    const membres = await prisma.member.findMany({
      where,
      select: { firstName: true, lastName: true, status: true, email: true, parentEmail: true },
      orderBy: { lastName: 'asc' },
    });

    const set = new Set<string>();
    const sansCourriel: string[] = [];
    for (const m of membres) {
      const adresses = [...parseDestinataires(m.email), ...parseDestinataires(m.parentEmail)]
        .map((a) => a.toLowerCase())
        .filter((a) => a.includes('@') && !/\s/.test(a));
      if (adresses.length === 0) sansCourriel.push(`${m.lastName || ''} ${m.firstName || ''}`.trim());
      for (const a of adresses) set.add(a);
    }

    logAudit(req, {
      action: 'CREATE', entity: 'Communication',
      description: `Adresses copiées pour envoi externe : ${set.size} adresse(s) de ${membres.length} fiche(s)${codes.length > 0 ? ` (${codes.join(', ')})` : ' (tous les groupes)'} — statuts ${statuts.length > 0 ? statuts.join('/') : 'tous'}`,
    });

    return sendSuccess(res, {
      adresses: [...set].sort(),
      nbMembres: membres.length,
      nbSansCourriel: sansCourriel.length,
      sansCourriel: sansCourriel.slice(0, 100),
    });
  } catch (error) {
    console.error('Error in GET /api/communications/adresses:', error);
    return sendError(res, 'Erreur lors de la collecte des adresses', 500);
  }
});

const schema = z.object({
  section: z.string().optional().nullable(),            // rétrocompatibilité : un seul code, ou 'TOUS'
  sections: z.array(z.string()).optional().nullable(),  // plusieurs codes de sections à la fois
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
    // Sections visées : tableau `sections` (multi-groupes) prioritaire, sinon
    // l'ancien champ `section` ; vide ou 'TOUS' = tous les membres.
    const codes = (data.sections && data.sections.length > 0
      ? data.sections
      : data.section ? [data.section] : []
    ).filter((c) => c && c !== 'TOUS');
    if (codes.length > 0) {
      where.sections = { some: { section: { in: codes } } };
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

    // Envoi par lots (API batch de Resend) : l'ancien envoi individuel en
    // parallèle dépassait la limite de 2 requêtes/seconde de Resend et tout
    // échouait en 429 au-delà d'une dizaine de destinataires.
    const { envoyes, echecs: echecsDetails } = await sendEmailsEnMasse({
      destinataires,
      subject: data.sujet,
      html,
    });
    const echecs = echecsDetails.length;

    logAudit(req, {
      action: echecs > 0 && envoyes === 0 ? 'ERREUR' : 'CREATE',
      entity: 'Communication',
      description: `Courriel groupé « ${data.sujet} » → ${envoyes} envoyé(s), ${echecs} échec(s)${codes.length > 0 ? ' (' + codes.join(', ') + ')' : ' (tous)'}${echecs > 0 ? ' — ' + echecsDetails[0].erreur : ''}`,
    });

    return sendSuccess(res, {
      destinataires: destinataires.length,
      envoyes,
      echecs,
      erreur: echecs > 0 ? echecsDetails[0].erreur : null,
      echecsDetails: echecsDetails.slice(0, 20),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/communications:', error);
    return sendError(res, "Erreur lors de l'envoi groupé", 500);
  }
});

export default router;
