import { Router, Request, Response } from 'express';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { envoyerSauvegarde } from '../lib/sauvegarde';
import { logAudit } from '../lib/audit';

const router = Router();

// POST /api/backup — envoie immédiatement la sauvegarde Excel + résumé (ADMIN).
// La version quotidienne automatique passe par la tournée de rappels.
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { envoyeA, resume } = await envoyerSauvegarde();
    logAudit(req, { action: 'CREATE', entity: 'Sauvegarde', description: `Sauvegarde envoyée manuellement → ${envoyeA}` });
    return sendSuccess(res, { ok: true, envoyeA, encaisseAujourdhui: resume.totalDuJour });
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e);
    logAudit(req, { action: 'ERREUR', entity: 'Sauvegarde', description: `Sauvegarde manuelle échouée : ${message}` });
    return sendError(res, `Échec de l'envoi de la sauvegarde : ${message}`, 502);
  }
});

export default router;
