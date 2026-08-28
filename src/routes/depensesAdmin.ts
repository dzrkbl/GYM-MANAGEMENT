import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { dateAMidi } from '../lib/tarifs';
import { z } from 'zod';

// Dépenses payées de leur POCHE par les administrateurs pour le club :
// facture photographiée (OCR côté client, champs corrigeables), suivi de
// remboursement, « qui a payé quoi ». Au remboursement, la dépense peut être
// versée aux charges du Module financier (Depense ponctuelle du mois) —
// JAMAIS avant : l'argent ne sort du club qu'au remboursement.

const router = Router();

// ~1,8 Mo de base64 ≈ photo JPEG ~1,3 Mo — déjà compressée côté client.
const TAILLE_MAX_IMAGE = 1_800_000;

const depenseAdminSchema = z.object({
  fournisseur: z.string().max(120).optional().nullable(),
  dateFacture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)'),
  sousTotal: z.number().min(0).optional().nullable(),
  tps: z.number().min(0).optional().nullable(),
  tvq: z.number().min(0).optional().nullable(),
  total: z.number().positive('Le total doit être positif').max(100_000),
  categorie: z.enum(['MATERIEL', 'ENTRETIEN', 'ADMINISTRATIF', 'EVENEMENT', 'AUTRE']).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  imageDataUrl: z.string().max(TAILLE_MAX_IMAGE, 'Photo trop lourde — reprenez-la (compression automatique normalement)').optional().nullable(),
  ocrBrut: z.string().max(20_000).optional().nullable(),
});

// GET /api/depenses-admin — tout est visible par tous les ADMIN (« qui a payé
// quoi ») ; les photos ne sont PAS renvoyées dans la liste (trop lourd).
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const depenses = await prisma.depenseAdmin.findMany({
      orderBy: { dateFacture: 'desc' },
      take: 500,
      select: {
        id: true, payeurId: true, payeurNom: true, fournisseur: true, dateFacture: true,
        sousTotal: true, tps: true, tvq: true, total: true, categorie: true, note: true,
        statut: true, rembourseLe: true, rembourseVia: true, depenseId: true, createdAt: true,
        // photos et texte OCR exclus de la liste (lourds) — voir GET /:id/photo
      },
    });
    const avecPhoto = new Set(
      (await prisma.depenseAdmin.findMany({ where: { imageDataUrl: { not: null } }, select: { id: true } })).map((d) => d.id)
    );
    const parPayeur = new Map<string, { payeurNom: string; aRembourser: number; rembourse: number }>();
    for (const d of depenses) {
      const e = parPayeur.get(d.payeurId) || { payeurNom: d.payeurNom, aRembourser: 0, rembourse: 0 };
      if (d.statut === 'REMBOURSE') e.rembourse += d.total;
      else e.aRembourser += d.total;
      parPayeur.set(d.payeurId, e);
    }
    return sendSuccess(res, {
      depenses: depenses.map((d) => ({ ...d, aUnePhoto: avecPhoto.has(d.id) })),
      totaux: [...parPayeur.entries()].map(([payeurId, t]) => ({
        payeurId,
        payeurNom: t.payeurNom,
        aRembourser: Math.round(t.aRembourser * 100) / 100,
        rembourse: Math.round(t.rembourse * 100) / 100,
      })),
    });
  } catch {
    return sendError(res, 'Erreur de récupération des dépenses', 500);
  }
});

// GET /api/depenses-admin/:id/photo — la photo seule, à la demande.
router.get('/:id/photo', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const d = await prisma.depenseAdmin.findUnique({
      where: { id: req.params.id },
      select: { imageDataUrl: true, ocrBrut: true },
    });
    if (!d) return sendError(res, 'Dépense introuvable', 404);
    return sendSuccess(res, { imageDataUrl: d.imageDataUrl, ocrBrut: d.ocrBrut });
  } catch {
    return sendError(res, 'Erreur de récupération de la photo', 500);
  }
});

// POST /api/depenses-admin — la dépense appartient à la session qui l'ajoute.
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = depenseAdminSchema.parse(req.body);
    const u = req.user!;
    const payeurNom = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Admin';
    const depense = await prisma.depenseAdmin.create({
      data: {
        payeurId: u.userId,
        payeurNom,
        fournisseur: data.fournisseur || null,
        dateFacture: dateAMidi(data.dateFacture),
        sousTotal: data.sousTotal ?? null,
        tps: data.tps ?? null,
        tvq: data.tvq ?? null,
        total: data.total,
        categorie: data.categorie || null,
        note: data.note || null,
        imageDataUrl: data.imageDataUrl || null,
        ocrBrut: data.ocrBrut || null,
      },
    });
    logAudit(req, {
      action: 'CREATE',
      entity: 'DepenseAdmin',
      entityId: depense.id,
      description: `Dépense de poche : ${depense.total.toFixed(2)} $ ${depense.fournisseur ? `chez ${depense.fournisseur} ` : ''}payée par ${payeurNom} le ${data.dateFacture}`,
    });
    return sendSuccess(res, depense, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur d'enregistrement de la dépense", 500);
  }
});

// PUT /api/depenses-admin/:id — correction des champs (OCR raté, etc.).
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = depenseAdminSchema.partial().parse(req.body);
    const updateData: any = { ...data };
    if (data.dateFacture) updateData.dateFacture = dateAMidi(data.dateFacture);
    const depense = await prisma.depenseAdmin.update({ where: { id: req.params.id }, data: updateData });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'DepenseAdmin',
      entityId: depense.id,
      description: `Dépense de poche corrigée : ${depense.total.toFixed(2)} $ (${depense.payeurNom})`,
    });
    return sendSuccess(res, depense);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Dépense introuvable', 404);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// PATCH /api/depenses-admin/:id/rembourser — marque remboursé ; option :
// verser la dépense aux charges du Module financier (Depense ponctuelle du
// mois du remboursement, taxable = récupération TPS/TVQ sur la facture).
router.patch('/:id/rembourser', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { via, dateRemboursement, ajouterAuxCharges } = z.object({
      via: z.string().max(30).optional().nullable(),
      dateRemboursement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      ajouterAuxCharges: z.boolean().optional().default(true),
    }).parse(req.body);

    const existante = await prisma.depenseAdmin.findUnique({ where: { id: req.params.id } });
    if (!existante) return sendError(res, 'Dépense introuvable', 404);
    if (existante.statut === 'REMBOURSE') return sendError(res, 'Déjà remboursée', 400);

    const dateISO = dateRemboursement
      || new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
    const [annee, mois] = [Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7))];

    let depenseId: string | null = null;
    if (ajouterAuxCharges) {
      const charge = await prisma.depense.create({
        data: {
          label: `Remboursement ${existante.payeurNom}${existante.fournisseur ? ` — ${existante.fournisseur}` : ''}`,
          montant: existante.total,
          taxable: (existante.tps ?? 0) > 0 || (existante.tvq ?? 0) > 0,
          mois,
          annee,
          categorie: 'AUTRE',
          note: `Dépense de poche du ${existante.dateFacture.toISOString().slice(0, 10)} remboursée le ${dateISO}`,
        },
      });
      depenseId = charge.id;
    }

    const depense = await prisma.depenseAdmin.update({
      where: { id: existante.id },
      data: { statut: 'REMBOURSE', rembourseLe: dateAMidi(dateISO), rembourseVia: via || null, depenseId },
    });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'DepenseAdmin',
      entityId: depense.id,
      description: `Remboursé ${existante.total.toFixed(2)} $ à ${existante.payeurNom}${via ? ` (${via})` : ''}${depenseId ? ' — versé aux charges du mois' : ''}`,
    });
    return sendSuccess(res, depense);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors du remboursement', 500);
  }
});

// PATCH /api/depenses-admin/:id/annuler-remboursement — retire aussi la charge liée.
router.patch('/:id/annuler-remboursement', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const existante = await prisma.depenseAdmin.findUnique({ where: { id: req.params.id } });
    if (!existante) return sendError(res, 'Dépense introuvable', 404);
    if (existante.statut !== 'REMBOURSE') return sendError(res, "Cette dépense n'est pas remboursée", 400);

    if (existante.depenseId) {
      await prisma.depense.deleteMany({ where: { id: existante.depenseId } });
    }
    const depense = await prisma.depenseAdmin.update({
      where: { id: existante.id },
      data: { statut: 'A_REMBOURSER', rembourseLe: null, rembourseVia: null, depenseId: null },
    });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'DepenseAdmin',
      entityId: depense.id,
      description: `Remboursement ANNULÉ : ${existante.total.toFixed(2)} $ (${existante.payeurNom})${existante.depenseId ? ' — charge du Module financier retirée' : ''}`,
    });
    return sendSuccess(res, depense);
  } catch {
    return sendError(res, "Erreur lors de l'annulation", 500);
  }
});

// DELETE /api/depenses-admin/:id — refusé si remboursée ET versée aux charges
// (annuler d'abord le remboursement, pour ne pas laisser une charge orpheline).
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const existante = await prisma.depenseAdmin.findUnique({ where: { id: req.params.id } });
    if (!existante) return sendError(res, 'Dépense introuvable', 404);
    if (existante.statut === 'REMBOURSE' && existante.depenseId) {
      return sendError(res, "Cette dépense est remboursée et versée aux charges — annulez d'abord le remboursement", 400);
    }
    await prisma.depenseAdmin.delete({ where: { id: existante.id } });
    logAudit(req, {
      action: 'DELETE',
      entity: 'DepenseAdmin',
      entityId: existante.id,
      description: `Dépense de poche supprimée : ${existante.total.toFixed(2)} $ (${existante.payeurNom}${existante.fournisseur ? `, ${existante.fournisseur}` : ''})`,
    });
    return sendSuccess(res, { message: 'Dépense supprimée' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

export default router;
