import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const DAYS_VALID = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const JOURS_MAP = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']; // Date.getDay() : 0=Sunday, 1=Monday...

// GET /api/cours — liste tous les cours actifs (ou filtré par date)
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { date } = req.query;
    const whereClause: any = { actif: true };

    if (date) {
      const d = new Date((date as string) + 'T12:00:00');
      if (isNaN(d.getTime())) {
        return sendError(res, 'Format de date invalide', 400);
      }
      const dayName = JOURS_MAP[d.getDay()];
      whereClause.jours = { has: dayName };
    }

    const courses = await prisma.course.findMany({
      where: whereClause,
      include: {
        coach: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    return sendSuccess(res, courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    return sendError(res, 'Erreur de récupération des cours', 500);
  }
});

// POST /api/cours — créer un cours récurrent (ADMIN seulement)
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, startTime, endTime, coachId, jours } = req.body;

    if (!section || !startTime || !endTime) {
      return sendError(res, 'Section, heure de début et heure de fin sont requises', 400);
    }

    if (!Array.isArray(jours) || jours.length === 0) {
      return sendError(res, 'Au moins un jour de répétition est requis', 400);
    }

    // Validation des jours
    const invalidDays = jours.filter((j: string) => !DAYS_VALID.includes(j.toUpperCase()));
    if (invalidDays.length > 0) {
      return sendError(res, `Jours invalides : ${invalidDays.join(', ')}. Doit être parmi : LUN, MAR, MER, JEU, VEN, SAM, DIM`, 400);
    }

    const newCourse = await prisma.course.create({
      data: {
        section,
        startTime,
        endTime,
        coachId: coachId || null,
        jours: jours.map((j: string) => j.toUpperCase()),
        actif: true
      },
      include: {
        coach: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return sendSuccess(res, newCourse, 201);
  } catch (error) {
    console.error('Error creating course:', error);
    return sendError(res, 'Erreur lors de la création du cours', 500);
  }
});

// PATCH /api/cours/:id — modifier un cours (ADMIN seulement)
router.patch('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, startTime, endTime, coachId, jours, actif } = req.body;

    const dataToUpdate: any = {};
    if (section !== undefined) dataToUpdate.section = section;
    if (startTime !== undefined) dataToUpdate.startTime = startTime;
    if (endTime !== undefined) dataToUpdate.endTime = endTime;
    if (coachId !== undefined) dataToUpdate.coachId = coachId || null;
    if (actif !== undefined) dataToUpdate.actif = actif;

    if (jours !== undefined) {
      if (!Array.isArray(jours) || jours.length === 0) {
        return sendError(res, 'Au moins un jour de répétition est requis', 400);
      }
      const invalidDays = jours.filter((j: string) => !DAYS_VALID.includes(j.toUpperCase()));
      if (invalidDays.length > 0) {
        return sendError(res, `Jours invalides : ${invalidDays.join(', ')}.`, 400);
      }
      dataToUpdate.jours = jours.map((j: string) => j.toUpperCase());
    }

    const updatedCourse = await prisma.course.update({
      where: { id: req.params.id },
      data: dataToUpdate,
      include: {
        coach: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return sendSuccess(res, updatedCourse);
  } catch (error) {
    console.error('Error updating course:', error);
    return sendError(res, 'Erreur lors de la mise à jour du cours', 500);
  }
});

// DELETE /api/cours/:id — archiver un cours (actif = false)
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.course.update({
      where: { id: req.params.id },
      data: { actif: false }
    });
    return sendSuccess(res, { message: 'Cours archivé' });
  } catch (error) {
    console.error('Error archiving course:', error);
    return sendError(res, 'Erreur lors de l’archivage du cours', 500);
  }
});

export default router;
