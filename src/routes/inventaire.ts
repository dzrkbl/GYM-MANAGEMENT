import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../lib/audit';
import { z } from 'zod';

// Inventaire d'équipements : kimonos, ceintures, protections, chandails…
// coutAchat = coût de revient INTERNE (jamais montré aux parents) ;
// prixVente = prix affiché/facturé. Les ventes tracent « qui a acheté quoi »
// mais n'entrent PAS dans les revenus de cotisations (rapports/dashboard) et
// ne s'ajoutent JAMAIS automatiquement à la facture annuelle.

const router = Router();

const CATEGORIES = ['KIMONO', 'GANTS', 'PROTEGE_TIBIAS', 'PROTEGE_DENTS', 'CEINTURE', 'COQUILLE', 'CHANDAIL', 'PANTALON', 'AUTRE'] as const;
const DISCIPLINES = ['KARATE', 'JUDO', 'NINJAS', 'TOUS'] as const;

const articleSchema = z.object({
  nom: z.string().min(1),
  categorie: z.enum(CATEGORIES),
  discipline: z.enum(DISCIPLINES).optional().nullable(),
  taille: z.string().optional().nullable(),
  couleur: z.string().optional().nullable(),
  marque: z.string().optional().nullable(),
  coutAchat: z.number().min(0).optional().nullable(),
  prixVente: z.number().min(0),
  quantite: z.number().int().optional(),
  seuilAlerte: z.number().int().min(0).optional().nullable(),
  actif: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const venteSchema = z.object({
  articleId: z.string().min(1),
  membreId: z.string().optional().nullable(), // null = vente comptoir sans dossier
  quantite: z.number().int().min(1).max(100).default(1),
  prixUnitaire: z.number().min(0).optional(), // défaut : prix de vente de l'article
  methode: z.enum(['CASH', 'VIREMENT', 'CHEQUE', 'CARTE']).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().optional().nullable(),
});

function libelleArticle(a: { nom: string; taille?: string | null; couleur?: string | null; marque?: string | null }): string {
  return [a.nom, a.marque, a.couleur, a.taille ? `taille ${a.taille}` : null].filter(Boolean).join(' — ');
}

// Catalogue karaté fourni par le club (PRIX DE VENTE ; coût de revient à saisir plus tard).
const CATALOGUE_KARATE: Array<{ nom: string; categorie: (typeof CATEGORIES)[number]; couleur?: string; marque?: string; prixVente: number }> = [
  { nom: 'Kimono de karaté', categorie: 'KIMONO', prixVente: 57.49 },
  { nom: 'Gants', categorie: 'GANTS', marque: 'Jukado', prixVente: 34.49 },
  { nom: 'Gants', categorie: 'GANTS', marque: 'Adidas', prixVente: 39.08 },
  { nom: 'Protège-tibias', categorie: 'PROTEGE_TIBIAS', marque: 'Jukado', prixVente: 63.22 },
  { nom: 'Protège-tibias', categorie: 'PROTEGE_TIBIAS', marque: 'Adidas', prixVente: 63.22 },
  { nom: 'Protège-dents', categorie: 'PROTEGE_DENTS', prixVente: 13.79 },
  { nom: 'Ceinture', categorie: 'CEINTURE', couleur: 'Bleue', prixVente: 13.79 },
  { nom: 'Ceinture', categorie: 'CEINTURE', couleur: 'Rouge', prixVente: 13.79 },
  { nom: 'Coquille', categorie: 'COQUILLE', prixVente: 18.4 },
];

// ---------- Ventes (déclarées avant /:id pour éviter la capture de route) ----------

// GET /api/inventaire/ventes?membreId=&articleId=&mois=AAAA-MM
router.get('/ventes', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { membreId, articleId, mois } = req.query as { membreId?: string; articleId?: string; mois?: string };
    const where: any = {};
    if (membreId) where.membreId = membreId;
    if (articleId) where.articleId = articleId;
    if (mois && /^\d{4}-\d{2}$/.test(mois)) {
      const [a, m] = mois.split('-').map(Number);
      where.date = { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(a, m, 1)) };
    }
    const ventes = await prisma.venteEquipement.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      include: {
        article: { select: { nom: true, categorie: true, discipline: true, taille: true, couleur: true, marque: true } },
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return sendSuccess(res, ventes);
  } catch {
    return sendError(res, 'Erreur de récupération des ventes', 500);
  }
});

// POST /api/inventaire/ventes — enregistre une vente et décrémente le stock.
router.post('/ventes', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = venteSchema.parse(req.body);
    const article = await prisma.articleInventaire.findUnique({ where: { id: data.articleId } });
    if (!article) return sendError(res, 'Article introuvable', 404);
    if (data.membreId) {
      const membre = await prisma.member.findUnique({ where: { id: data.membreId }, select: { id: true } });
      if (!membre) return sendError(res, 'Membre introuvable', 404);
    }

    const prixUnitaire = data.prixUnitaire ?? article.prixVente;
    const [vente] = await prisma.$transaction([
      prisma.venteEquipement.create({
        data: {
          articleId: data.articleId,
          membreId: data.membreId || null,
          quantite: data.quantite,
          prixUnitaire,
          methode: data.methode || null,
          // Midi UTC comme partout ailleurs pour les dates-jour.
          date: data.date ? new Date(`${data.date}T12:00:00Z`) : new Date(),
          note: data.note || null,
        },
        include: { member: { select: { firstName: true, lastName: true } } },
      }),
      prisma.articleInventaire.update({
        where: { id: data.articleId },
        data: { quantite: { decrement: data.quantite } },
      }),
    ]);

    logAudit(req, {
      action: 'CREATE',
      entity: 'VenteEquipement',
      entityId: vente.id,
      description: `Vente : ${data.quantite} × ${libelleArticle(article)} à ${(prixUnitaire * data.quantite).toFixed(2)} $${vente.member ? ` — ${vente.member.firstName} ${vente.member.lastName}` : ' — comptoir'}`,
    });

    const stockRestant = article.quantite - data.quantite;
    return sendSuccess(res, { ...vente, stockRestant, alerteStock: stockRestant < 0 ? 'Stock négatif : ajustez la quantité de l’article.' : undefined }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur d'enregistrement de la vente", 500);
  }
});

// DELETE /api/inventaire/ventes/:id — annule une vente et réincrémente le stock.
router.delete('/ventes/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const vente = await prisma.venteEquipement.findUnique({
      where: { id: req.params.id },
      include: { article: true, member: { select: { firstName: true, lastName: true } } },
    });
    if (!vente) return sendError(res, 'Vente introuvable', 404);

    await prisma.$transaction([
      prisma.venteEquipement.delete({ where: { id: vente.id } }),
      prisma.articleInventaire.update({ where: { id: vente.articleId }, data: { quantite: { increment: vente.quantite } } }),
    ]);

    logAudit(req, {
      action: 'DELETE',
      entity: 'VenteEquipement',
      entityId: vente.id,
      description: `Vente annulée : ${vente.quantite} × ${libelleArticle(vente.article)}${vente.member ? ` — ${vente.member.firstName} ${vente.member.lastName}` : ''} (stock réincrémenté)`,
    });

    return sendSuccess(res, { message: 'Vente annulée, stock réajusté' });
  } catch {
    return sendError(res, "Erreur d'annulation de la vente", 500);
  }
});

// ---------- Catalogue karaté ----------

// POST /api/inventaire/seed-karate — idempotent : n'ajoute que les articles
// karaté du catalogue qui n'existent pas encore (mêmes nom/marque/couleur).
router.post('/seed-karate', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const existants = await prisma.articleInventaire.findMany({ where: { discipline: 'KARATE' } });
    const cle = (a: { nom: string; marque?: string | null; couleur?: string | null }) =>
      `${a.nom.toLowerCase()}|${(a.marque || '').toLowerCase()}|${(a.couleur || '').toLowerCase()}`;
    const dejaLa = new Set(existants.map(cle));
    const aCreer = CATALOGUE_KARATE.filter((c) => !dejaLa.has(cle(c)));

    if (aCreer.length > 0) {
      await prisma.articleInventaire.createMany({
        data: aCreer.map((c) => ({
          nom: c.nom,
          categorie: c.categorie,
          discipline: 'KARATE',
          couleur: c.couleur || null,
          marque: c.marque || null,
          prixVente: c.prixVente,
          quantite: 0,
        })),
      });
      logAudit(req, {
        action: 'CREATE',
        entity: 'ArticleInventaire',
        entityId: 'catalogue-karate',
        description: `Catalogue karaté : ${aCreer.length} article(s) ajouté(s)`,
      });
    }

    return sendSuccess(res, { crees: aCreer.length, dejaPresents: CATALOGUE_KARATE.length - aCreer.length });
  } catch {
    return sendError(res, 'Erreur de création du catalogue karaté', 500);
  }
});

// ---------- Articles ----------

// GET /api/inventaire?discipline=&categorie=&inclureInactifs=1
router.get('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { discipline, categorie, inclureInactifs } = req.query as Record<string, string>;
    const where: any = {};
    if (!inclureInactifs) where.actif = true;
    if (discipline) where.discipline = discipline;
    if (categorie) where.categorie = categorie;
    const articles = await prisma.articleInventaire.findMany({
      where,
      orderBy: [{ discipline: 'asc' }, { categorie: 'asc' }, { nom: 'asc' }, { taille: 'asc' }],
    });
    return sendSuccess(res, articles);
  } catch {
    return sendError(res, "Erreur de récupération de l'inventaire", 500);
  }
});

// POST /api/inventaire
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = articleSchema.parse(req.body);
    const article = await prisma.articleInventaire.create({
      data: { ...data, quantite: data.quantite ?? 0 },
    });
    logAudit(req, {
      action: 'CREATE',
      entity: 'ArticleInventaire',
      entityId: article.id,
      description: `Article créé : ${libelleArticle(article)} — vente ${article.prixVente.toFixed(2)} $`,
    });
    return sendSuccess(res, article, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, "Erreur de création de l'article", 500);
  }
});

// PUT /api/inventaire/:id
router.put('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = articleSchema.partial().parse(req.body);
    const article = await prisma.articleInventaire.update({ where: { id: req.params.id }, data });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'ArticleInventaire',
      entityId: article.id,
      description: `Article modifié : ${libelleArticle(article)}${data.prixVente !== undefined ? ` — vente ${article.prixVente.toFixed(2)} $` : ''}${data.quantite !== undefined ? ` — stock ${article.quantite}` : ''}`,
    });
    return sendSuccess(res, article);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Article introuvable', 404);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// POST /api/inventaire/:id/stock — ajustement (+ réception, − perte/correction).
router.post('/:id/stock', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { delta } = z.object({ delta: z.number().int().min(-1000).max(1000).refine((d) => d !== 0, 'Delta nul') }).parse(req.body);
    const article = await prisma.articleInventaire.update({
      where: { id: req.params.id },
      data: { quantite: { increment: delta } },
    });
    logAudit(req, {
      action: 'UPDATE',
      entity: 'ArticleInventaire',
      entityId: article.id,
      description: `Stock ajusté ${delta > 0 ? '+' : ''}${delta} : ${libelleArticle(article)} → ${article.quantite}`,
    });
    return sendSuccess(res, article);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    if (error?.code === 'P2025') return sendError(res, 'Article introuvable', 404);
    return sendError(res, "Erreur d'ajustement du stock", 500);
  }
});

// DELETE /api/inventaire/:id — suppression si aucune vente, sinon désactivation
// (les ventes passées gardent leur référence d'article).
router.delete('/:id', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const article = await prisma.articleInventaire.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { ventes: true } } },
    });
    if (!article) return sendError(res, 'Article introuvable', 404);

    if (article._count.ventes > 0) {
      await prisma.articleInventaire.update({ where: { id: article.id }, data: { actif: false } });
      logAudit(req, { action: 'UPDATE', entity: 'ArticleInventaire', entityId: article.id, description: `Article désactivé (ventes existantes) : ${libelleArticle(article)}` });
      return sendSuccess(res, { message: 'Article désactivé (des ventes y sont rattachées)' });
    }

    await prisma.articleInventaire.delete({ where: { id: article.id } });
    logAudit(req, { action: 'DELETE', entity: 'ArticleInventaire', entityId: article.id, description: `Article supprimé : ${libelleArticle(article)}` });
    return sendSuccess(res, { message: 'Article supprimé' });
  } catch {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

export default router;
