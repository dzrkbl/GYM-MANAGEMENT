import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Catégories de la page Audit → clause de filtrage EN BASE. Avant, la page
// chargeait les 200 dernières entrées et filtrait côté client : dès que le
// journal dépassait 200 lignes, « Pointages » semblait vide alors que tout
// est conservé en base (rien n'est jamais purgé du journal).
// « TEMPS » (Gestion du temps) regroupe les entités du système de points :
// tâches, plan mensuel, barème — toute modification y est signalée.
const CATEGORIES: Record<string, any> = {
  POINTAGE: { entity: 'Pointage' },
  MEMBRE: { entity: 'Member' },
  PAIEMENT: { entity: 'PaymentVersement' },
  ERREUR: { action: 'ERREUR' },
  TEMPS: { entity: { in: ['Bareme', 'PlanTache', 'TacheRecurrente', 'AcompteAssocie'] } },
  // « COURS » : l'horaire, les capacités, les paramètres de rentabilité et les
  // créneaux loués — tout ce qui pilote la page Heures & cours.
  COURS: { entity: { in: ['Course', 'ParametreRentabilite', 'CreneauLoue', 'RevenuLocation'] } },
};

// GET /api/audit?categorie=&avant=&limit= — journal des modifications (ADMIN).
// TOUT le journal est conservé en base ; cette route sert des tranches :
// `avant` (ISO) = curseur vers le plus ancien, `total` = compte réel du filtre.
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 500);
    const categorie = String(req.query.categorie || 'TOUS').toUpperCase();
    const where: any = { ...(CATEGORIES[categorie] || {}) };

    const avant = req.query.avant ? new Date(String(req.query.avant)) : null;
    if (avant && !isNaN(avant.getTime())) where.createdAt = { lt: avant };

    const [entrees, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      // Compte SANS le curseur : le vrai total du filtre, pour afficher
      // « 200 affichées sur N » et prouver que rien ne disparaît.
      prisma.auditLog.count({ where: { ...(CATEGORIES[categorie] || {}) } }),
    ]);

    return sendSuccess(res, { entrees, total });
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération du journal', 500);
  }
});

export default router;
