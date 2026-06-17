import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

// Génère un mot de passe temporaire alphanumérique (à communiquer au coach, puis à changer).
function generateTempPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 12);
}

const coachSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').optional(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional().nullable(),
  role: z.enum(['COACH', 'SECTION_MANAGER']),
  section: z.string().optional().nullable(),
  remuneration: z.number().optional().default(0),
  actif: z.boolean().optional().default(true),
  dateDebut: z.string().optional(),
  note: z.string().optional().nullable()
});

// POST /api/coachs
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = coachSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return sendError(res, 'Cet email est déjà utilisé', 400);

    // Si l'admin ne fournit pas de mot de passe, on en génère un temporaire qu'on retourne une seule fois.
    const plainPassword = data.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    const coach = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        section: data.section,
        remuneration: data.remuneration,
        actif: data.actif,
        dateDebut: data.dateDebut ? new Date(data.dateDebut) : new Date(),
        note: data.note
      }
    });

    const { passwordHash: _, ...coachWithoutPass } = coach;
    return sendSuccess(res, {
      ...coachWithoutPass,
      // Mot de passe temporaire renvoyé uniquement quand l'admin n'en a pas fourni.
      ...(data.password ? {} : { tempPassword: plainPassword }),
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création du coach', 500);
  }
});

// GET /api/coachs
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const coachs = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'COACH', 'SECTION_MANAGER'] } },
      orderBy: { lastName: 'asc' }
    });
    
    return sendSuccess(res, coachs.map(c => {
      const { passwordHash, ...rest } = c;
      return rest;
    }));
  } catch (error) {
    return sendError(res, 'Erreur de récupération des coachs', 500);
  }
});

// GET /api/coachs/:id
router.get('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const coach = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!coach) return sendError(res, 'Coach introuvable', 404);
    
    const { passwordHash, ...rest } = coach;
    return sendSuccess(res, rest);
  } catch (error) {
    return sendError(res, 'Erreur de récupération du coach', 500);
  }
});

// PUT /api/coachs/:id
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const updateSchema = coachSchema.partial();
    const data = updateSchema.parse(req.body);

    let updateData: any = { ...data };
    if (data.dateDebut) updateData.dateDebut = new Date(data.dateDebut);
    // Ne jamais stocker le mot de passe en clair : on le hache et on retire le champ brut.
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    delete updateData.password;

    const coach = await prisma.user.update({
      where: { id },
      data: updateData
    });
    
    const { passwordHash, ...rest } = coach;
    return sendSuccess(res, rest);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/coachs/:id (Soft delete)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    // soft delete
    await prisma.user.update({
      where: { id },
      data: { actif: false }
    });

    return sendSuccess(res, { message: 'Coach désactivé' });
  } catch (error) {
    return sendError(res, 'Erreur lors de la désactivation', 500);
  }
});

export default router;
