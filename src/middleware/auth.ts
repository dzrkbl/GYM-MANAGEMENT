import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';
import { sendError } from '../lib/api-response';
import { prisma } from '../lib/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return sendError(res, 'Non autorisé. Jeton manquant ou invalide.', 401);
    }

    const token = (authHeader.split(' ')[1] ?? '').trim();
    const payload = verifyToken(token);
    
    // Check if user still exists
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return sendError(res, 'Utilisateur introuvable.', 401);
    }
    // Un compte désactivé perd l'accès immédiatement (pas à l'expiration du jeton).
    if (!user.actif) {
      return sendError(res, 'Compte désactivé.', 401);
    }

    // Rôle et section lus depuis la BASE (source de vérité), pas depuis le jeton :
    // un changement de rôle (ex. promotion en administrateur) prend effet à la
    // requête suivante, sans devoir se déconnecter/reconnecter.
    req.user = {
      ...payload,
      role: user.role,
      section: user.section,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    next();
  } catch (error) {
    return sendError(res, 'Jeton invalide ou expiré.', 401);
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 'Accès refusé. Rôle insuffisant.', 403);
    }
    next();
  };
};
