import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { getLoyerPourAnnee } from '../lib/finances';

const router = Router();

// GET /api/depense-configs — données financières → ADMIN
router.get('/', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  try {
    const configs = await prisma.depenseConfig.findMany();
    return sendSuccess(res, configs);
  } catch (error) {
    console.error('Error in GET /api/depense-configs:', error);
    return sendError(res, 'Erreur lors de la récupération des configurations de charges', 500);
  }
});

// GET /api/depense-configs/loyer/:annee
router.get('/loyer/:annee', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const annee = parseInt(req.params.annee, 10);
    if (isNaN(annee)) return sendError(res, 'Année invalide', 400);
    const montant = await getLoyerPourAnnee(annee);
    const override = await prisma.depense.findFirst({ where: { configCode: 'LOYER', annee, isOverride: true } });
    return sendSuccess(res, { annee, montant, isOverride: !!override });
  } catch (error) {
    console.error('Error in GET /api/depense-configs/loyer/:annee:', error);
    return sendError(res, 'Erreur lors du calcul du loyer', 500);
  }
});

// PUT /api/depense-configs/:id — modifier le taux ou le montant de base
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { montantBase, anneeBase, tauxHaussePct, label } = req.body;
    const config = await prisma.depenseConfig.update({
      where: { id: req.params.id },
      data: {
        montantBase: montantBase !== undefined ? parseFloat(montantBase) : undefined,
        anneeBase: anneeBase !== undefined ? parseInt(anneeBase, 10) : undefined,
        tauxHaussePct: tauxHaussePct !== undefined ? parseFloat(tauxHaussePct) : undefined,
        label
      }
    });
    return sendSuccess(res, config);
  } catch (error) {
    console.error('Error in PUT /api/depense-configs/:id:', error);
    return sendError(res, 'Erreur lors de la mise à jour de la configuration de charge', 500);
  }
});

// POST /api/depense-configs/loyer/override — override manuel pour une année précise
router.post('/loyer/override', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { annee, montant } = req.body;
    if (!annee || montant === undefined) {
      return sendError(res, 'annee et montant requis', 400);
    }
    const y = parseInt(annee, 10);
    const amt = parseFloat(montant);
    if (isNaN(y)) return sendError(res, 'Année invalide', 400);
    if (isNaN(amt)) return sendError(res, 'Montant invalide', 400);

    // Supprimer l'override existant si présent
    await prisma.depense.deleteMany({ where: { configCode: 'LOYER', annee: y, isOverride: true } });
    const override = await prisma.depense.create({
      data: {
        label: 'Loyer (override manuel)',
        montant: amt,
        mois: null,
        annee: y,
        categorie: 'FIXE',
        isOverride: true,
        configCode: 'LOYER'
      }
    });
    return sendSuccess(res, override, 201);
  } catch (error) {
    console.error('Error in POST /api/depense-configs/loyer/override:', error);
    return sendError(res, 'Erreur lors de l’override du loyer', 500);
  }
});

// DELETE /api/depense-configs/loyer/override/:annee — supprimer override, revenir à l'auto
router.delete('/loyer/override/:annee', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const annee = parseInt(req.params.annee, 10);
    if (isNaN(annee)) return sendError(res, 'Année invalide', 400);
    await prisma.depense.deleteMany({ where: { configCode: 'LOYER', annee, isOverride: true } });
    return sendSuccess(res, { message: 'Override supprimé, calcul automatique restauré' });
  } catch (error) {
    console.error('Error in DELETE /api/depense-configs/loyer/override/:annee:', error);
    return sendError(res, 'Erreur lors de la suppression de l’override', 500);
  }
});

export default router;
