import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { normalizeMethodePaiement } from '../lib/paiements';

const router = Router();

/**
 * Import CSV pour migrer les données (ex: depuis Google Sheets).
 *
 * Colonnes attendues — MEMBRES (une ligne par membre) :
 *   0 prenom | 1 nom | 2 dateNaissance(AAAA-MM-JJ) | 3 genre(M/F) | 4 courriel |
 *   5 telephone | 6 nomParent | 7 telephoneParent | 8 courrielParent |
 *   9 statut(ACTIF/INACTIF/EN_ATTENTE) | 10 section(ex KARATE_GR1) |
 *   11 plan(MENSUEL/TRIMESTRIEL/ANNUEL) | 12 prixBase | 13 rabaisFamille(oui/non) |
 *   14 membreFamille | 15 rabaisCustomPct | 16 raisonRabais | 17 montantFinal |
 *   18 dateInscription | 19 finContrat | 20 ceinture | 21 notes
 *
 * Colonnes attendues — VERSEMENTS (une ligne par versement, optionnel) :
 *   0 nomComplet("Prenom Nom") | 1 numero | 2 montant | 3 datePrevue |
 *   4 datePaiement(vide si non payé) | 5 methode | 6 note
 */

const importSchema = z.object({
  membres: z.string().optional().nullable(),
  versements: z.string().optional().nullable(),
  hasHeader: z.boolean().optional().default(true),
});

interface StatDetail {
  inserted: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ ligne: number; nom: string; error: string }>;
}

const emptyStat = (): StatDetail => ({ inserted: 0, skipped: 0, errors: 0, errorDetails: [] });

// Parseur CSV gérant les champs entre guillemets contenant des virgules.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { fields.push(cur); cur = ''; }
        else cur += c;
      }
    }
    fields.push(cur);
    rows.push(fields.map((f) => f.trim()));
  }
  return rows;
}

// Parse une date AAAA-MM-JJ à midi (heure locale) pour éviter les décalages de fuseau.
function parseDate(value?: string): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseBool(value?: string): boolean {
  if (!value) return false;
  return ['true', 'vrai', 'oui', '1', 'yes', 'x'].includes(value.trim().toLowerCase());
}

function parseNum(value?: string): number | null {
  if (!value || !value.trim()) return null;
  const n = parseFloat(value.trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}

function normalizeStatut(value?: string): string {
  const v = (value || '').trim().toUpperCase();
  return ['ACTIF', 'INACTIF', 'EN_ATTENTE'].includes(v) ? v : 'ACTIF';
}

function normalizePlan(value?: string): 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL' | null {
  const v = (value || '').trim().toUpperCase();
  return v === 'MENSUEL' || v === 'TRIMESTRIEL' || v === 'ANNUEL' ? v : null;
}

// POST /api/import
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = importSchema.parse(req.body);
    const skipHeader = data.hasHeader !== false;

    const membres = emptyStat();
    const versements = emptyStat();
    const nameToId = new Map<string, string>();

    // --- MEMBRES ---
    if (data.membres && data.membres.trim()) {
      let rows = parseCsv(data.membres);
      if (skipHeader) rows = rows.slice(1);

      for (let i = 0; i < rows.length; i++) {
        const p = rows[i];
        const ligne = skipHeader ? i + 2 : i + 1;
        const firstName = p[0]?.trim();
        const lastName = p[1]?.trim();
        if (!firstName || !lastName) {
          membres.skipped++;
          continue;
        }
        const key = `${firstName} ${lastName}`;

        const existing = await prisma.member.findFirst({ where: { firstName, lastName } });
        if (existing) {
          nameToId.set(key, existing.id);
          membres.skipped++;
          continue;
        }

        try {
          const section = p[10]?.trim() || null;
          const ceinture = p[20]?.trim() || 'BLANCHE';
          const created = await prisma.member.create({
            data: {
              firstName,
              lastName,
              dateOfBirth: parseDate(p[2]),
              gender: p[3]?.trim() || null,
              email: p[4]?.trim() || null,
              phone: p[5]?.trim() || null,
              parentName: p[6]?.trim() || null,
              parentPhone: p[7]?.trim() || null,
              parentEmail: p[8]?.trim() || null,
              status: normalizeStatut(p[9]),
              plan: normalizePlan(p[11]),
              prixBase: parseNum(p[12]),
              rabaisFamille: parseBool(p[13]),
              membreFamilleId: p[14]?.trim() || null,
              rabaisCustomPct: parseNum(p[15]),
              raisonRabaisCustom: p[16]?.trim() || null,
              montantFinal: parseNum(p[17]),
              dateInscription: parseDate(p[18]),
              finContrat: parseDate(p[19]),
              currentBelt: ceinture.toUpperCase(),
              notes: p[21]?.trim() || null,
              sections: section
                ? { create: [{ section, belt: ceinture }] }
                : undefined,
            },
          });
          nameToId.set(key, created.id);
          membres.inserted++;
        } catch (err: any) {
          membres.errors++;
          membres.errorDetails.push({ ligne, nom: key, error: err?.message || String(err) });
        }
      }
    }

    // --- VERSEMENTS ---
    if (data.versements && data.versements.trim()) {
      let rows = parseCsv(data.versements);
      if (skipHeader) rows = rows.slice(1);

      for (let i = 0; i < rows.length; i++) {
        const p = rows[i];
        const ligne = skipHeader ? i + 2 : i + 1;
        const fullName = p[0]?.trim();
        if (!fullName) {
          versements.skipped++;
          continue;
        }

        // Lier au membre : map de l'import, sinon recherche en base par nom complet.
        let memberId = nameToId.get(fullName);
        if (!memberId) {
          const parts = fullName.split(' ');
          const firstName = parts[0];
          const lastName = parts.slice(1).join(' ');
          const found = lastName
            ? await prisma.member.findFirst({ where: { firstName, lastName } })
            : null;
          if (found) {
            memberId = found.id;
            nameToId.set(fullName, found.id);
          }
        }
        if (!memberId) {
          versements.skipped++;
          versements.errorDetails.push({ ligne, nom: fullName, error: 'Membre introuvable' });
          continue;
        }

        const numero = parseInt(p[1]?.trim() || '1', 10) || 1;
        const montant = parseNum(p[2]) ?? 0;
        const datePrevue = parseDate(p[3]) || new Date();
        const datePaiement = parseDate(p[4]);

        const existing = await prisma.paymentVersement.findFirst({
          where: { membreId: memberId, numeroVersement: numero, montant, datePrevue },
        });
        if (existing) {
          versements.skipped++;
          continue;
        }

        try {
          await prisma.paymentVersement.create({
            data: {
              membreId: memberId,
              numeroVersement: numero,
              montant,
              datePrevue,
              datePaiement,
              methodePaiement: normalizeMethodePaiement(p[5]),
              note: p[6]?.trim() || null,
            },
          });
          versements.inserted++;
        } catch (err: any) {
          versements.errors++;
          versements.errorDetails.push({ ligne, nom: fullName, error: err?.message || String(err) });
        }
      }
    }

    return sendSuccess(res, { membres, versements });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error in POST /api/import:', error);
    return sendError(res, "Erreur lors de l'import", 500);
  }
});

export default router;
