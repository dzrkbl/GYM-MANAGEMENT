import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { compresserImage, lireFacture, type ChampsFacture } from '../../lib/ocrFacture';
import { formatDateLocal } from '../../lib/format';
import { ReceiptText, Plus, Pencil, Trash2, ScanLine, Image as ImageIcon, Undo2, CheckCircle2 } from 'lucide-react';

interface DepenseAdmin {
  id: string;
  payeurId: string;
  payeurNom: string;
  fournisseur: string | null;
  dateFacture: string;
  sousTotal: number | null;
  tps: number | null;
  tvq: number | null;
  total: number;
  categorie: string | null;
  note: string | null;
  statut: 'A_REMBOURSER' | 'REMBOURSE';
  rembourseLe: string | null;
  rembourseVia: string | null;
  depenseId: string | null;
  aUnePhoto?: boolean;
}

interface TotalPayeur { payeurId: string; payeurNom: string; aRembourser: number; rembourse: number }

const CATEGORIES = [
  { value: 'MATERIEL', label: 'Matériel' },
  { value: 'ENTRETIEN', label: 'Entretien' },
  { value: 'ADMINISTRATIF', label: 'Administratif' },
  { value: 'EVENEMENT', label: 'Événement' },
  { value: 'AUTRE', label: 'Autre' },
];
const fmt$ = (n: number) => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
const selectClass = 'min-h-[44px] w-full border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red';
const todayISO = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());

const FORM_VIDE = { fournisseur: '', dateFacture: '', sousTotal: '', tps: '', tvq: '', total: '', categorie: 'MATERIEL', note: '' };

export function DepensesAdmin() {
  const { user } = useAuth();
  const [depenses, setDepenses] = useState<DepenseAdmin[]>([]);
  const [totaux, setTotaux] = useState<TotalPayeur[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [filtrePayeur, setFiltrePayeur] = useState('TOUS');
  const [filtreStatut, setFiltreStatut] = useState('TOUS');

  // Modal ajout/édition
  const [modalOuvert, setModalOuvert] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...FORM_VIDE });
  const [photo, setPhoto] = useState<string | null>(null); // data URL compressée
  const [ocrTexte, setOcrTexte] = useState<string | null>(null);
  const [ocrEnCours, setOcrEnCours] = useState(false);
  const [ocrPct, setOcrPct] = useState(0);
  const [ocrVerdict, setOcrVerdict] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal photo (consultation)
  const [photoVue, setPhotoVue] = useState<string | null>(null);

  // Modal remboursement
  const [rembourseCible, setRembourseCible] = useState<DepenseAdmin | null>(null);
  const [rembForm, setRembForm] = useState({ date: todayISO(), via: 'VIREMENT', ajouterAuxCharges: true });

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ depenses: DepenseAdmin[]; totaux: TotalPayeur[] }>('/depenses-admin');
      setDepenses(res.depenses);
      setTotaux(res.totaux);
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (user?.role === 'ADMIN') load(); }, [user]);

  const visibles = useMemo(() => depenses.filter((d) => {
    if (filtrePayeur !== 'TOUS' && d.payeurId !== filtrePayeur) return false;
    if (filtreStatut !== 'TOUS' && d.statut !== filtreStatut) return false;
    return true;
  }), [depenses, filtrePayeur, filtreStatut]);

  const totalARembourser = useMemo(() => totaux.reduce((s, t) => s + t.aRembourser, 0), [totaux]);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const ouvrirAjout = () => {
    setEditId(null);
    setForm({ ...FORM_VIDE, dateFacture: todayISO() });
    setPhoto(null); setOcrTexte(null); setOcrVerdict(null); setOcrPct(0);
    setModalOuvert(true);
  };

  const ouvrirEdition = (d: DepenseAdmin) => {
    setEditId(d.id);
    setForm({
      fournisseur: d.fournisseur || '',
      dateFacture: d.dateFacture.slice(0, 10),
      sousTotal: d.sousTotal != null ? String(d.sousTotal) : '',
      tps: d.tps != null ? String(d.tps) : '',
      tvq: d.tvq != null ? String(d.tvq) : '',
      total: String(d.total),
      categorie: d.categorie || 'MATERIEL',
      note: d.note || '',
    });
    setPhoto(null); setOcrTexte(null); setOcrVerdict(null);
    setModalOuvert(true);
  };

  const surChoixPhoto = async (fichier: File | null) => {
    if (!fichier) return;
    setError('');
    try {
      const compressee = await compresserImage(fichier);
      setPhoto(compressee);
      setOcrVerdict(null);
    } catch (err: any) {
      setError(err?.message || 'Photo illisible');
    }
  };

  const remplirDepuisChamps = (c: ChampsFacture) => {
    setForm((p) => ({
      ...p,
      fournisseur: c.fournisseur ?? p.fournisseur,
      dateFacture: c.dateFacture ?? p.dateFacture,
      sousTotal: c.sousTotal != null ? String(c.sousTotal) : p.sousTotal,
      tps: c.tps != null ? String(c.tps) : p.tps,
      tvq: c.tvq != null ? String(c.tvq) : p.tvq,
      total: c.total != null ? String(c.total) : p.total,
    }));
  };

  const lancerOcr = async () => {
    if (!photo) return;
    setOcrEnCours(true);
    setOcrPct(0);
    setOcrVerdict(null);
    setError('');
    try {
      const { texte, champs } = await lireFacture(photo, (pct) => setOcrPct(pct));
      setOcrTexte(texte);
      remplirDepuisChamps(champs);
      setOcrVerdict(
        champs.coherent === true
          ? '✓ Lecture cohérente : sous-total + TPS + TVQ = total. Vérifiez quand même chaque champ.'
          : champs.coherent === false
            ? "⚠️ Les montants lus ne s'additionnent pas — corrigez les champs à la main."
            : '⚠️ Lecture partielle — complétez les champs manquants à la main.'
      );
    } catch (err: any) {
      setOcrVerdict("⚠️ L'OCR a échoué (" + (err?.message || 'erreur') + ') — saisissez les champs à la main.');
    } finally {
      setOcrEnCours(false);
    }
  };

  // TPS/TVQ déduites du total pour une facture entièrement taxable (aide).
  const calculerTaxesDepuisTotal = () => {
    const total = parseFloat(form.total.replace(',', '.'));
    if (isNaN(total) || total <= 0) { setError('Saisissez d’abord le total.'); return; }
    const sousTotal = Math.round((total / 1.14975) * 100) / 100;
    const tps = Math.round(sousTotal * 0.05 * 100) / 100;
    const tvq = Math.round((total - sousTotal - tps) * 100) / 100;
    setForm((p) => ({ ...p, sousTotal: String(sousTotal), tps: String(tps), tvq: String(tvq) }));
  };

  const num = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = parseFloat(v.replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const sauver = async () => {
    const total = num(form.total);
    if (!form.dateFacture || total === null || total <= 0) {
      setError('Date de facture et total valides requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body: any = {
        fournisseur: form.fournisseur.trim() || null,
        dateFacture: form.dateFacture,
        sousTotal: num(form.sousTotal),
        tps: num(form.tps),
        tvq: num(form.tvq),
        total,
        categorie: form.categorie,
        note: form.note.trim() || null,
      };
      if (!editId) {
        body.imageDataUrl = photo;
        body.ocrBrut = ocrTexte;
        await apiFetch('/depenses-admin', { method: 'POST', body: JSON.stringify(body) });
      } else {
        if (photo) { body.imageDataUrl = photo; body.ocrBrut = ocrTexte; }
        await apiFetch(`/depenses-admin/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setModalOuvert(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const voirPhoto = async (d: DepenseAdmin) => {
    try {
      const res = await apiFetch<{ imageDataUrl: string | null }>(`/depenses-admin/${d.id}/photo`);
      if (!res.imageDataUrl) { setInfo('Aucune photo pour cette dépense.'); return; }
      setPhotoVue(res.imageDataUrl);
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    }
  };

  const rembourser = async () => {
    if (!rembourseCible) return;
    try {
      await apiFetch(`/depenses-admin/${rembourseCible.id}/rembourser`, {
        method: 'PATCH',
        body: JSON.stringify({ via: rembForm.via, dateRemboursement: rembForm.date, ajouterAuxCharges: rembForm.ajouterAuxCharges }),
      });
      setRembourseCible(null);
      setInfo('Remboursement enregistré.' + (rembForm.ajouterAuxCharges ? ' La charge a été versée au Module financier.' : ''));
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du remboursement');
    }
  };

  const annulerRemboursement = async (d: DepenseAdmin) => {
    if (!confirm(`Annuler le remboursement de ${fmt$(d.total)} à ${d.payeurNom} ?${d.depenseId ? '\nLa charge liée du Module financier sera retirée.' : ''}`)) return;
    try {
      await apiFetch(`/depenses-admin/${d.id}/annuler-remboursement`, { method: 'PATCH' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    }
  };

  const supprimer = async (d: DepenseAdmin) => {
    if (!confirm(`Supprimer la dépense de ${fmt$(d.total)} (${d.payeurNom}${d.fournisseur ? `, ${d.fournisseur}` : ''}) ?`)) return;
    try {
      await apiFetch(`/depenses-admin/${d.id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur de suppression');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cshp-black">Remboursements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dépenses payées de leur poche par les administrateurs — photo de la facture, lecture automatique (corrigeable), suivi des remboursements.
          </p>
        </div>
        <Button onClick={ouvrirAjout} className="!min-h-0 h-10"><Plus size={18} className="mr-1" /> Ajouter une facture</Button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
      {info && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex justify-between items-center">
          <span>{info}</span>
          <button onClick={() => setInfo('')} className="text-green-700 font-bold px-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Totaux par personne */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <span className="text-[11px] uppercase font-bold text-gray-400 block">À rembourser (total)</span>
          <span className={`text-xl font-black ${totalARembourser > 0 ? 'text-red-600' : 'text-cshp-black'}`}>{fmt$(totalARembourser)}</span>
        </Card>
        {totaux.map((t) => (
          <Card key={t.payeurId} className="p-4">
            <span className="text-[11px] uppercase font-bold text-gray-400 block">👤 {t.payeurNom}</span>
            <span className="text-sm">
              <span className={`font-black ${t.aRembourser > 0 ? 'text-red-600' : 'text-cshp-black'}`}>{fmt$(t.aRembourser)}</span>
              <span className="text-gray-400"> à rembourser · {fmt$(t.rembourse)} remboursés</span>
            </span>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Payeur</label>
          <select className={selectClass} value={filtrePayeur} onChange={(e) => setFiltrePayeur(e.target.value)}>
            <option value="TOUS">Tous</option>
            {totaux.map((t) => <option key={t.payeurId} value={t.payeurId}>{t.payeurNom}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Statut</label>
          <select className={selectClass} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="TOUS">Tous</option>
            <option value="A_REMBOURSER">À rembourser</option>
            <option value="REMBOURSE">Remboursé</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 px-4">Date facture</th>
                <th className="py-3 px-2">Fournisseur</th>
                <th className="py-3 px-2">Payé par</th>
                <th className="py-3 px-2 text-right">Total</th>
                <th className="py-3 px-2 text-right">TPS / TVQ</th>
                <th className="py-3 px-2">Statut</th>
                <th className="py-3 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">Aucune dépense. Ajoutez la première avec « Ajouter une facture ».</td></tr>
              )}
              {visibles.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 align-top">
                  <td className="py-2.5 px-4">{formatDateLocal(d.dateFacture)}</td>
                  <td className="py-2.5 px-2">
                    <span className="font-medium text-cshp-black">{d.fournisseur || '—'}</span>
                    {d.categorie && <span className="block text-xs text-gray-400">{CATEGORIES.find((c) => c.value === d.categorie)?.label || d.categorie}</span>}
                    {d.note && <span className="block text-xs text-gray-400 italic">{d.note}</span>}
                  </td>
                  <td className="py-2.5 px-2">{d.payeurNom}</td>
                  <td className="py-2.5 px-2 text-right font-bold">{fmt$(d.total)}</td>
                  <td className="py-2.5 px-2 text-right text-xs text-gray-500">
                    {d.tps != null ? fmt$(d.tps) : '—'}<br />{d.tvq != null ? fmt$(d.tvq) : '—'}
                  </td>
                  <td className="py-2.5 px-2">
                    {d.statut === 'REMBOURSE' ? (
                      <Badge variant="success">Remboursé {d.rembourseLe ? `le ${formatDateLocal(d.rembourseLe)}` : ''}</Badge>
                    ) : (
                      <Badge variant="danger">À rembourser</Badge>
                    )}
                    {d.statut === 'REMBOURSE' && d.depenseId && <span className="block text-[10px] text-gray-400 mt-0.5">versé aux charges</span>}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex justify-end gap-1">
                      {d.aUnePhoto && (
                        <button onClick={() => voirPhoto(d)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer" title="Voir la facture"><ImageIcon size={16} /></button>
                      )}
                      {d.statut === 'A_REMBOURSER' ? (
                        <button
                          onClick={() => { setRembourseCible(d); setRembForm({ date: todayISO(), via: 'VIREMENT', ajouterAuxCharges: true }); }}
                          className="p-2 rounded-lg hover:bg-green-50 text-green-700 cursor-pointer"
                          title="Marquer remboursé"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      ) : (
                        <button onClick={() => annulerRemboursement(d)} className="p-2 rounded-lg hover:bg-amber-50 text-amber-700 cursor-pointer" title="Annuler le remboursement"><Undo2 size={16} /></button>
                      )}
                      <button onClick={() => ouvrirEdition(d)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer" title="Modifier"><Pencil size={16} /></button>
                      <button onClick={() => supprimer(d)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer" title="Supprimer"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-3">
            Une dépense n'entre dans les charges du Module financier <strong>qu'au remboursement</strong> (option cochée par défaut) — jamais avant, pour ne rien compter deux fois.
          </p>
        </Card>
      )}

      {/* Modal ajout / édition */}
      <Modal isOpen={modalOuvert} onClose={() => !ocrEnCours && setModalOuvert(false)} title={editId ? 'Modifier la dépense' : 'Ajouter une facture'} width="xl">
        <div className="space-y-4">
          {/* Photo + OCR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-600">Photo de la facture {editId ? '(remplacer, optionnel)' : ''}</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => surChoixPhoto(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cshp-black file:text-white file:cursor-pointer"
              />
              {photo && (
                <>
                  <img src={photo} alt="Facture" className="max-h-56 rounded-lg border border-gray-200" />
                  <Button variant="secondary" onClick={lancerOcr} disabled={ocrEnCours} className="!min-h-0 h-9 text-sm">
                    <ScanLine size={15} className="mr-1" />
                    {ocrEnCours ? `Lecture… ${ocrPct} %` : 'Lire la facture (OCR)'}
                  </Button>
                  <p className="text-[11px] text-gray-400">Première lecture : quelques Mo à télécharger, puis c'est instantané. Tout reste corrigeable.</p>
                </>
              )}
              {ocrVerdict && (
                <p className={`text-xs font-semibold p-2 rounded-lg ${ocrVerdict.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>{ocrVerdict}</p>
              )}
            </div>

            {/* Champs */}
            <div className="grid grid-cols-2 gap-3 content-start">
              <div className="col-span-2"><Input label="Fournisseur" value={form.fournisseur} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })} placeholder="Canadian Tire, Dollarama…" /></div>
              <Input label="Date de la facture *" type="date" value={form.dateFacture} onChange={(e) => setForm({ ...form, dateFacture: e.target.value })} />
              <div>
                <label className="block mb-1 text-sm font-medium text-cshp-black">Catégorie</label>
                <select className={selectClass} value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <Input label="Sous-total $" inputMode="decimal" value={form.sousTotal} onChange={(e) => setForm({ ...form, sousTotal: e.target.value })} />
              <Input label="Total (taxes incl.) $ *" inputMode="decimal" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
              <Input label="TPS $" inputMode="decimal" value={form.tps} onChange={(e) => setForm({ ...form, tps: e.target.value })} />
              <Input label="TVQ $" inputMode="decimal" value={form.tvq} onChange={(e) => setForm({ ...form, tvq: e.target.value })} />
              <div className="col-span-2">
                <button onClick={calculerTaxesDepuisTotal} className="text-[11px] underline text-gray-500 hover:text-cshp-black cursor-pointer">
                  Calculer sous-total/TPS/TVQ depuis le total (facture entièrement taxable)
                </button>
              </div>
              <div className="col-span-2"><Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optionnel" /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOuvert(false)} disabled={ocrEnCours || saving}>Annuler</Button>
            <Button onClick={sauver} isLoading={saving} disabled={ocrEnCours}>{editId ? 'Sauvegarder' : 'Enregistrer la dépense'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal photo */}
      <Modal isOpen={!!photoVue} onClose={() => setPhotoVue(null)} title="Facture" width="lg">
        {photoVue && <img src={photoVue} alt="Facture" className="w-full rounded-lg" />}
      </Modal>

      {/* Modal remboursement */}
      <Modal isOpen={!!rembourseCible} onClose={() => setRembourseCible(null)} title="Marquer remboursé" width="md">
        {rembourseCible && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rembourser <strong>{fmt$(rembourseCible.total)}</strong> à <strong>{rembourseCible.payeurNom}</strong>
              {rembourseCible.fournisseur ? <> (facture {rembourseCible.fournisseur})</> : null}.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date du remboursement" type="date" value={rembForm.date} onChange={(e) => setRembForm({ ...rembForm, date: e.target.value })} />
              <div>
                <label className="block mb-1 text-sm font-medium text-cshp-black">Méthode</label>
                <select className={selectClass} value={rembForm.via} onChange={(e) => setRembForm({ ...rembForm, via: e.target.value })}>
                  <option value="VIREMENT">Virement</option>
                  <option value="COMPTANT">Comptant</option>
                  <option value="CHEQUE">Chèque</option>
                </select>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={rembForm.ajouterAuxCharges}
                onChange={(e) => setRembForm({ ...rembForm, ajouterAuxCharges: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-cshp-red focus:ring-cshp-red"
              />
              <span>
                Verser aux charges du Module financier (mois du remboursement)
                <span className="block text-xs text-gray-400">Recommandé : la dépense devient une charge du club (récupération TPS/TVQ si la facture en porte).</span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRembourseCible(null)}>Annuler</Button>
              <Button onClick={rembourser} className="bg-green-600 hover:bg-green-700 text-white"><ReceiptText size={15} className="mr-1" /> Confirmer le remboursement</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
