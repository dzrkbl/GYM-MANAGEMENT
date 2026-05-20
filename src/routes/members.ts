import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const memberSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Email ou format invalide').optional().nullable(),
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
      include: { sections: true },
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
        }
      },
      include: { sections: true }
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
      include: { sections: true, subscriptions: true, payments: true }
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
    
    const updateData: any = { ...data };
    if (data.dob) updateData.dateOfBirth = new Date(data.dob);
    delete updateData.dob;
    
    if (data.sections) {
      updateData.sections = {
        deleteMany: {},
        create: data.sections.map((sec: any) => 
          typeof sec === 'string' ? { section: sec } : { section: sec.section, belt: sec.belt || "Blanche" }
        )
      };
    }

    const updatedMember = await prisma.member.update({
      where: { id: req.params.id },
      data: updateData,
      include: { sections: true }
    });

    return sendSuccess(res, updatedMember);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de modification', 500);
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
