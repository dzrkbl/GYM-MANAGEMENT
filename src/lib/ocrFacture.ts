// Lecture de factures/reçus photographiés, entièrement CÔTÉ CLIENT :
// compression de la photo (canvas), OCR tesseract.js (chargé à la demande,
// ~qq Mo la première fois), puis extraction des champs d'un reçu québécois
// (fournisseur, date, sous-total, TPS, TVQ, total). L'OCR se trompe souvent :
// tous les champs restent corrigeables dans le formulaire — l'extraction est
// une aide, jamais une vérité.

export interface ChampsFacture {
  fournisseur: string | null;
  dateFacture: string | null; // AAAA-MM-JJ
  sousTotal: number | null;
  tps: number | null;
  tvq: number | null;
  total: number | null;
  coherent: boolean | null; // sous-total + TPS + TVQ ≈ total (±0,05 $) ; null = incalculable
}

// Photo compressée en JPEG ≤ maxCote px (grande dimension) : assez précis pour
// l'OCR et assez léger pour être stocké en base (data URL ~200-600 Ko).
export async function compresserImage(fichier: File, maxCote = 1400, qualite = 0.82): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result));
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.readAsDataURL(fichier);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image illisible'));
    i.src = dataUrl;
  });
  const ratio = Math.min(1, maxCote / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', qualite);
}

const RE_MONTANT = /(\d{1,3}(?:[  ]\d{3})*[.,]\d{2})/g;

function montantsDeLigne(ligne: string): number[] {
  const res: number[] = [];
  for (const m of ligne.matchAll(RE_MONTANT)) {
    const n = parseFloat(m[1].replace(/[  ]/g, '').replace(',', '.'));
    if (!isNaN(n) && n >= 0 && n < 100_000) res.push(n);
  }
  return res;
}

function chercherDate(texte: string): string | null {
  // AAAA-MM-JJ d'abord (format des caisses modernes).
  const iso = texte.match(/(20[2-3]\d)[-/.](\d{2})[-/.](\d{2})/);
  if (iso) {
    const [, a, m, j] = iso;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(j) >= 1 && Number(j) <= 31) return `${a}-${m}-${j}`;
  }
  // JJ/MM/AAAA ou MM/JJ/AAAA : on tranche par la valeur (>12 = jour).
  const fr = texte.match(/(\d{2})[-/.](\d{2})[-/.](20[2-3]\d)/);
  if (fr) {
    let [, p1, p2, a] = fr;
    let jour = p1, mois = p2;
    if (Number(p1) <= 12 && Number(p2) > 12) { jour = p2; mois = p1; }
    if (Number(mois) >= 1 && Number(mois) <= 12 && Number(jour) >= 1 && Number(jour) <= 31) {
      return `${a}-${mois}-${jour}`;
    }
  }
  return null;
}

// Extraction des champs depuis le texte OCR brut. Exporté pour être testable
// sans OCR réel.
export function analyserTexteFacture(texte: string): ChampsFacture {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const majuscule = (l: string) => l.toUpperCase();

  // TPS / TVQ : montants AVEC décimales sur la ligne qui porte le mot-clé —
  // les numéros d'enregistrement (« TPS 123456789 RT0001 ») n'ont pas de
  // décimales et sont donc ignorés d'office.
  let tps: number | null = null;
  let tvq: number | null = null;
  let sousTotal: number | null = null;
  let total: number | null = null;
  for (const l of lignes) {
    const L = majuscule(l);
    const montants = montantsDeLigne(l);
    if (montants.length === 0) continue;
    if (/(^|[^A-Z])(TPS|GST)([^A-Z]|$)/.test(L) && tps === null) tps = montants[montants.length - 1];
    if (/(^|[^A-Z])(TVQ|QST)([^A-Z]|$)/.test(L) && tvq === null) tvq = montants[montants.length - 1];
    if (/SOUS[\s-]*TOTAL|SUB[\s-]*TOTAL/.test(L) && sousTotal === null) sousTotal = montants[montants.length - 1];
    // « TOTAL » sans « SOUS » : on garde la DERNIÈRE occurrence (le grand total
    // vient après les sous-totaux et avant le paiement/la monnaie).
    if (/TOTAL/.test(L) && !/SOUS|SUB/.test(L)) total = montants[montants.length - 1];
  }
  // Sans ligne TOTAL lisible : repli sur le plus grand montant du reçu.
  if (total === null) {
    const tous = montantsDeLigne(texte);
    if (tous.length > 0) total = Math.max(...tous);
  }
  // Sous-total reconstituable si TPS/TVQ/total sont là.
  if (sousTotal === null && total !== null && tps !== null && tvq !== null) {
    sousTotal = Math.round((total - tps - tvq) * 100) / 100;
  }

  // Fournisseur : première ligne « nominale » du haut du reçu.
  let fournisseur: string | null = null;
  for (const l of lignes.slice(0, 6)) {
    const L = majuscule(l);
    if ((l.match(/[A-Za-zÀ-ÿ]/g) || []).length < 3) continue;
    if (/FACTURE|RE[ÇC]U|RECEIPT|INVOICE|BIENVENUE|MERCI|TEL|WWW|HTTP|#|N[O°]\s*\d/.test(L)) continue;
    fournisseur = l.replace(/\s{2,}/g, ' ').slice(0, 60);
    break;
  }

  const dateFacture = chercherDate(texte);

  let coherent: boolean | null = null;
  if (sousTotal !== null && tps !== null && tvq !== null && total !== null) {
    coherent = Math.abs(sousTotal + tps + tvq - total) <= 0.05;
  }

  return { fournisseur, dateFacture, sousTotal, tps, tvq, total, coherent };
}

// OCR complet d'une photo (data URL). tesseract.js est chargé à la demande :
// le reste de l'application ne paie jamais son poids.
export async function lireFacture(
  dataUrl: string,
  onProgress?: (pct: number, etape: string) => void
): Promise<{ texte: string; champs: ChampsFacture }> {
  const Tesseract = await import('tesseract.js');
  const resultat = await Tesseract.recognize(dataUrl, 'fra+eng', {
    logger: (m: any) => {
      if (onProgress && typeof m?.progress === 'number') {
        onProgress(Math.round(m.progress * 100), m.status || '');
      }
    },
  });
  const texte = resultat?.data?.text || '';
  return { texte, champs: analyserTexteFacture(texte) };
}
