import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const CATEGORIES = ['FIXE', 'VARIABLE', 'SALARIALE', 'AUTRE'] as const;
type Categorie = (typeof CATEGORIES)[number];

function parseCategorie(value: unknown, fallback: Categorie | undefined = 'FIXE'): Categorie | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).toUpperCase();
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Categorie) : fallback;
}

// GET /api/depenses?annee=2026&mois=5 — données financières → ADMIN
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { annee, mois, categorie } = req.query;
    const where: any = {};
    if (annee) {
      const y = parseInt(annee as string, 10);
      if (!isNaN(y)) where.annee = y;
    }
    if (mois) {
      const m = parseInt(mois as string, 10);
      if (!isNaN(m)) where.mois = m;
    }
    if (categorie) {
      const c = parseCategorie(categorie, undefined);
      if (c) where.categorie = c;
    }

    const depenses = await prisma.depense.findMany({ where, orderBy: { label: 'asc' } });
    return sendSuccess(res, depenses);
  } catch (error) {
    console.error('Error in GET /api/depenses:', error);
    return sendError(res, 'Erreur serveur lors de la récupération des dépenses', 500);
  }
});

// POST /api/depenses
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { label, montant, mois, annee, categorie, note, isOverride, configCode } = req.body;
    if (!label || montant === undefined || !annee) {
      return sendError(res, 'label, montant et annee sont requis', 400);
    }
    const amt = parseFloat(montant);
    const y = parseInt(annee, 10);
    if (isNaN(amt)) return sendError(res, 'Montant invalide', 400);
    if (isNaN(y)) return sendError(res, 'Année invalide', 400);

    const depense = await prisma.depense.create({
      data: {
        label,
        montant: amt,
        mois: mois ? parseInt(mois, 10) : null,
        annee: y,
        categorie: parseCategorie(categorie)!,
        note,
        isOverride: !!isOverride,
        configCode
      }
    });
    return sendSuccess(res, depense, 201);
  } catch (error) {
    console.error('Error in POST /api/depenses:', error);
    return sendError(res, 'Erreur de création de dépense', 500);
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
        categorie: categorie !== undefined ? parseCategorie(categorie, undefined) : undefined,
        note
      }
    });
    return sendSuccess(res, depense);
  } catch (error) {
    console.error('Error in PUT /api/depenses:', error);
    return sendError(res, 'Erreur lors de la mise à jour de la dépense', 500);
  }
});

// DELETE /api/depenses/:id
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.depense.delete({ where: { id: req.params.id } });
    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error('Error in DELETE /api/depenses:', error);
    return sendError(res, 'Erreur lors de la suppression de la dépense', 500);
  }
});

export default router;
