import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/rapports/export-csv
router.get('/export-csv', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { from, to, type } = req.query;
    if (!from || !to || !type) return sendError(res, 'Paramètres manquants', 400);

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);
    endDate.setHours(23, 59, 59, 999);

    if (type === 'PAIEMENTS') {
      const payments = await prisma.payment.findMany({
        where: {
          OR: [
            { paidDate: { gte: startDate, lte: endDate }, status: 'PAYÉ' },
            { dueDate: { gte: startDate, lte: endDate }, status: { in: ['EN_ATTENTE', 'EN_RETARD'] } }
          ]
        },
        include: {
          member: { select: { firstName: true, lastName: true } },
          subscription: { select: { section: true } }
        },
        orderBy: { dueDate: 'asc' }
      });
      return sendSuccess(res, payments);
    } 
    
    if (type === 'PRESENCES') {
      const attendances = await prisma.attendance.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: {
          member: { select: { firstName: true, lastName: true } },
          course: { select: { section: true } }
        },
        orderBy: { date: 'asc' }
      });
      return sendSuccess(res, attendances);
    }
  } catch (error) {
    return sendError(res, 'Erreur lors de l\'export', 500);
  }
});
router.get('/financier', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { from, to } = req.query;
    
    if (!from || !to) {
      return sendError(res, 'Les dates from et to sont requises', 400);
    }
    
    const startDate = new Date(from as string);
    const endDate = new Date(to as string);
    endDate.setHours(23, 59, 59, 999);

    // 1. Revenus : Encaisse, En Attente, En Retard (ceux dû ou payé ou en attente)
    const payments = await prisma.payment.findMany({
      where: {
        OR: [
          {
            paidDate: { gte: startDate, lte: endDate },
            status: 'PAYÉ'
          },
          {
            dueDate: { gte: startDate, lte: endDate },
            status: { in: ['EN_ATTENTE', 'EN_RETARD'] }
          }
        ]
      },
      include: {
        member: { select: { firstName: true, lastName: true } },
        subscription: { select: { section: true } }
      }
    });

    let encaisse = 0, enAttente = 0, enRetard = 0;
    const sectionTotals: Record<string, number> = {};

    payments.forEach(p => {
      if (p.status === 'PAYÉ') {
        encaisse += p.amount;
        const s = p.subscription?.section || 'INCONNU';
        sectionTotals[s] = (sectionTotals[s] || 0) + p.amount;
      }
      else if (p.status === 'EN_ATTENTE') enAttente += p.amount;
      else if (p.status === 'EN_RETARD') enRetard += p.amount;
    });

    const total = encaisse + enAttente + enRetard;
    
    const parSection = Object.entries(sectionTotals).map(([section, montant]) => ({
      section,
      montant,
      pourcentage: total > 0 ? (montant / total) * 100 : 0
    }));

    // 2. Présences
    const attendances = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      include: {
        course: { select: { section: true } }
      }
    });

    const sectionsPres = ['KARATE', 'JUDO', 'U8', 'TAEKWONDO', 'KICKBOXING'];
    const presencesList = sectionsPres.map(sec => {
      const secAtts = attendances.filter(a => a.course?.section === sec);
      const totalAtts = secAtts.length;
      const presents = secAtts.filter(a => a.status === 'PRESENT').length;
      return {
        section: sec,
        taux: totalAtts > 0 ? (presents / totalAtts) * 100 : 0,
        presents,
        total: totalAtts
      };
    }).filter(p => p.total > 0);

    // 3. Masse Salariale
    const activeCoachs = await prisma.user.findMany({
      where: { role: { in: ['COACH', 'SECTION_MANAGER'] }, actif: true }
    });
    const masseSalarialeMontant = activeCoachs.reduce((sum, c) => sum + (c.remuneration || 0), 0);
    const pourcentageDuRevenu = encaisse > 0 ? (masseSalarialeMontant / encaisse) * 100 : 0;

    // 4. Liste détaillée des retards
    const retards = payments.filter(p => p.status === 'EN_RETARD').map(p => ({
      memberId: p.memberId,
      nom: `${p.member.firstName} ${p.member.lastName}`,
      montant: p.amount,
      section: p.subscription?.section,
      depuisLe: p.dueDate
    }));

    return sendSuccess(res, {
      revenus: { encaisse, enAttente, enRetard, total },
      parSection,
      presences: presencesList,
      masseSalariale: { montant: masseSalarialeMontant, pourcentageDuRevenu },
      retards
    });

  } catch (error) {
    return sendError(res, 'Erreur de génération du rapport', 500);
  }
});

export default router;
