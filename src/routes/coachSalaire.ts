import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/coach-salaire — liste coachs actifs
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const coachs = await prisma.coachSalaire.findMany({
      where: { actif: true },
      orderBy: { createdAt: 'asc' }
    });
    return sendSuccess(res, coachs);
  } catch (error) {
    console.error('Error fetching coach salaries:', error);
    return sendError(res, 'Erreur de récupération des salaires des coachs', 500);
  }
});

// POST /api/coach-salaire — créer un coach (ADMIN seulement)
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { nom, montant } = req.body;
    if (!nom || montant === undefined) {
      return sendError(res, 'Nom et montant sont requis', 400);
    }
    const amt = parseFloat(montant);
    if (isNaN(amt) || amt < 0) {
      return sendError(res, 'Montant de salaire invalide', 400);
    }

    const coach = await prisma.coachSalaire.create({
      data: {
        nom,
        montant: amt,
        actif: true
      }
    });
    return sendSuccess(res, coach);
  } catch (error) {
    console.error('Error creating coach salary:', error);
    return sendError(res, 'Erreur de création de salaire coach', 500);
  }
});

// PUT /api/coach-salaire/:id — modifier un coach (ADMIN seulement)
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { nom, montant, actif } = req.body;
    const data: any = {};
    if (nom !== undefined) data.nom = nom;
    if (montant !== undefined) {
      const amt = parseFloat(montant);
      if (isNaN(amt) || amt < 0) {
        return sendError(res, 'Montant de salaire invalide', 400);
      }
      data.montant = amt;
    }
    if (actif !== undefined) data.actif = !!actif;

    const coach = await prisma.coachSalaire.update({
      where: { id: req.params.id },
      data
    });
    return sendSuccess(res, coach);
  } catch (error) {
    console.error('Error updating coach salary:', error);
    return sendError(res, 'Erreur lors de la mise à jour du salaire du coach', 500);
  }
});

// DELETE /api/coach-salaire/:id — archiver un coach (soft delete, ADMIN seulement)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.coachSalaire.update({
      where: { id: req.params.id },
      data: { actif: false }
    });
    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error('Error deleting coach salary:', error);
    return sendError(res, 'Erreur lors de l’archivage du salaire du coach', 500);
  }
});

export default router;
