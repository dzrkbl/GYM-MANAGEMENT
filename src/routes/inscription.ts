import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { sendEmail, sendEmailBackground, htmlCourriel, parseDestinataires } from '../lib/mailer';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { REGLEMENT_VERSION } from '../lib/reglement';
import { contenuBienvenue } from '../lib/bienvenue';
import { estKarate } from '../lib/katas';

const router = Router();

// POST /api/inscription/inviter — envoie le lien d'inscription en ligne par
// courriel (ADMIN / gestionnaire). Sert aussi de test de délivrabilité : si la
// personne reçoit l'invitation et complète la fiche, ses rappels passeront.
router.post('/inviter', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = z.object({
      courriel: z.string().email('Adresse courriel invalide'),
      prenom: z.string().optional().nullable(),
      leadId: z.string().optional().nullable(), // si l'invitation part d'un prospect
    }).parse(req.body);

    const appUrl = process.env.APP_URL || '';
    if (!appUrl) {
      return sendError(res, "APP_URL n'est pas configurée : impossible de composer le lien d'inscription.", 500);
    }
    const lien = `${appUrl}/inscription`;

    try {
      await sendEmail({
        to: data.courriel,
        subject: 'Complétez votre inscription — Centre Sportif de Haute-Performance',
        html: htmlCourriel(`
          <p>${data.prenom ? `Bonjour ${data.prenom},` : 'Bonjour,'}</p>
          <p>Merci de votre intérêt pour le Centre Sportif de Haute-Performance !
          Pour compléter l'inscription, remplissez la fiche en ligne (environ 5 minutes) :</p>
          <p style="text-align:center;margin:22px 0;">
            <a href="${lien}" style="background:#1a1a2e;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">
              Remplir la fiche d'inscription
            </a>
          </p>
          <p>La fiche comprend le règlement intérieur à lire et à accepter, ainsi que les
          autorisations habituelles (photos/vidéos, urgence médicale, communications).</p>
          <p><strong>Petit conseil :</strong> si ce courriel est arrivé dans vos
          indésirables, marquez-le « Fiable / Pas un spam » — c'est à cette adresse que
          vous recevrez les reçus et les rappels de paiement.</p>
        `, { salutation: null }),
      });
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e);
      logAudit(req, { action: 'ERREUR', entity: 'Courriel', description: `Invitation d'inscription → ${data.courriel} : ${message}` });
      return sendError(res, `Échec de l'envoi de l'invitation : ${message}`, 502);
    }

    // Si l'invitation part d'un prospect, marquer le suivi effectué.
    if (data.leadId) {
      await prisma.lead.updateMany({
        where: { id: data.leadId, status: 'NEW' },
        data: { status: 'CONTACTED' },
      }).catch(() => { /* statut non critique */ });
    }

    logAudit(req, { action: 'CREATE', entity: 'Courriel', description: `Invitation d'inscription envoyée → ${data.courriel}` });
    return sendSuccess(res, { ok: true, courriel: data.courriel });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/inscription/inviter:', error);
    return sendError(res, "Erreur lors de l'envoi de l'invitation", 500);
  }
});

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
  refereParNom: z.string().optional().nullable(),
  provenance: z.string().optional().nullable(),
  reglementVersion: z.string(),
  reglementSignataire: z.string().min(1, 'La signature (nom complet) est requise'),
  accepte: z.literal(true),
  // Autorisations obligatoires (booléens libres ici : le refus du droit à
  // l'image reçoit un message dédié dans le handler, pas une erreur Zod).
  consentPhoto: z.boolean().optional().default(false),
  consentUrgence: z.boolean().optional().default(false),
  consentCommunications: z.boolean().optional().default(false),
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

    // Droit à l'image : le centre ne peut pas filmer sélectivement. Un refus
    // ne passe pas par le formulaire — il se discute en personne à l'accueil.
    if (!data.consentPhoto) {
      return sendError(
        res,
        "L'inscription en ligne requiert l'autorisation photos/vidéos (fins promotionnelles du centre). " +
        'Si vous préférez la refuser, présentez-vous à l\'accueil : nous compléterons votre inscription en personne.',
        409
      );
    }
    if (!data.consentUrgence) {
      return sendError(res, "L'autorisation de recours aux services médicaux d'urgence est requise.", 409);
    }
    if (!data.consentCommunications) {
      return sendError(res, "L'acceptation des communications par courriel (rappels et reçus) est requise.", 409);
    }

    const destinataire = data.parentEmail || data.email;
    if (!destinataire) {
      return sendError(res, 'Un courriel (parent ou athlète) est requis.', 400);
    }

    // Anti-doublon : si le même nom existe déjà…
    // - EN_ATTENTE (ex. prospect converti manuellement) → on COMPLÈTE ce dossier
    //   avec la fiche au lieu d'en créer un deuxième ;
    // - ACTIF/INACTIF → on refuse poliment (dossier déjà existant).
    const existant = await prisma.member.findFirst({
      where: {
        firstName: { equals: data.firstName.trim(), mode: 'insensitive' },
        lastName: { equals: data.lastName.trim(), mode: 'insensitive' },
      },
      include: { sections: true },
    });
    if (existant && existant.status !== 'EN_ATTENTE') {
      return sendError(
        res,
        `Un dossier existe déjà au nom de ${data.firstName} ${data.lastName}. ` +
        'Contactez-nous à l\'accueil ou par courriel pour le mettre à jour.',
        409
      );
    }

    const donneesFiche = {
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
        consentPhoto: true,
        consentUrgence: true,
        consentCommunications: true,
        provenance: data.provenance || null,
        refereParNom: data.refereParNom || null,
    };

    const membre = existant
      ? await prisma.member.update({
          where: { id: existant.id },
          data: {
            ...donneesFiche,
            notes: [existant.notes, 'Fiche d\'inscription en ligne reçue.'].filter(Boolean).join(' — '),
            sections: data.section && !existant.sections.some((s) => s.section === data.section)
              ? { create: [{ section: data.section, belt: 'Blanche' }] }
              : undefined,
          },
        })
      : await prisma.member.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            ...donneesFiche,
            sections: data.section
              ? { create: [{ section: data.section, belt: 'Blanche' }] }
              : undefined,
          },
        });

    const nomComplet = `${data.firstName} ${data.lastName}`;

    // Le prospect correspondant est automatiquement marqué CONVERTI, horodaté
    // « fiche reçue » et relié au dossier membre (badge vert dans Prospects).
    // Correspondance élargie, calculée en mémoire (la table des prospects
    // ouverts est petite) : la comparaison stricte en base ratait les cas
    // réels — fiche au nom de l'enfant vs prospect au nom du parent, courriel
    // d'invitation différent du courriel saisi, numéros formatés autrement.
    try {
      const courrielsFiche = new Set(
        [...parseDestinataires(data.parentEmail), ...parseDestinataires(data.email)]
          .map((e) => e.toLowerCase())
      );
      const chiffres = (t?: string | null) => (t || '').replace(/\D/g, '');
      const telsFiche = [chiffres(data.parentPhone), chiffres(data.phone)].filter((t) => t.length >= 7);
      const nomAthlete = `${data.firstName.trim()} ${data.lastName.trim()}`.toLowerCase();

      const ouverts = await prisma.lead.findMany({ where: { status: { in: ['NEW', 'CONTACTED'] } } });
      const correspondants = ouverts.filter((l) => {
        const emailLead = (l.email || '').toLowerCase().trim();
        if (emailLead && courrielsFiche.has(emailLead)) return true;
        const telLead = chiffres(l.phone);
        if (telLead.length >= 7 && telsFiche.includes(telLead)) return true;
        return `${l.firstName.trim()} ${l.lastName.trim()}`.toLowerCase() === nomAthlete;
      });
      if (correspondants.length > 0) {
        await prisma.lead.updateMany({
          where: { id: { in: correspondants.map((l) => l.id) } },
          data: { status: 'CONVERTED', ficheRecueAt: new Date(), membreId: membre.id },
        });
      }
    } catch { /* non critique : la fiche est enregistrée quoi qu'il arrive */ }

    // Courriel de bienvenue au parent/athlète (non bloquant).
    sendEmailBackground({
      to: destinataire,
      subject: 'Inscription reçue — CSHP',
      html: htmlCourriel(contenuBienvenue({
        nom: nomComplet,
        karate: estKarate(data.section),
        note: `Votre demande d'inscription est en attente de validation et sera confirmée une fois le premier paiement complété. Vous avez accepté le règlement intérieur (version ${REGLEMENT_VERSION}) le ${new Date().toLocaleDateString('fr-CA')}.`,
      })),
    }, `Courriel de bienvenue (inscription en ligne de ${nomComplet})`);

    // Notification à l'administration (si configurée).
    if (process.env.INSCRIPTION_NOTIF_EMAIL) {
      sendEmailBackground({
        to: process.env.INSCRIPTION_NOTIF_EMAIL,
        subject: `Nouvelle inscription en ligne — ${nomComplet}`,
        html: `
          <p>Nouvelle inscription en ligne (statut EN ATTENTE) :</p>
          <ul>
            <li>Athlète : ${nomComplet}</li>
            <li>Section : ${data.section || '—'}</li>
            <li>Parent : ${data.parentName || '—'} (${data.parentEmail || data.email || '—'}, ${data.parentPhone || data.phone || '—'})</li>
            <li>Provenance : ${data.provenance || '—'}${data.refereParNom ? ' · Référé par : ' + data.refereParNom : ''}</li>
          </ul>
          <p>À valider dans la section Membres.</p>
        `,
      }, `Notification admin (inscription en ligne de ${nomComplet})`);
    }

    return sendSuccess(res, { ok: true, membreId: membre.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/inscription:', error);
    return sendError(res, "Erreur lors de l'inscription", 500);
  }
});

export default router;
