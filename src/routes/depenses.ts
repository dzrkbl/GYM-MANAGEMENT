import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/depenses?annee=2026&mois=5
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { annee, mois, categorie } = req.query;
    const where: any = {};
    if (annee)     where.annee = parseInt(annee as string, 10);
    if (mois)      where.mois  = parseInt(mois as string, 10);
    if (categorie) where.categorie = categorie as any;

    const depenses = await prisma.depense.findMany({ where, orderBy: { label: 'asc' } });
    return res.json({ success: true, data: depenses });
  } catch (error) {
    console.error('Error in GET /api/depenses:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des dépenses' });
  }
});

// POST /api/depenses
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { label, montant, mois, annee, categorie, note, isOverride, configCode } = req.body;
    if (!label || montant === undefined || !annee) {
      return res.status(400).json({ success: false, message: 'label, montant et annee requis' });
    }

    const depense = await prisma.depense.create({
      data: {
        label,
        montant: parseFloat(montant),
        mois: mois ? parseInt(mois, 10) : null,
        annee: parseInt(annee, 10),
        categorie: categorie || 'FIXE',
        note,
        isOverride: !!isOverride,
        configCode
      }
    });
    return res.status(201).json({ success: true, data: depense });
  } catch (error) {
    console.error('Error in POST /api/depenses:', error);
    return res.status(500).json({ success: false, message: 'Erreur de création de dépense' });
  }
});

// PUT /api/depenses/:id
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { label, montant, mois, annee, categorie, note } = req.body;
    const depense = await prisma.depense.update({
      where: { id: req.params.id },
      data: {
        label,
        montant: montant !== undefined ? parseFloat(montant) : undefined,
        mois: mois !== undefined ? (mois ? parseInt(mois, 10) : null) : undefined,
        annee: annee ? parseInt(annee, 10) : undefined,
        categorie,
        note
      }
    });
    return res.json({ success: true, data: depense });
  } catch (error) {
    console.error('Error in PUT /api/depenses:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour de la dépense' });
  }
});

// DELETE /api/depenses/:id
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.depense.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/depenses:', error);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression de la dépense' });
  }
});

export default router;
