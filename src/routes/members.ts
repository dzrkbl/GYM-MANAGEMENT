import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { calculerMontantFinal, calculerFinContrat, TARIFS } from '../lib/tarifs';

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
  notes: z.string().optional().nullable(),
  currentBelt: z.string().optional().nullable(),
  status: z.enum(['ACTIF', 'INACTIF', 'EN_ATTENTE']).default('ACTIF'),

  poids: z.number().optional().nullable(),
  groupe: z.string().optional().nullable(),
  dateInscription: z.string().optional().nullable(),
  finContrat: z.string().optional().nullable(),
  plan: z.enum(['MENSUEL', 'TRIMESTRIEL', 'ANNUEL']).optional().nullable(),
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
        ...(status ? { status: status as string } : { status: { not: 'INACTIVE' } }),
        ...(filterSection ? { sections: { some: { section: filterSection } } } : {}),
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
    let finContrat = data.finContrat ? new Date(data.finContrat) : null;
    let montantFinal = data.montantFinal;

    if (data.plan) {
      prixBase = (TARIFS[data.plan].base !== null && TARIFS[data.plan].base !== undefined) 
        ? TARIFS[data.plan].base 
        : (data.prixBase ?? 0);
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

    const newMember = await prisma.member.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dob ? new Date(data.dob) : null,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        parentName: data.parentName,
        parentPhone: data.parentPhone,
        notes: data.notes,
        currentBelt: data.currentBelt,
        status: data.status,
        sections: {
          create: data.sections.map((sec: any) => 
            typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
          )
        },
        poids: data.poids,
        groupe: data.groupe,
        dateInscription: data.dateInscription ? new Date(data.dateInscription) : null,
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
            datePrevue: new Date(v.datePrevue),
            datePaiement: v.datePaiement ? new Date(v.datePaiement) : null,
            methodePaiement: v.methodePaiement,
            note: v.note,
          }))
        } : undefined
      },
      include: { sections: true, versements: true }
    });

    return sendSuccess(res, newMember, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création', 500);
  }
});

// GET /api/membres/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: { sections: true, subscriptions: true, payments: true, versements: { orderBy: { numeroVersement: 'asc' } } }
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
        updateData.prixBase = (TARIFS[plan].base !== null && TARIFS[plan].base !== undefined) 
          ? TARIFS[plan].base 
          : (data.prixBase !== undefined ? data.prixBase : existingMember.prixBase ?? 0);
        
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
      updateData.dateOfBirth = new Date(data.dob);
    } else if (data.dob === null) {
      updateData.dateOfBirth = null;
    }
    delete updateData.dob;

    if (data.dateInscription) {
      updateData.dateInscription = new Date(data.dateInscription);
    } else if (data.dateInscription === null) {
      updateData.dateInscription = null;
    }

    if (data.finContrat) {
      updateData.finContrat = new Date(data.finContrat);
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
      updateData.versements = {
        deleteMany: {},
        create: data.versements.map((v: any) => ({
          numeroVersement: v.numeroVersement,
          montant: v.montant,
          datePrevue: new Date(v.datePrevue),
          datePaiement: v.datePaiement ? new Date(v.datePaiement) : null,
          methodePaiement: v.methodePaiement,
          note: v.note,
        }))
      };
    }

    const updatedMember = await prisma.member.update({
      where: { id: req.params.id },
      data: updateData,
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } }
    });

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

    await prisma.paymentVersement.deleteMany({ where: { membreId: id } });
    const created = await prisma.member.update({
      where: { id },
      data: {
        versements: {
          create: versementsData.map(v => ({
            numeroVersement: v.numeroVersement,
            montant: v.montant,
            datePrevue: new Date(v.datePrevue),
            datePaiement: v.datePaiement ? new Date(v.datePaiement) : null,
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

// DELETE /api/membres/:id (soft delete)
router.delete('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: { status: 'INACTIF' }
    });

    return sendSuccess(res, member);
  } catch (error) {
    return sendError(res, 'Erreur lors de la désactivation', 500);
  }
});

export default router;
