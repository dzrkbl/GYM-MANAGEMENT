import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/masse-salariale?mois=5&annee=2026
// Retourne le montant saisi pour ce mois, ou null si pas encore saisi
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const mois = parseInt(req.query.mois as string);
    const annee = parseInt(req.query.annee as string);

    if (isNaN(mois) || isNaN(annee)) {
      return sendError(res, 'Mois et année sont requis et doivent être des entiers', 400);
    }

    const item = await prisma.masseSalariale.findUnique({
      where: {
        mois_annee: {
          mois,
          annee
        }
      }
    });

    return sendSuccess(res, item); // Transmet l'objet entier ou null
  } catch (error) {
    console.error('Error fetching masse-salariale:', error);
    return sendError(res, 'Erreur lors de la récupération de la masse salariale', 500);
  }
});

// GET /api/masse-salariale/range?fromMonth=1&fromYear=2026&toMonth=12&toYear=2026
// Récupère toutes les masses salariales dans un intervalle
router.get('/range', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const fromMonth = parseInt(req.query.fromMonth as string) || 1;
    const fromYear = parseInt(req.query.fromYear as string) || 2026;
    const toMonth = parseInt(req.query.toMonth as string) || 12;
    const toYear = parseInt(req.query.toYear as string) || 2026;

    const items = await prisma.masseSalariale.findMany({
      where: {
        OR: [
          {
            annee: { gt: fromYear, lt: toYear }
          },
          {
            annee: fromYear,
            mois: { gte: fromMonth }
          },
          {
            annee: toYear,
            mois: { lte: toMonth }
          }
        ]
      },
      orderBy: [
        { annee: 'asc' },
        { mois: 'asc' }
      ]
    });

    // Cas particulier si fromYear == toYear, on doit filtrer pour éviter de prendre des mois hors limites
    let filtered = items;
    if (fromYear === toYear) {
      filtered = items.filter(it => it.annee === fromYear && it.mois >= fromMonth && it.mois <= toMonth);
    }

    return sendSuccess(res, filtered);
  } catch (error) {
    console.error('Error fetching masse-salariale range:', error);
    return sendError(res, 'Erreur lors de la récupération des masses salariales', 500);
  }
});

// POST /api/masse-salariale
// Body: { mois, annee, montant, note? }
// Upsert (crée ou met à jour)
// ADMIN seulement
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { mois, annee, montant, note } = req.body;

    const m = parseInt(mois);
    const y = parseInt(annee);
    const amt = parseFloat(montant);

    if (isNaN(m) || m < 1 || m > 12) {
      return sendError(res, 'Mois invalide (doit être entre 1 et 12)', 400);
    }
    if (isNaN(y) || y < 2000) {
      return sendError(res, 'Année invalide', 400);
    }
    if (isNaN(amt) || amt < 0) {
      return sendError(res, 'Montant invalide', 400);
    }

    const payload = {
      montant: amt,
      note: note || ''
    };

    const record = await prisma.masseSalariale.upsert({
      where: {
        mois_annee: {
          mois: m,
          annee: y
        }
      },
      update: payload,
      create: {
        mois: m,
        annee: y,
        ...payload
      }
    });

    return sendSuccess(res, record);
  } catch (error) {
    console.error('Error saving masse-salariale:', error);
    return sendError(res, 'Erreur lors de l’enregistrement de la masse salariale', 500);
  }
});

export default router;
