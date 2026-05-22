import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/sections — liste toutes les sections actives
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const sections = await prisma.section.findMany({
      where: { actif: true },
      orderBy: { ordre: 'asc' }
    });
    return sendSuccess(res, sections);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des sections', 500);
  }
});

// POST /api/sections — créer une section (ADMIN seulement)
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { code, label, sport, ordre } = req.body;
    if (!code || !label || !sport) {
      return sendError(res, 'code, label et sport sont requis', 400);
    }
    
    // Vérifier si existant
    const upperCode = code.toUpperCase();
    const existing = await prisma.section.findUnique({
      where: { code: upperCode }
    });

    if (existing) {
      // Si existante mais archivée, on peut la réactiver
      if (!existing.actif) {
        const reactivated = await prisma.section.update({
          where: { code: upperCode },
          data: { label, sport: sport.toUpperCase(), actif: true, ordre: ordre !== undefined ? parseInt(ordre, 10) : 0 }
        });
        return sendSuccess(res, reactivated);
      }
      return sendError(res, 'Une section avec ce code existe déjà', 400);
    }

    const section = await prisma.section.create({
      data: { 
        code: upperCode, 
        label, 
        sport: sport.toUpperCase(),
        ordre: ordre !== undefined ? parseInt(ordre, 10) : 0,
        actif: true
      }
    });
    return sendSuccess(res, section, 201);
  } catch (error) {
    return sendError(res, 'Erreur lors de la création de la section', 500);
  }
});

// PATCH /api/sections/:id — modifier label ou ordre
router.patch('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { label, ordre, actif } = req.body;
    const section = await prisma.section.update({
      where: { id: req.params.id },
      data: { 
        ...(label && { label }), 
        ...(ordre !== undefined && { ordre: parseInt(ordre, 10) }), 
        ...(actif !== undefined && { actif }) 
      }
    });
    return sendSuccess(res, section);
  } catch (error) {
    return sendError(res, 'Erreur lors de la mise à jour de la section', 500);
  }
});

// DELETE /api/sections/:id — archiver (soft delete, actif = false)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.section.update({
      where: { id: req.params.id },
      data: { actif: false }
    });
    return sendSuccess(res, { message: 'Section archivée' });
  } catch (error) {
    return sendError(res, 'Erreur lors de l’archivage de la section', 500);
  }
});

export default router;
