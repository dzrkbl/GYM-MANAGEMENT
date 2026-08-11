import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { calculerMontantFinal, calculerFinContrat, dateAMidi, TARIFS } from '../lib/tarifs';
import { sendEmailBackground, htmlCourriel } from '../lib/mailer';
import { contenuBienvenue } from '../lib/bienvenue';
import { estKarate } from '../lib/katas';
import { logAudit } from '../lib/audit';
import { genererFactures } from '../lib/factures';

const router = Router();

const versementInputSchema = z.object({
  id: z.string().optional(),
  numeroVersement: z.number(),
  montant: z.number(),
  datePrevue: z.string(), // YYYY-MM-DD
  datePaiement: z.string().optional().nullable(),
  methodePaiement: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']).optional().nullable(),
  note: z.string().optional().nullable(),
});

const memberSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(), // Allow nullable and don't enforce strict single email validator so multiple separated by semicolon works
  sections: z.array(
    z.union([
      z.string(),
      z.object({ section: z.string(), belt: z.string().optional().nullable() })
    ])
  ).min(1, 'Au moins une section est requise'),
  parentName: z.string().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  // Destinataire prioritaire des rappels et reçus (plusieurs adresses possibles,
  // séparées par « ; »).
  parentEmail: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currentBelt: z.string().optional().nullable(),
  status: z.enum(['ACTIF', 'INACTIF', 'EN_ATTENTE']).default('ACTIF'),

  poids: z.number().optional().nullable(),
  // Début du contrat EN COURS (renouvelé à chaque renouvellement).
  dateInscription: z.string().optional().nullable(),
  // Première inscription au club (ancienneté) — ne bouge pas au renouvellement.
  membreDepuis: z.string().optional().nullable(),
  finContrat: z.string().optional().nullable(),
  plan: z.enum(['TRIMESTRIEL', 'ANNUEL']).optional().nullable(),
  prixBase: z.number().optional().nullable(),
  rabaisFamille: z.boolean().optional().default(false),
  membreFamilleId: z.string().optional().nullable(),
  rabaisCustomPct: z.number().optional().nullable(),
  raisonRabaisCustom: z.string().optional().nullable(),
  montantFinal: z.number().optional().nullable(),

  referePar: z.string().optional().nullable(),
  rabaisReferentPct: z.number().optional().nullable(),
  rabaisReferentApplique: z.boolean().optional().default(false),

  versements: z.array(versementInputSchema).optional(),
});

// GET /api/membres
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, status } = req.query;
    
    // Logic for role-based section filtering:
    // If user is SECTION_MANAGER, force the section filter to their section.
    let filterSection = section as string | undefined;
    if (req.user!.role === 'SECTION_MANAGER') {
      filterSection = req.user!.section as string;
    }

    const members = await prisma.member.findMany({
      where: {
        ...(status ? { status: status as string } : { status: { not: 'INACTIF' } }),
        ...(filterSection ? {
          sections: { some: { section: filterSection } }
        } : {}),
      },
      include: { sections: true, versements: true },
      orderBy: { lastName: 'asc' },
    });

    return sendSuccess(res, members);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des membres', 500);
  }
});

// POST /api/membres
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = memberSchema.parse(req.body);

    let prixBase = data.prixBase;
    let finContrat = data.finContrat ? dateAMidi(data.finContrat) : null;
    let montantFinal = data.montantFinal;

    if (data.plan) {
      prixBase = (data.prixBase !== null && data.prixBase !== undefined && data.prixBase !== 0)
        ? data.prixBase
        : (TARIFS[data.plan]?.base ?? 0);
      if (data.dateInscription) {
        finContrat = calculerFinContrat(new Date(data.dateInscription), data.plan);
      }
      montantFinal = calculerMontantFinal({
        plan: data.plan,
        rabaisFamille: !!data.rabaisFamille,
        rabaisCustomPct: data.rabaisCustomPct,
        prixBase: prixBase,
      });
    }

    const newMember = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dob ? dateAMidi(data.dob) : null,
          gender: data.gender,
          phone: data.phone,
          email: data.email,
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          parentEmail: data.parentEmail,
          notes: data.notes,
          currentBelt: data.currentBelt,
          status: data.status,
          sections: {
            create: data.sections.map((sec: any) => 
              typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
            )
          },
          poids: data.poids,
          dateInscription: data.dateInscription ? dateAMidi(data.dateInscription) : null,
          // À la création, l'ancienneté démarre avec le premier contrat.
          signupDate: data.membreDepuis
            ? dateAMidi(data.membreDepuis)
            : (data.dateInscription ? dateAMidi(data.dateInscription) : undefined),
          finContrat: finContrat,
          plan: data.plan,
          prixBase: prixBase,
          rabaisFamille: data.rabaisFamille,
          membreFamilleId: data.membreFamilleId,
          rabaisCustomPct: data.rabaisCustomPct,
          raisonRabaisCustom: data.raisonRabaisCustom,
          montantFinal: montantFinal,
          referePar: data.referePar,
          rabaisReferentPct: data.rabaisReferentPct,
          rabaisReferentApplique: data.rabaisReferentApplique,
          versements: data.versements ? {
            create: data.versements.map((v: any) => ({
              numeroVersement: v.numeroVersement,
              montant: v.montant,
              datePrevue: dateAMidi(v.datePrevue),
              datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
              methodePaiement: v.methodePaiement,
              note: v.note,
            }))
          } : undefined
        },
        include: { sections: true, versements: true }
      });

      return member;
    });

    // Courriel de bienvenue avec la documentation (non bloquant).
    const dest = newMember.parentEmail || newMember.email;
    if (dest) {
      const karate = newMember.sections?.some((s: any) => estKarate(s.section));
      sendEmailBackground({
        to: dest,
        subject: 'Bienvenue au Centre Sportif de Haute-Performance',
        html: htmlCourriel(contenuBienvenue({ nom: `${newMember.firstName} ${newMember.lastName}`, karate })),
      }, `Courriel de bienvenue (${newMember.firstName} ${newMember.lastName})`);
    }

    logAudit(req, { action: 'CREATE', entity: 'Member', entityId: newMember.id, description: `${newMember.firstName} ${newMember.lastName}` });

    return sendSuccess(res, newMember, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création', 500);
  }
});

// POST /api/membres/factures — factures annuelles par famille.
// Pour les membres cochés : une facture PAR FAMILLE (enfants liés, même
// courriel ou même téléphone de parent), listant tous les montants VERSÉS
// durant l'année civile demandée. Retourne un PDF encodé par famille.
router.post('/factures', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const schema = z.object({
      memberIds: z.array(z.string()).min(1, 'Sélectionnez au moins un membre'),
      annee: z.number().int().min(2020).max(2100),
    });
    const { memberIds, annee } = schema.parse(req.body);

    const factures = await genererFactures(memberIds, annee);
    if (factures.length === 0) return sendError(res, 'Aucun membre trouvé pour cette sélection', 404);

    logAudit(req, {
      action: 'CREATE',
      entity: 'Facture',
      description: `${factures.length} facture(s) ${annee} — ${factures.map((f) => f.membres.join(' + ')).join(' | ')}`,
    });

    return sendSuccess(res, { annee, factures });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Erreur génération factures:', error);
    return sendError(res, 'Erreur lors de la génération des factures', 500);
  }
});

// GET /api/membres/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } }
    });

    if (!member) return sendError(res, 'Membre introuvable', 404);

    return sendSuccess(res, member);
  } catch (error) {
    return sendError(res, 'Erreur de récupération', 500);
  }
});

// PUT /api/membres/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = memberSchema.partial().parse(req.body);
    
    let existingMember: any = null;
    const needsCalculation = (
      data.plan !== undefined ||
      data.dateInscription !== undefined ||
      data.rabaisFamille !== undefined ||
      data.rabaisCustomPct !== undefined
    );

    if (needsCalculation) {
      existingMember = await prisma.member.findUnique({ where: { id: req.params.id } });
    }

    const updateData: any = { ...data };
    
    if (needsCalculation && existingMember) {
      const plan = data.plan !== undefined ? data.plan : existingMember.plan;
      const dateInscriptionStr = data.dateInscription !== undefined ? data.dateInscription : existingMember.dateInscription;
      const rabaisFamille = data.rabaisFamille !== undefined ? data.rabaisFamille : existingMember.rabaisFamille;
      const rabaisCustomPct = data.rabaisCustomPct !== undefined ? data.rabaisCustomPct : existingMember.rabaisCustomPct;

      if (plan) {
        updateData.prixBase = (data.prixBase !== null && data.prixBase !== undefined && data.prixBase !== 0) 
          ? data.prixBase 
          : (existingMember.prixBase !== null && existingMember.prixBase !== undefined && existingMember.prixBase !== 0
              ? existingMember.prixBase
              : (TARIFS[plan]?.base ?? 0));
        
        if (dateInscriptionStr) {
          updateData.finContrat = calculerFinContrat(new Date(dateInscriptionStr), plan);
        }
        
        updateData.montantFinal = calculerMontantFinal({
          plan,
          rabaisFamille: !!rabaisFamille,
          rabaisCustomPct,
          prixBase: updateData.prixBase,
        });
      }
    }

    if (data.dob) {
      updateData.dateOfBirth = dateAMidi(data.dob);
    } else if (data.dob === null) {
      updateData.dateOfBirth = null;
    }
    delete updateData.dob;

    // « Membre depuis » (ancienneté) : modifiable explicitement, jamais recalculée.
    if (data.membreDepuis) {
      updateData.signupDate = dateAMidi(data.membreDepuis);
    }
    delete updateData.membreDepuis;

    if (data.dateInscription) {
      updateData.dateInscription = dateAMidi(data.dateInscription);
    } else if (data.dateInscription === null) {
      updateData.dateInscription = null;
    }

    if (data.finContrat) {
      updateData.finContrat = dateAMidi(data.finContrat);
    } else if (data.finContrat === null) {
      updateData.finContrat = null;
    }
    
    if (data.sections) {
      updateData.sections = {
        deleteMany: {},
        create: data.sections.map((sec: any) => 
          typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
        )
      };
    }

    if (data.versements) {
      // Remplacement de l'échéancier SANS perdre l'historique système : on
      // rapproche chaque nouveau versement d'un ancien (par id, sinon par
      // numéro) pour conserver son id (les rappels déjà envoyés — journalisés
      // par id de versement — ne repartent pas), son numéro de reçu, la date
      // d'envoi du reçu et l'exonération des frais de retard. Sans cela,
      // chaque modification de membre renvoyait les rappels de retard aux
      // parents et réutilisait des numéros de reçus.
      const anciens = await prisma.paymentVersement.findMany({ where: { membreId: req.params.id } });
      const parId = new Map(anciens.map((a) => [a.id, a]));
      const parNumero = new Map(anciens.map((a) => [a.numeroVersement, a]));
      const idsRepris = new Set<string>();

      updateData.versements = {
        deleteMany: {},
        create: data.versements.map((v: any) => {
          let ancien = (v.id && parId.get(v.id)) || parNumero.get(v.numeroVersement) || null;
          if (ancien && idsRepris.has(ancien.id)) ancien = null; // jamais deux fois le même id
          if (ancien) idsRepris.add(ancien.id);
          return {
            ...(ancien ? { id: ancien.id } : {}),
            numeroVersement: v.numeroVersement,
            montant: v.montant,
            datePrevue: dateAMidi(v.datePrevue),
            datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
            methodePaiement: v.methodePaiement,
            note: v.note,
            exonererFraisRetard: ancien?.exonererFraisRetard ?? false,
            receiptNumber: ancien?.receiptNumber ?? null,
            receiptSentAt: ancien?.receiptSentAt ?? null,
            reminderSentAt: ancien?.reminderSentAt ?? null,
          };
        })
      };
    }

    const updatedMember = await prisma.member.update({
      where: { id: req.params.id },
      data: updateData,
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } }
    });

    logAudit(req, { action: 'UPDATE', entity: 'Member', entityId: updatedMember.id, description: `${updatedMember.firstName} ${updatedMember.lastName}` });

    return sendSuccess(res, updatedMember);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// POST /api/membres/:id/versements
router.post('/:id/versements', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const schema = z.array(z.object({
      numeroVersement: z.number(),
      montant: z.number(),
      datePrevue: z.string(),
      datePaiement: z.string().optional().nullable(),
      methodePaiement: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']).optional().nullable(),
      note: z.string().optional().nullable(),
    }));
    const versementsData = schema.parse(req.body);

    // Supprimer seulement les versements NON payés
    await prisma.paymentVersement.deleteMany({
      where: {
        membreId: id,
        datePaiement: null  // ← protège les versements déjà encaissés
      }
    });
    const created = await prisma.member.update({
      where: { id },
      data: {
        versements: {
          create: versementsData.map(v => ({
            numeroVersement: v.numeroVersement,
            montant: v.montant,
            datePrevue: dateAMidi(v.datePrevue),
            datePaiement: v.datePaiement ? dateAMidi(v.datePaiement) : null,
            methodePaiement: v.methodePaiement,
            note: v.note,
          }))
        }
      },
      include: { versements: true }
    });

    return sendSuccess(res, created.versements);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de mise à jour des versements', 500);
  }
});

// PATCH /api/membres/:id/statut — changement rapide de statut, SANS passer par le
// formulaire complet (qui exige un échéancier équilibré : bloquant pour rendre
// inactif un membre parti).
router.patch('/:id/statut', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIF', 'INACTIF', 'EN_ATTENTE']) }).parse(req.body);

    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: { status },
    });

    logAudit(req, {
      action: 'UPDATE',
      entity: 'Member',
      entityId: member.id,
      description: `Statut de ${member.firstName} ${member.lastName} → ${status}`,
    });

    return sendSuccess(res, member);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Statut invalide', 400, error.issues);
    return sendError(res, 'Erreur de changement de statut', 500);
  }
});

// DELETE /api/membres/:id — désactivation (défaut) ou suppression DÉFINITIVE
// (?definitif=1, ADMIN) pour les dossiers de test/doublons. Refusée si le membre
// a des paiements encaissés (on ne détruit jamais un historique financier).
router.delete('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    if (req.query.definitif === '1') {
      if (req.user!.role !== 'ADMIN') {
        return sendError(res, 'Suppression définitive réservée à l\'ADMIN.', 403);
      }
      const cible = await prisma.member.findUnique({
        where: { id: req.params.id },
        include: { versements: true },
      });
      if (!cible) return sendError(res, 'Membre introuvable', 404);
      if (cible.versements.some((v) => v.datePaiement)) {
        return sendError(res, 'Ce membre a des paiements encaissés : suppression définitive refusée. Utilisez plutôt le statut Inactif.', 409);
      }
      await prisma.member.delete({ where: { id: cible.id } });
      logAudit(req, { action: 'DELETE', entity: 'Member', entityId: cible.id, description: `SUPPRESSION DÉFINITIVE de ${cible.firstName} ${cible.lastName} (doublon/test)` });
      return sendSuccess(res, { ok: true, supprime: true });
    }

    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: { status: 'INACTIF' }
    });

    logAudit(req, { action: 'DELETE', entity: 'Member', entityId: member.id, description: `Désactivation de ${member.firstName} ${member.lastName}` });

    return sendSuccess(res, member);
  } catch (error) {
    return sendError(res, 'Erreur lors de la désactivation', 500);
  }
});

export default router;
