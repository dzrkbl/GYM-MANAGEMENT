import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const gradeSchema = z.object({
  memberId: z.string(),
  section: z.string(),
  ceinturePrecedente: z.string(),
  ceintureMontante: z.string(),
  date: z.string().transform(str => new Date(str)),
  examinateurId: z.string(),
  note: z.string().optional()
});

// POST /api/grades
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER', 'COACH']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = gradeSchema.parse(req.body);
    
    // Check if member exists in this section
    const memberSection = await prisma.memberSection.findUnique({
      where: {
        memberId_section: {
          memberId: data.memberId,
          section: data.section
        }
      }
    });

    if (!memberSection) {
      return sendError(res, "Le membre n'est pas inscrit dans cette section", 404);
    }

    const { force } = req.body; // option from client to force the jump

    // create transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create grade history
      const grade = await tx.grade.create({
        data: {
          memberId: data.memberId,
          section: data.section,
          ceinturePrecedente: data.ceinturePrecedente,
          ceintureMontante: data.ceintureMontante,
          date: data.date,
          examinateurId: data.examinateurId,
          note: data.note
        }
      });

      // Update belt in MemberSection
      await tx.memberSection.update({
        where: { id: memberSection.id },
        data: { belt: data.ceintureMontante }
      });

      return grade;
    });

    return sendSuccess(res, result, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 'Données invalides', 400, error.issues);
    }
    return sendError(res, 'Erreur de création du passage de grade', 500);
  }
});

// GET /api/grades/membre/:id
router.get('/membre/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
    const grades = await prisma.grade.findMany({
      where: { memberId: id },
      orderBy: { date: 'desc' },
      include: { examinateur: { select: { firstName: true, lastName: true } } }
    });

    return sendSuccess(res, grades);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des grades', 500);
  }
});

// GET /api/grades
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, month } = req.query;
    
    let whereClause: any = {};
    if (section && section !== 'TOUS') whereClause.section = section;
    
    if (month) {
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
      whereClause.date = { gte: startDate, lte: endDate };
    }

    const grades = await prisma.grade.findMany({
      where: whereClause,
      include: {
        member: { select: { firstName: true, lastName: true } },
        examinateur: { select: { firstName: true, lastName: true } }
      },
      orderBy: { date: 'desc' }
    });

    return sendSuccess(res, grades);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des grades', 500);
  }
});

export default router;
