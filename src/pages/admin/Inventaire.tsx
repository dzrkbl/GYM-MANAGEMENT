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
import { Package, Plus, Copy, Pencil, Trash2, ShoppingCart, Minus, Undo2 } from 'lucide-react';

interface Article {
  id: string;
  nom: string;
  categorie: string;
  discipline: string | null;
  taille: string | null;
  couleur: string | null;
  marque: string | null;
  coutAchat: number | null;
  prixVente: number;
  quantite: number;
  seuilAlerte: number | null;
  actif: boolean;
  notes: string | null;
}

interface Vente {
  id: string;
  quantite: number;
  prixUnitaire: number;
  methode: string | null;
  date: string;
  note: string | null;
  article: { nom: string; categorie: string; discipline: string | null; taille: string | null; couleur: string | null; marque: string | null };
  member: { id: string; firstName: string; lastName: string } | null;
}

interface MembreLight {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

const CATEGORIES = [
  { value: 'KIMONO', label: 'Kimono' },
  { value: 'PANTALON', label: 'Pantalon / bas de kimono' },
  { value: 'CHANDAIL', label: 'Chandail' },
  { value: 'CEINTURE', label: 'Ceinture' },
  { value: 'GANTS', label: 'Gants' },
  { value: 'PROTEGE_TIBIAS', label: 'Protège-tibias' },
  { value: 'PROTEGE_DENTS', label: 'Protège-dents' },
  { value: 'COQUILLE', label: 'Coquille' },
  { value: 'AUTRE', label: 'Autre' },
];
const DISCIPLINES = [
  { value: 'KARATE', label: 'Karaté' },
  { value: 'JUDO', label: 'Judo' },
  { value: 'NINJAS', label: 'Ninjas' },
  { value: 'TOUS', label: 'Tous' },
];
const METHODES = [
  { value: 'CASH', label: 'Comptant' },
  { value: 'VIREMENT', label: 'Virement' },
  { value: 'CHEQUE', label: 'Chèque' },
  { value: 'CARTE', label: 'Carte' },
];

const labelCategorie = (v: string) => CATEGORIES.find((c) => c.value === v)?.label || v;
const labelDiscipline = (v: string | null) => DISCIPLINES.find((d) => d.value === v)?.label || v || '—';
const libelleArticle = (a: { nom: string; marque?: string | null; couleur?: string | null; taille?: string | null }) =>
  [a.nom, a.marque, a.couleur, a.taille ? `t. ${a.taille}` : null].filter(Boolean).join(' · ');
const fmtMontant = (n: number) => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
const selectClass = 'min-h-[44px] w-full border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red';

const FORM_VIDE = { nom: '', categorie: 'KIMONO', discipline: 'KARATE', taille: '', couleur: '', marque: '', coutAchat: '', prixVente: '', quantite: '0', seuilAlerte: '', notes: '' };

export function Inventaire() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [membres, setMembres] = useState<MembreLight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [onglet, setOnglet] = useState<'stock' | 'ventes'>('stock');
  const [filtreDiscipline, setFiltreDiscipline] = useState('TOUTES');
  const [filtreCategorie, setFiltreCategorie] = useState('TOUTES');
  const [recherche, setRecherche] = useState('');

  // Modal article (création / édition / duplication)
  const [modalArticle, setModalArticle] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = création
  const [form, setForm] = useState({ ...FORM_VIDE });
  const [saving, setSaving] = useState(false);

  // Modal vente
  const [modalVente, setModalVente] = useState<Article | null>(null);
  const [venteForm, setVenteForm] = useState({ membreId: '', rechercheMembre: '', quantite: '1', prixUnitaire: '', methode: 'CASH', note: '' });

  const load = async () => {
    setIsLoading(true);
    try {
      const [arts, vts] = await Promise.all([
        apiFetch<Article[]>('/inventaire?inclureInactifs=1'),
        apiFetch<Vente[]>('/inventaire/ventes'),
      ]);
      setArticles(arts);
      setVentes(vts);
    } catch (err: any) {
      setError(err?.message || 'Erreur de chargement');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      load();
      apiFetch<MembreLight[]>('/membres').then(setMembres).catch(() => {});
    }
  }, [user]);

  // Tous les hooks avant le garde-fou de rôle (ordre des hooks stable).
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter((a) => {
      if (filtreDiscipline !== 'TOUTES' && a.discipline !== filtreDiscipline) return false;
      if (filtreCategorie !== 'TOUTES' && a.categorie !== filtreCategorie) return false;
      if (q && !libelleArticle(a).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [articles, filtreDiscipline, filtreCategorie, recherche]);

  const membresFiltres = useMemo(() => {
    const q = venteForm.rechercheMembre.trim().toLowerCase();
    if (!q) return [];
    return membres
      .filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [membres, venteForm.rechercheMembre]);

  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const badgeStock = (a: Article) => {
    if (a.quantite <= 0) return <Badge variant="danger">{a.quantite}</Badge>;
    if (a.seuilAlerte != null && a.quantite <= a.seuilAlerte) return <Badge variant="warning">{a.quantite}</Badge>;
    return <Badge variant="success">{a.quantite}</Badge>;
  };

  const ouvrirCreation = () => {
    setEditId(null);
    setForm({ ...FORM_VIDE });
    setModalArticle(true);
  };

  const ouvrirEdition = (a: Article, duplication = false) => {
    setEditId(duplication ? null : a.id);
    setForm({
      nom: a.nom,
      categorie: a.categorie,
      discipline: a.discipline || 'TOUS',
      taille: duplication ? '' : a.taille || '',
      couleur: a.couleur || '',
      marque: a.marque || '',
      coutAchat: a.coutAchat != null ? String(a.coutAchat) : '',
      prixVente: String(a.prixVente),
      quantite: duplication ? '0' : String(a.quantite),
      seuilAlerte: a.seuilAlerte != null ? String(a.seuilAlerte) : '',
      notes: a.notes || '',
    });
    setModalArticle(true);
  };

  const sauverArticle = async () => {
    const prixVente = parseFloat(form.prixVente.replace(',', '.'));
    if (!form.nom.trim() || isNaN(prixVente) || prixVente < 0) {
      setError('Nom et prix de vente valides requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const coutAchat = form.coutAchat.trim() === '' ? null : parseFloat(form.coutAchat.replace(',', '.'));
      const body = {
        nom: form.nom.trim(),
        categorie: form.categorie,
        discipline: form.discipline,
        taille: form.taille.trim() || null,
        couleur: form.couleur.trim() || null,
        marque: form.marque.trim() || null,
        coutAchat: coutAchat != null && !isNaN(coutAchat) ? coutAchat : null,
        prixVente,
        quantite: parseInt(form.quantite, 10) || 0,
        seuilAlerte: form.seuilAlerte.trim() === '' ? null : parseInt(form.seuilAlerte, 10),
        notes: form.notes.trim() || null,
      };
      if (editId) await apiFetch(`/inventaire/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiFetch('/inventaire', { method: 'POST', body: JSON.stringify(body) });
      setModalArticle(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const ajusterStock = async (a: Article, delta: number) => {
    setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, quantite: x.quantite + delta } : x)));
    try {
      await apiFetch(`/inventaire/${a.id}/stock`, { method: 'POST', body: JSON.stringify({ delta }) });
    } catch (err: any) {
      setError(err?.message || "Erreur d'ajustement");
      load();
    }
  };

  const supprimerArticle = async (a: Article) => {
    if (!confirm(`Supprimer « ${libelleArticle(a)} » ?`)) return;
    try {
      const res = await apiFetch<{ message: string }>(`/inventaire/${a.id}`, { method: 'DELETE' });
      setInfo(res.message);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur de suppression');
    }
  };

  const chargerCatalogueKarate = async () => {
    try {
      const res = await apiFetch<{ crees: number; dejaPresents: number }>('/inventaire/seed-karate', { method: 'POST' });
      setInfo(res.crees > 0 ? `${res.crees} article(s) karaté ajouté(s) — complétez les tailles et le coût de revient.` : 'Le catalogue karaté est déjà en place.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur');
    }
  };

  const ouvrirVente = (a: Article) => {
    setModalVente(a);
    setVenteForm({ membreId: '', rechercheMembre: '', quantite: '1', prixUnitaire: String(a.prixVente), methode: 'CASH', note: '' });
  };

  const enregistrerVente = async () => {
    if (!modalVente) return;
    const quantite = parseInt(venteForm.quantite, 10);
    const prixUnitaire = parseFloat(venteForm.prixUnitaire.replace(',', '.'));
    if (!quantite || quantite < 1 || isNaN(prixUnitaire) || prixUnitaire < 0) {
      setError('Quantité et prix valides requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch<{ alerteStock?: string }>('/inventaire/ventes', {
        method: 'POST',
        body: JSON.stringify({
          articleId: modalVente.id,
          membreId: venteForm.membreId || null,
          quantite,
          prixUnitaire,
          methode: venteForm.methode || null,
          note: venteForm.note.trim() || null,
        }),
      });
      setModalVente(null);
      setInfo(res?.alerteStock ? `Vente enregistrée. ${res.alerteStock}` : 'Vente enregistrée.');
      await load();
    } catch (err: any) {
      setError(err?.message || "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const annulerVente = async (v: Vente) => {
    if (!confirm(`Annuler cette vente (${v.quantite} × ${libelleArticle(v.article)}) ? Le stock sera réajusté.`)) return;
    try {
      await apiFetch(`/inventaire/ventes/${v.id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err?.message || "Erreur d'annulation");
    }
  };

  const membreChoisi = membres.find((m) => m.id === venteForm.membreId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-cshp-black">Inventaire</h1>
          <p className="text-sm text-gray-500 mt-1">
            Kimonos, ceintures, protections… Le <strong>coût de revient est interne au club</strong> : seuls les prix de vente peuvent être montrés aux parents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={chargerCatalogueKarate} className="!min-h-0 h-10">
            <Package size={18} className="mr-1" /> Catalogue karaté
          </Button>
          <Button onClick={ouvrirCreation} className="!min-h-0 h-10">
            <Plus size={18} className="mr-1" /> Nouvel article
          </Button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
      {info && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex justify-between items-center">
          <span>{info}</span>
          <button onClick={() => setInfo('')} className="text-green-700 font-bold px-2 cursor-pointer">✕</button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setOnglet('stock')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${onglet === 'stock' ? 'bg-cshp-black text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Stock ({articles.filter((a) => a.actif).length})
        </button>
        <button
          onClick={() => setOnglet('ventes')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer ${onglet === 'ventes' ? 'bg-cshp-black text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Ventes ({ventes.length})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : onglet === 'stock' ? (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-full sm:w-56">
              <Input label="Rechercher" placeholder="Kimono, gants…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discipline</label>
              <select className={selectClass} value={filtreDiscipline} onChange={(e) => setFiltreDiscipline(e.target.value)}>
                <option value="TOUTES">Toutes</option>
                {DISCIPLINES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Catégorie</label>
              <select className={selectClass} value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)}>
                <option value="TOUTES">Toutes</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-4">Article</th>
                  <th className="py-3 px-2">Discipline</th>
                  <th className="py-3 px-2">Catégorie</th>
                  <th className="py-3 px-2 text-right" title="Coût de revient — interne club, jamais montré aux parents">Coût (interne)</th>
                  <th className="py-3 px-2 text-right">Prix de vente</th>
                  <th className="py-3 px-2 text-center">Stock</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Aucun article. Ajoutez-en un ou chargez le catalogue karaté.</td></tr>
                )}
                {visibles.map((a) => (
                  <tr key={a.id} className={`border-b border-gray-50 ${a.actif ? '' : 'opacity-45'}`}>
                    <td className="py-2.5 px-4 font-medium text-cshp-black">
                      {libelleArticle(a)}
                      {!a.actif && <span className="ml-2 text-xs text-gray-400">(désactivé)</span>}
                      {a.notes && <div className="text-xs text-gray-400 font-normal">{a.notes}</div>}
                    </td>
                    <td className="py-2.5 px-2">{labelDiscipline(a.discipline)}</td>
                    <td className="py-2.5 px-2">{labelCategorie(a.categorie)}</td>
                    <td className="py-2.5 px-2 text-right text-gray-500">{a.coutAchat != null ? fmtMontant(a.coutAchat) : <span className="text-amber-600 text-xs">à saisir</span>}</td>
                    <td className="py-2.5 px-2 text-right font-semibold">{fmtMontant(a.prixVente)}</td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => ajusterStock(a, -1)} className="p-1 rounded hover:bg-gray-100 cursor-pointer text-gray-500" title="−1 (perte, correction)"><Minus size={14} /></button>
                        {badgeStock(a)}
                        <button onClick={() => ajusterStock(a, 1)} className="p-1 rounded hover:bg-gray-100 cursor-pointer text-gray-500" title="+1 (réception)"><Plus size={14} /></button>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => ouvrirVente(a)} className="p-2 rounded-lg hover:bg-green-50 text-green-700 cursor-pointer" title="Vendre"><ShoppingCart size={16} /></button>
                        <button onClick={() => ouvrirEdition(a)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer" title="Modifier"><Pencil size={16} /></button>
                        <button onClick={() => ouvrirEdition(a, true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer" title="Dupliquer (autre taille)"><Copy size={16} /></button>
                        <button onClick={() => supprimerArticle(a)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer" title="Supprimer"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-2">Article</th>
                <th className="py-3 px-2">Acheteur</th>
                <th className="py-3 px-2 text-center">Qté</th>
                <th className="py-3 px-2 text-right">Total</th>
                <th className="py-3 px-2">Méthode</th>
                <th className="py-3 px-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {ventes.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">Aucune vente enregistrée.</td></tr>
              )}
              {ventes.map((v) => (
                <tr key={v.id} className="border-b border-gray-50">
                  <td className="py-2.5 px-4">{new Date(v.date).toLocaleDateString('fr-CA', { timeZone: 'America/Toronto' })}</td>
                  <td className="py-2.5 px-2 font-medium text-cshp-black">{libelleArticle(v.article)}{v.note && <div className="text-xs text-gray-400 font-normal">{v.note}</div>}</td>
                  <td className="py-2.5 px-2">{v.member ? `${v.member.firstName} ${v.member.lastName}` : <span className="text-gray-400">Comptoir</span>}</td>
                  <td className="py-2.5 px-2 text-center">{v.quantite}</td>
                  <td className="py-2.5 px-2 text-right font-semibold">{fmtMontant(v.prixUnitaire * v.quantite)}</td>
                  <td className="py-2.5 px-2">{METHODES.find((m) => m.value === v.methode)?.label || '—'}</td>
                  <td className="py-2.5 px-2 text-right">
                    <button onClick={() => annulerVente(v)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 cursor-pointer" title="Annuler la vente (réajuste le stock)"><Undo2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-3">
            Les ventes d'équipement ne sont <strong>jamais ajoutées automatiquement</strong> à la facture annuelle et n'entrent pas dans les revenus de cotisations des rapports.
          </p>
        </Card>
      )}

      {/* Modal article */}
      <Modal isOpen={modalArticle} onClose={() => setModalArticle(false)} title={editId ? 'Modifier l’article' : 'Nouvel article'} width="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom *" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Kimono de judo" />
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Catégorie *</label>
              <select className={selectClass} value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discipline</label>
              <select className={selectClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>
                {DISCIPLINES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <Input label="Taille" value={form.taille} onChange={(e) => setForm({ ...form, taille: e.target.value })} placeholder="140, M0, 2…" />
            <Input label="Couleur" value={form.couleur} onChange={(e) => setForm({ ...form, couleur: e.target.value })} placeholder="Bleu, blanc…" />
            <Input label="Marque" value={form.marque} onChange={(e) => setForm({ ...form, marque: e.target.value })} placeholder="Jukado, Adidas…" />
            <Input label="Coût de revient (interne club) $" inputMode="decimal" value={form.coutAchat} onChange={(e) => setForm({ ...form, coutAchat: e.target.value })} placeholder="Jamais montré aux parents" />
            <Input label="Prix de vente $ *" inputMode="decimal" value={form.prixVente} onChange={(e) => setForm({ ...form, prixVente: e.target.value })} />
            <Input label="Stock" inputMode="numeric" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} />
            <Input label="Seuil d'alerte stock" inputMode="numeric" value={form.seuilAlerte} onChange={(e) => setForm({ ...form, seuilAlerte: e.target.value })} placeholder="Optionnel" />
          </div>
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalArticle(false)}>Annuler</Button>
            <Button onClick={sauverArticle} disabled={saving}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal vente */}
      <Modal isOpen={!!modalVente} onClose={() => setModalVente(null)} title={modalVente ? `Vendre : ${libelleArticle(modalVente)}` : ''} width="lg">
        {modalVente && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Acheteur (membre) — laisser vide pour une vente comptoir</label>
              {membreChoisi ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium">{membreChoisi.firstName} {membreChoisi.lastName}</span>
                  <button onClick={() => setVenteForm({ ...venteForm, membreId: '', rechercheMembre: '' })} className="text-sm text-red-500 cursor-pointer">Changer</button>
                </div>
              ) : (
                <>
                  <input
                    className="min-h-[44px] w-full border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                    placeholder="Rechercher un membre…"
                    value={venteForm.rechercheMembre}
                    onChange={(e) => setVenteForm({ ...venteForm, rechercheMembre: e.target.value })}
                  />
                  {membresFiltres.length > 0 && (
                    <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {membresFiltres.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setVenteForm({ ...venteForm, membreId: m.id, rechercheMembre: '' })}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                        >
                          {m.firstName} {m.lastName}
                          {m.status !== 'ACTIF' && <span className="ml-2 text-xs text-gray-400">({m.status})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Quantité" inputMode="numeric" value={venteForm.quantite} onChange={(e) => setVenteForm({ ...venteForm, quantite: e.target.value })} />
              <Input label="Prix unitaire $" inputMode="decimal" value={venteForm.prixUnitaire} onChange={(e) => setVenteForm({ ...venteForm, prixUnitaire: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Méthode</label>
                <select className={selectClass} value={venteForm.methode} onChange={(e) => setVenteForm({ ...venteForm, methode: e.target.value })}>
                  {METHODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <Input label="Note" value={venteForm.note} onChange={(e) => setVenteForm({ ...venteForm, note: e.target.value })} placeholder="Optionnel" />
            <div className="p-3 bg-gray-50 rounded-lg text-sm flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-bold">{fmtMontant((parseInt(venteForm.quantite, 10) || 0) * (parseFloat(venteForm.prixUnitaire.replace(',', '.')) || 0))}</span>
            </div>
            <p className="text-xs text-gray-400">
              La vente est tracée au dossier du membre mais n'est <strong>pas ajoutée à la facture annuelle</strong> (ajout manuel si souhaité).
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalVente(null)}>Annuler</Button>
              <Button onClick={enregistrerVente} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la vente'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
