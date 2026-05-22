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
      const versements = await prisma.paymentVersement.findMany({
        where: {
          OR: [
            { datePaiement: { gte: startDate, lte: endDate } },
            { datePrevue: { gte: startDate, lte: endDate } }
          ]
        },
        include: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              sections: { select: { section: true } },
              groupe: true
            }
          }
        },
        orderBy: { datePrevue: 'asc' }
      });

      const today = new Date();
      // Mapper les versements pour simuler l'ancien format attendu par l'export CSV ou le front
      const mapped = versements.map(v => {
        let computedStatus: string;
        if (v.datePaiement) {
          computedStatus = 'PAYÉ';
        } else if (v.datePrevue && v.datePrevue < today) {
          computedStatus = 'EN_RETARD';
        } else {
          computedStatus = 'EN_ATTENTE';
        }

        return {
          id: v.id,
          amount: v.montant,
          status: computedStatus,
          dueDate: v.datePrevue,
          paidDate: v.datePaiement,
          member: v.member,
          subscription: {
            section: v.member.sections?.[0]?.section || v.member.groupe || 'INCONNU'
          }
        };
      });

      return sendSuccess(res, mapped);
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
    const today = new Date();

    // 1. Revenus : Encaisse, En Attente, En Retard (ceux dû ou payé ou en attente) depuis PaymentVersement
    const versements = await prisma.paymentVersement.findMany({
      where: {
        OR: [
          { datePaiement: { gte: startDate, lte: endDate } },
          { datePrevue: { gte: startDate, lte: endDate } }
        ]
      },
      include: {
        member: {
          select: {
            firstName: true,
            lastName: true,
            sections: { select: { section: true } },
            groupe: true
          }
        }
      }
    });

    let encaisse = 0, enAttente = 0, enRetard = 0;
    const sectionTotals: Record<string, number> = {};

    versements.forEach(v => {
      const s = v.member.sections?.[0]?.section || v.member.groupe || 'INCONNU';
      const isPaid = !!v.datePaiement;
      const isLate = !v.datePaiement && v.datePrevue && v.datePrevue < today;

      if (isPaid) {
        encaisse += v.montant;
        sectionTotals[s] = (sectionTotals[s] || 0) + v.montant;
      } else if (isLate) {
        enRetard += v.montant;
      } else {
        enAttente += v.montant;
      }
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

    const sectionsPres = [
      'KARATE_GR1', 'KARATE_GR2', 'KARATE_GR3',
      'JUDO_GR1', 'JUDO_GR2', 'JUDO_GR3',
      'NINJAS_GR1', 'NINJAS_GR2', 'NINJAS_GR3',
    ];
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

    // 4. Liste détaillée des retards cumulatifs (sans filtre de date)
    const allLatePayments = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: today }
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sections: { select: { section: true } },
            groupe: true
          }
        }
      },
      orderBy: { datePrevue: 'asc' }
    });

    const retardsMapped = allLatePayments.map(v => {
      const dateString = v.datePrevue.toISOString();
      return {
        id: v.id,
        membreId: v.membreId,
        membreNom: `${v.member.lastName || ''} ${v.member.firstName || ''}`.trim(),
        section: v.member.sections?.[0]?.section || v.member.groupe || '',
        montant: v.montant,
        date: dateString,
        joursRetard: Math.max(0, Math.floor((Date.now() - v.datePrevue.getTime()) / 86400000))
      };
    });

    const totalRetard = retardsMapped.reduce((sum, r) => sum + r.montant, 0);
    const nombreDossiersRetard = retardsMapped.length;

    return sendSuccess(res, {
      revenus: { encaisse, enAttente, enRetard, total },
      parSection,
      presences: presencesList,
      masseSalariale: { montant: masseSalarialeMontant, pourcentageDuRevenu },
      retards: retardsMapped,
      totalRetard,
      nombreDossiersRetard
    });

  } catch (error) {
    return sendError(res, 'Erreur de génération du rapport', 500);
  }
});

export default router;
