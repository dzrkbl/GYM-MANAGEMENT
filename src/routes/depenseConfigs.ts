import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { getLoyerPourAnnee } from '../lib/finances';

const router = Router();

// GET /api/depense-configs
router.get('/', authenticate, async (_req: Request, res: Response): Promise<any> => {
  try {
    const configs = await prisma.depenseConfig.findMany();
    return res.json({ success: true, data: configs });
  } catch (error) {
    console.error('Error in GET /api/depense-configs:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des configurations de charges' });
  }
});

// GET /api/depense-configs/loyer/:annee
router.get('/loyer/:annee', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const annee = parseInt(req.params.annee, 10);
    const montant = await getLoyerPourAnnee(annee);
    const override = await prisma.depense.findFirst({ where: { configCode: 'LOYER', annee, isOverride: true } });
    return res.json({ success: true, data: { annee, montant, isOverride: !!override } });
  } catch (error) {
    console.error('Error in GET /api/depense-configs/loyer/:annee:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors du calcul du loyer' });
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
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error in PUT /api/depense-configs/:id:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour de la configuration de charge' });
  }
});

// POST /api/depense-configs/loyer/override — override manuel pour une année précise
router.post('/loyer/override', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { annee, montant } = req.body;
    if (!annee || montant === undefined) {
      return res.status(400).json({ success: false, message: 'annee et montant requis' });
    }

    // Supprimer l'override existant si présent
    await prisma.depense.deleteMany({ where: { configCode: 'LOYER', annee: parseInt(annee, 10), isOverride: true } });
    const override = await prisma.depense.create({
      data: {
        label: 'Loyer (override manuel)',
        montant: parseFloat(montant),
        mois: null,
        annee: parseInt(annee, 10),
        categorie: 'FIXE',
        isOverride: true,
        configCode: 'LOYER'
      }
    });
    return res.status(201).json({ success: true, data: override });
  } catch (error) {
    console.error('Error in POST /api/depense-configs/loyer/override:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de l’override du loyer' });
  }
});

// DELETE /api/depense-configs/loyer/override/:annee — supprimer override, revenir à l'auto
router.delete('/loyer/override/:annee', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.depense.deleteMany({ where: { configCode: 'LOYER', annee: parseInt(req.params.annee, 10), isOverride: true } });
    return res.json({ success: true, message: 'Override supprimé, calcul automatique restauré' });
  } catch (error) {
    console.error('Error in DELETE /api/depense-configs/loyer/override/:annee:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression de l’override' });
  }
});

export default router;
