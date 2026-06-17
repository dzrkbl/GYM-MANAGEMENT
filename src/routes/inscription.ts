import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { sendEmail, htmlCourriel } from '../lib/mailer';
import { REGLEMENT_VERSION } from '../lib/reglement';
import { contenuBienvenue } from '../lib/bienvenue';
import { estKarate } from '../lib/katas';

const router = Router();

// GET /api/inscription/sections — liste publique des sections actives (pour le formulaire)
router.get('/sections', async (_req: Request, res: Response): Promise<any> => {
  try {
    const sections = await prisma.section.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' },
      select: { code: true, label: true },
    });
    return sendSuccess(res, sections);
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des sections', 500);
  }
});

const inscriptionSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  parentName: z.string().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  parentEmail: z.string().optional().nullable(),
  adresse: z.string().optional().nullable(),
  codePostal: z.string().optional().nullable(),
  ville: z.string().optional().nullable(),
  problemeSante: z.boolean().optional().default(false),
  noteSante: z.string().optional().nullable(),
  urgenceNom: z.string().optional().nullable(),
  urgenceLien: z.string().optional().nullable(),
  urgenceTel: z.string().optional().nullable(),
  section: z.string().optional().nullable(),
  reglementVersion: z.string(),
  reglementSignataire: z.string().min(1, 'La signature (nom complet) est requise'),
  accepte: z.literal(true),
  // Honeypot anti-spam : doit rester vide (rempli seulement par des robots).
  website: z.string().optional().nullable(),
});

// POST /api/inscription — inscription en ligne publique (crée un membre EN_ATTENTE)
router.post('/', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = inscriptionSchema.parse(req.body);

    // Honeypot : on fait comme si tout allait bien, sans rien créer.
    if (data.website && data.website.trim() !== '') {
      return sendSuccess(res, { ok: true });
    }

    // Le règlement affiché doit correspondre à la version courante.
    if (data.reglementVersion !== REGLEMENT_VERSION) {
      return sendError(res, 'Le règlement a été mis à jour. Veuillez recharger la page et réessayer.', 409);
    }

    const destinataire = data.parentEmail || data.email;
    if (!destinataire) {
      return sendError(res, 'Un courriel (parent ou athlète) est requis.', 400);
    }

    const membre = await prisma.member.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dob ? new Date(data.dob + 'T12:00:00') : null,
        gender: data.gender || null,
        phone: data.phone || null,
        email: data.email || null,
        parentName: data.parentName || null,
        parentPhone: data.parentPhone || null,
        parentEmail: data.parentEmail || null,
        adresse: data.adresse || null,
        codePostal: data.codePostal || null,
        ville: data.ville || null,
        problemeSante: !!data.problemeSante,
        noteSante: data.noteSante || null,
        urgenceNom: data.urgenceNom || null,
        urgenceLien: data.urgenceLien || null,
        urgenceTel: data.urgenceTel || null,
        status: 'EN_ATTENTE', // reste en attente jusqu'à validation + premier paiement
        reglementVersion: REGLEMENT_VERSION,
        reglementAccepteAt: new Date(),
        reglementSignataire: data.reglementSignataire,
        sections: data.section
          ? { create: [{ section: data.section, belt: 'Blanche' }] }
          : undefined,
      },
    });

    const nomComplet = `${data.firstName} ${data.lastName}`;

    // Courriel de bienvenue au parent/athlète (non bloquant).
    sendEmail({
      to: destinataire,
      subject: 'Inscription reçue — CSHP',
      html: htmlCourriel(contenuBienvenue({
        nom: nomComplet,
        karate: estKarate(data.section),
        note: `Votre demande d'inscription est en attente de validation et sera confirmée une fois le premier paiement complété. Vous avez accepté le règlement intérieur (version ${REGLEMENT_VERSION}) le ${new Date().toLocaleDateString('fr-CA')}.`,
      })),
    }).catch((e) => console.error('Erreur courriel bienvenue:', e));

    // Notification à l'administration (si configurée).
    if (process.env.INSCRIPTION_NOTIF_EMAIL) {
      sendEmail({
        to: process.env.INSCRIPTION_NOTIF_EMAIL,
        subject: `Nouvelle inscription en ligne — ${nomComplet}`,
        html: `
          <p>Nouvelle inscription en ligne (statut EN ATTENTE) :</p>
          <ul>
            <li>Athlète : ${nomComplet}</li>
            <li>Section : ${data.section || '—'}</li>
            <li>Parent : ${data.parentName || '—'} (${data.parentEmail || data.email || '—'}, ${data.parentPhone || data.phone || '—'})</li>
          </ul>
          <p>À valider dans la section Membres.</p>
        `,
      }).catch((e) => console.error('Erreur courriel notif admin:', e));
    }

    return sendSuccess(res, { ok: true, membreId: membre.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/inscription:', error);
    return sendError(res, "Erreur lors de l'inscription", 500);
  }
});

export default router;
