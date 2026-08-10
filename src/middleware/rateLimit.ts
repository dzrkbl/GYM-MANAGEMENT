import { Request, Response, NextFunction } from 'express';

/**
 * Limiteur de débit en mémoire (par adresse IP). Suffisant pour un seul
 * processus (Render) : protège le login contre le brute-force et le
 * formulaire d'inscription public contre le spam, sans dépendance externe.
 */
export function rateLimit(options: { fenetreMs: number; max: number; message: string }) {
  const { fenetreMs, max, message } = options;
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || 'inconnu';
    const recents = (hits.get(key) || []).filter((t) => now - t < fenetreMs);

    if (recents.length >= max) {
      hits.set(key, recents);
      return res.status(429).json({ success: false, error: message });
    }

    recents.push(now);
    hits.set(key, recents);

    // Nettoyage occasionnel pour éviter que la table grossisse indéfiniment.
    if (hits.size > 1000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= fenetreMs)) hits.delete(k);
      }
    }
    next();
  };
}
