import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { signToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Email Invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      return sendError(res, 'Identifiants invalides', 401);
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      section: user.section,
    });

    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        section: user.section,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur interne du serveur', 500);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, role: true, section: true },
    });

    if (!user) {
      return sendError(res, 'Utilisateur introuvable', 404);
    }

    return sendSuccess(res, user);
  } catch (error) {
    return sendError(res, 'Erreur interne du serveur', 500);
  }
});

export default router;
