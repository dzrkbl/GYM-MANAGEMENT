import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/api';
import { formatMontant } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Plus, Edit2, Trash2, RotateCcw, ShieldAlert, ArrowUpRight, ArrowDownRight, Scale, Info, ReceiptText } from 'lucide-react';

interface Depense {
  id: string;
  label: string;
  montant: number;
  mois: number | null;
  annee: number;
  categorie: 'FIXE' | 'VARIABLE' | 'SALARIALE' | 'AUTRE';
  note?: string;
  isOverride: boolean;
  configCode?: string;
  taxable?: boolean; // TPS/TVQ récupérables (base « net ») — false pour les charges exonérées
}

interface FinancierData {
  periode: {
    mois: number;
    annee: number;
  };
  revenus: {
    brut: number;
    encaisse: number;
    enAttente: number;
    enRetard: number;
    tauxRecouvrement: number;
    taxes: {
      tpsPercue: number;
      tvqPercue: number;
      totalPercues: number;
      tpsAPayer: number;
      tvqAPayer: number;
      totalAPayer: number;
    };
    detail: any[];
  };
  charges: {
    loyer: {
      montant: number;
      isOverride: boolean;
    };
    depenses: Depense[];
    masseSalariale: number;
    totalCharges: number;
    totalChargesNet: number;
    creditsIntrants: number;
  };
  resultat: Resultat;
  resultatAutreBase: Resultat;
}

interface Resultat {
  base: 'net' | 'brut';
  revenus: number;
  charges: number;
  marge: number;
  margePct: number;
  statut: 'POSITIF' | 'DEFICIT';
  taxes: { percues: number; creditsIntrants: number; remiseARevenuQuebec: number };
}

export function Finances() {
  const { user } = useAuth();
  // Base de comparaison. « net » par défaut : c'est le bénéfice réel, celui qui
  // dit si le club gagne de l'argent. « brut » montre les mouvements du compte.
  const [base, setBase] = useState<'net' | 'brut'>('net');
  const [mois, setMois] = useState<number>(new Date().getMonth() + 1);
  const [annee, setAnnee] = useState<number>(new Date().getFullYear());
  const [modeCumulatif, setModeCumulatif] = useState<boolean>(false);
  const [data, setData] = useState<FinancierData | null>(null);
  const [rentabilite, setRentabilite] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isDepenseModalOpen, setIsDepenseModalOpen] = useState(false);
  const [editingDepense, setEditingDepense] = useState<Depense | null>(null);
  const [isLoyerModalOpen, setIsLoyerModalOpen] = useState(false);

  // Form states
  const [depenseForm, setDepenseForm] = useState({
    label: '',
    montant: '',
    moisOption: 'all', // "all" ou "current"
    categorie: 'FIXE' as 'FIXE' | 'VARIABLE' | 'SALARIALE' | 'AUTRE',
    note: '',
    taxable: true
  });
  const [loyerForm, setLoyerForm] = useState({
    montant: ''
  });

  const months = [
    { value: 1, label: 'Janvier' },
    { value: 2, label: 'Février' },
    { value: 3, label: 'Mars' },
    { value: 4, label: 'Avril' },
    { value: 5, label: 'Mai' },
    { value: 6, label: 'Juin' },
    { value: 7, label: 'Juillet' },
    { value: 8, label: 'Août' },
    { value: 9, label: 'Septembre' },
    { value: 10, label: 'Octobre' },
    { value: 11, label: 'Novembre' },
    { value: 12, label: 'Décembre' }
  ];

  const years = Array.from({ length: 7 }, (_, i) => 2024 + i);

  const fetchFinancialReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<FinancierData>(`/rapports/financier?mois=${mois}&annee=${annee}&cumul=${modeCumulatif}&base=${base}`);
      // Projection annuelle à effectif constant (indépendante du mois consulté).
      apiFetch<any>(`/rapports/rentabilite?base=${base}`).then(setRentabilite).catch(() => {});
      setData(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Erreur lors du chargement des rapports financiers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialReport();
  }, [mois, annee, modeCumulatif, base]);

  const openAddDepense = () => {
    setEditingDepense(null);
    setDepenseForm({
      label: '',
      montant: '',
      moisOption: 'current',
      categorie: 'FIXE',
      note: '',
      taxable: true
    });
    setIsDepenseModalOpen(true);
  };

  const openEditDepense = (depense: Depense) => {
    setEditingDepense(depense);
    setDepenseForm({
      label: depense.label,
      montant: depense.montant.toString(),
      moisOption: depense.mois === null ? 'all' : 'current',
      categorie: depense.categorie,
      note: depense.note || '',
      taxable: depense.taxable !== false
    });
    setIsDepenseModalOpen(true);
  };

  const handleDeleteDepense = async (id: string, label: string) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer la dépense "${label}" ?`)) return;

    try {
      await apiFetch(`/depenses/${id}`, { method: 'DELETE' });
      fetchFinancialReport();
    } catch (err: any) {
      alert(err.message || 'Erreur de suppression');
    }
  };

  const handleSaveDepense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMontant = parseFloat(depenseForm.montant);
    if (!depenseForm.label || isNaN(parsedMontant) || parsedMontant < 0) {
      alert('Veuillez remplir correctement les informations de la dépense.');
      return;
    }

    const payload = {
      label: depenseForm.label,
      montant: parsedMontant,
      mois: depenseForm.moisOption === 'all' ? null : mois,
      annee: annee,
      categorie: depenseForm.categorie,
      note: depenseForm.note || null,
      taxable: depenseForm.taxable
    };

    try {
      if (editingDepense) {
        await apiFetch(`/depenses/${editingDepense.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/depenses`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      setIsDepenseModalOpen(false);
      fetchFinancialReport();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’enregistrement');
    }
  };

  const handleOverrideLoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedMontant = parseFloat(loyerForm.montant);
    if (isNaN(parsedMontant) || parsedMontant < 0) {
      alert('Veuillez saisir un montant de loyer valide.');
      return;
    }

    try {
      await apiFetch(`/depense-configs/loyer/override`, {
        method: 'POST',
        body: JSON.stringify({
          annee: annee,
          montant: parsedMontant
        })
      });
      setIsLoyerModalOpen(false);
      fetchFinancialReport();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la configuration du loyer');
    }
  };

  const handleResetLoyer = async () => {
    if (!window.confirm(`Réinitialiser le loyer au calcul automatique (+2%/an) ?`)) return;

    try {
      await apiFetch(`/depense-configs/loyer/override/${annee}`, {
        method: 'DELETE'
      });
      fetchFinancialReport();
    } catch (err: any) {
      alert(err.message || 'Erreur de réinitialisation');
    }
  };

  const getRecoveryRateColor = (rate: number) => {
    if (rate >= 90) return { bg: 'bg-green-100', text: 'text-green-800', bar: 'bg-green-500' };
    if (rate >= 70) return { bg: 'bg-yellow-100', text: 'text-yellow-800', bar: 'bg-yellow-500' };
    return { bg: 'bg-red-100', text: 'text-red-800', bar: 'bg-red-500' };
  };

  // Page financière réservée aux administrateurs (les endpoints sont aussi protégés côté serveur).
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 pb-12" id="finances-module">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-cshp-black">Module Financier</h1>
          <p className="text-sm text-cshp-gray">Visualisez, analysez et gérez la facturation, les charges et la rentabilité du club.</p>
          <Link
            to="/admin/remboursements"
            className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-cshp-red hover:underline"
          >
            <ReceiptText size={16} /> Dépenses payées de votre poche → Remboursements
          </Link>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm border border-gray-100 p-2">
          <select
            value={mois}
            onChange={(e) => setMois(parseInt(e.target.value, 10))}
            className="border-0 bg-transparent text-sm font-semibold text-cshp-black focus:ring-0 cursor-pointer outline-none"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <span className="text-gray-300">|</span>

          <select
            value={annee}
            onChange={(e) => setAnnee(parseInt(e.target.value, 10))}
            className="border-0 bg-transparent text-sm font-semibold text-cshp-black focus:ring-0 cursor-pointer outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-3">
          <ShieldAlert size={20} />
          <span className="font-medium">{error}</span>
        </div>
      ) : data ? (
        <>
          {/* Toggle for Cumulative view */}
          <div className="flex items-center gap-3 mb-6 bg-white p-3 rounded-xl border border-gray-100 shadow-sm w-fit">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Vue des impayés :</span>
            <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-100">
              <button
                onClick={() => setModeCumulatif(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  !modeCumulatif
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-950 hover:bg-gray-100'
                }`}
              >
                📅 Période seulement
              </button>
              <button
                onClick={() => setModeCumulatif(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  modeCumulatif
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-950 hover:bg-gray-100'
                }`}
              >
                📊 Cumul des impayés
              </button>
            </div>
          </div>

          {/* Main Grid: Card 1, 2, 3, 4 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* CARD 1: REVENUS */}
            <Card className="p-6 flex flex-col justify-between" id="card-revenues">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-cshp-gray uppercase tracking-wider">État des encaissements</h3>
                  <Badge variant={data.revenus.tauxRecouvrement >= 90 ? 'success' : data.revenus.tauxRecouvrement >= 70 ? 'warning' : 'danger'}>
                    Recouvrement
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-green-50/50 p-4 rounded-xl border border-green-100/50">
                    <span className="text-xs text-green-700 font-semibold block mb-1">✅ Encaissé</span>
                    <span className="text-lg md:text-xl font-bold text-green-800">{formatMontant(data.revenus.encaisse)}</span>
                  </div>
                  <div className="bg-yellow-50/50 p-4 rounded-xl border border-yellow-105/50">
                    <span className="text-xs text-yellow-700 font-semibold block mb-1">🕐 En attente</span>
                    <span className="text-lg md:text-xl font-bold text-yellow-800">{formatMontant(data.revenus.enAttente)}</span>
                  </div>
                  <div className="bg-red-50/50 p-4 rounded-xl border border-red-100/50">
                    <span className="text-xs text-red-700 font-semibold block mb-1">⚠️ En retard</span>
                    <span className="text-lg md:text-xl font-bold text-red-800">{formatMontant(data.revenus.enRetard)}</span>
                    <p className="text-[10px] text-gray-400 mt-1 lines-clamp-2">
                      {modeCumulatif
                        ? `Tous les impayés jusqu'au 31 ${months.find(m => m.value === mois)?.label || ''}`
                        : `Impayés prévus en ${months.find(m => m.value === mois)?.label || ''} seulement`
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-cshp-gray font-medium">Taux global de recouvrement</span>
                  <span className={`font-bold ${data.revenus.tauxRecouvrement >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {data.revenus.tauxRecouvrement.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${getRecoveryRateColor(data.revenus.tauxRecouvrement).bar}`}
                    style={{ width: `${Math.min(data.revenus.tauxRecouvrement, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xxs text-cshp-gray mt-2">
                  <span>Revenus bruts prévus de la période : {formatMontant(data.revenus.brut)}</span>
                </div>
              </div>
            </Card>

            {/* CARD 2: TAXES (DIV DIVISEUR 1.14975 : INCLUSES DANS LES MONTANTS) */}
            <Card className="p-6 flex flex-col justify-between" id="card-taxes">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-cshp-gray uppercase tracking-wider">État des Taxes (TPS 5% & TVQ 9.975%)</h3>
                  <Badge variant="neutral">Calcul fiscal</Badge>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded-lg">
                    <span className="text-cshp-gray">TPS Perçue (5% inclus)</span>
                    <span className="font-semibold text-cshp-black">{formatMontant(data.revenus.taxes.tpsPercue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded-lg">
                    <span className="text-cshp-gray">TVQ Perçue (9.975% inclus)</span>
                    <span className="font-semibold text-cshp-black">{formatMontant(data.revenus.taxes.tvqPercue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm p-2 border-t border-dashed border-gray-200">
                    <span className="text-cshp-black font-medium">Total taxes collectées</span>
                    <span className="font-bold text-cshp-black">{formatMontant(data.revenus.taxes.totalPercues)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Scale size={18} className="text-orange-600" />
                    <span className="text-sm font-bold text-orange-850">Chiffres de remise estimés</span>
                  </div>
                  <span className="text-sm font-extrabold text-orange-900">{formatMontant(data.revenus.taxes.totalAPayer)}</span>
                </div>
                <div className="flex gap-1.5 items-start text-xxs text-orange-700">
                  <Info size={12} className="shrink-0 mt-0.5" />
                  <span>Ces montants sont inclus dans vos encaissements. Préparez la provision relative aux déclarations de taxes trimestrielles ou annuelles.</span>
                </div>
              </div>
            </Card>

            {/* CARD 3: CHARGES & DEPENSES */}
            <Card className="p-6 lg:col-span-2" id="card-charges">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-cshp-gray uppercase tracking-wider">Charges d&apos;exploitation</h3>
                  <p className="text-xs text-cshp-gray">Dépenses fixes, loyer dynamique et salaires de la période.</p>
                </div>
                <Button onClick={openAddDepense} variant="primary" className="h-10 text-xs px-3 min-h-0 flex items-center gap-1.5 self-stretch sm:self-auto">
                  <Plus size={16} /> Ajouter une charge
                </Button>
              </div>

              {/* Loyer dynamically configured */}
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl bg-white overflow-hidden mb-6">
                <div className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-bold text-cshp-black text-sm">🏢 Loyer (bail et taxes foncières)</span>
                    {data.charges.loyer.isOverride ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold text-orange-800 bg-orange-100 rounded-full inline-flex">
                        Compte forcé manuellement
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold text-green-800 bg-green-100 rounded-full inline-flex">
                        Automatisé +2%/an
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-extrabold text-sm text-cshp-black">
                      {formatMontant(data.charges.loyer.montant)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setLoyerForm({ montant: data.charges.loyer.montant.toString() });
                          setIsLoyerModalOpen(true);
                        }}
                        className="p-1.5 text-cshp-gray hover:text-cshp-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                        title="Forcer un montant pour le loyer"
                      >
                        <Edit2 size={14} />
                      </button>
                      {data.charges.loyer.isOverride && (
                        <button
                          onClick={handleResetLoyer}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Restaurer calcul automatique"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Masse Salariale */}
                <div className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors bg-gray-50/20">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-bold text-cshp-black text-sm">👤 Masse Salariale</span>
                    <span className="px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-100 rounded-full inline-flex">
                      Système de paie
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-extrabold text-sm text-cshp-black">
                      {formatMontant(data.charges.masseSalariale)}
                    </span>
                    <span className="text-[10px] text-cshp-gray italic select-none">Lecture seule</span>
                  </div>
                </div>

                {/* Dépenses de la base */}
                {data.charges.depenses.length === 0 ? (
                  <div className="p-4 text-center text-xs text-cshp-gray italic">
                    Aucune autre dépense d&apos;exploitation saisie sur cette période.
                  </div>
                ) : (
                  data.charges.depenses.map((dep) => (
                    <div key={dep.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-cshp-black">{dep.label}</span>
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                            dep.categorie === 'FIXE' ? 'bg-indigo-100 text-indigo-800' :
                            dep.categorie === 'VARIABLE' ? 'bg-orange-100 text-orange-800' : 'bg-gray-150 text-gray-700'
                          }`}>
                            {dep.categorie}
                          </span>
                          {dep.mois === null && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-teal-100 text-teal-800 rounded">
                              Chaque mois (×12/an)
                            </span>
                          )}
                          {dep.taxable === false && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-200 text-gray-700 rounded" title="Aucun crédit de TPS/TVQ n'est calculé sur cette charge (base « net »)">
                              Exonérée de taxes
                            </span>
                          )}
                        </div>
                        {dep.note && <span className="text-xs text-cshp-gray select-text">{dep.note}</span>}
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-sm text-cshp-black">
                          {formatMontant(dep.montant)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditDepense(dep)}
                            className="p-1.5 text-cshp-gray hover:text-cshp-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteDepense(dep.id, dep.label)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-cshp-black text-white p-4 rounded-xl flex justify-between items-center">
                <span className="text-sm font-bold uppercase tracking-wider">Total des charges d&apos;exploitation :</span>
                <span className="text-xl font-black">{formatMontant(data.charges.totalCharges)}</span>
              </div>
            </Card>

            {/* CARD 4: RESULTATS (RENTABILITÉ) */}
            <Card className="p-6 lg:col-span-2 flex flex-col justify-between" id="card-results">
              <div>
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <h3 className="text-sm font-bold text-cshp-gray uppercase tracking-wider">Rentabilité & Marge Opérationnelle</h3>
                  <div className="flex items-center gap-2">
                    {/* Une seule base pour les DEUX membres de la soustraction.
                        Basculer change les deux à la fois, jamais un seul. */}
                    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                      {([['net', 'Net'], ['brut', 'Brut']] as const).map(([code, label]) => (
                        <button
                          key={code}
                          onClick={() => setBase(code)}
                          className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                            base === code ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                          title={code === 'net'
                            ? 'Hors taxes des deux côtés : le bénéfice réel'
                            : 'Taxes incluses des deux côtés : les mouvements du compte'}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Badge variant={data.resultat.statut === 'POSITIF' ? 'success' : 'danger'}>
                      {data.resultat.statut === 'POSITIF' ? 'Bénéficiaire' : 'Déficit'}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-5">
                  {base === 'net'
                    ? 'Revenus ET charges hors taxes : ce qui reste vraiment au club.'
                    : 'Revenus ET charges taxes incluses : les mouvements du compte. Attention, les taxes perçues ne vous appartiennent pas.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm divide-y md:divide-y-0 md:divide-x divide-gray-100 mb-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pr-0 md:pr-6 pt-1">
                      <span className="text-cshp-gray font-medium flex items-center gap-1.5">
                        <ArrowUpRight size={16} className="text-green-600 shrink-0" />
                        Revenus encaissés {base === 'net' ? '(hors taxes)' : '(taxes incluses)'}
                      </span>
                      <span className="font-bold text-cshp-black">{formatMontant(data.resultat.revenus)}</span>
                    </div>
                    <div className="flex justify-between items-center pr-0 md:pr-6">
                      <span className="text-cshp-gray font-medium flex items-center gap-1.5">
                        <ArrowDownRight size={16} className="text-red-600 shrink-0" />
                        Charges {base === 'net' ? '(hors taxes récupérables)' : '(taxes incluses)'}
                      </span>
                      <span className="font-bold text-cshp-black">-{formatMontant(data.resultat.charges)}</span>
                    </div>
                  </div>

                  <div className="space-y-4 pl-0 md:pl-6 pt-4 md:pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-cshp-gray font-medium">{base === 'net' ? 'Bénéfice réel' : 'Solde des mouvements'}</span>
                      <span className={`font-black text-lg ${data.resultat.marge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMontant(data.resultat.marge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-cshp-gray font-medium">Marge Opérationnelle</span>
                      <span className={`font-extrabold text-sm ${data.resultat.margePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.resultat.margePct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* La remise de taxes : elle vaut EXACTEMENT l'écart entre les
                    deux bases, et c'est une sortie d'argent bien réelle. */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-1.5 mb-5">
                  <div className="flex justify-between text-gray-600">
                    <span>TPS et TVQ perçues sur les encaissements</span>
                    <span className="font-semibold">{formatMontant(data.resultat.taxes.percues)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Moins les crédits sur les intrants (charges taxables)</span>
                    <span className="font-semibold">-{formatMontant(data.resultat.taxes.creditsIntrants)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-cshp-black pt-1.5 border-t border-slate-200">
                    <span>À remettre à Revenu Québec</span>
                    <span>{formatMontant(data.resultat.taxes.remiseARevenuQuebec)}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 pt-1">
                    Cette remise est exactement l'écart entre les deux bases : en{' '}
                    {base === 'net' ? 'brut' : 'net'}, le solde afficherait{' '}
                    {formatMontant(data.resultatAutreBase.marge)}.
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-xl flex items-center justify-between border ${
                data.resultat.statut === 'POSITIF' 
                  ? 'bg-green-50 border-green-150 text-green-800' 
                  : 'bg-red-50 border-red-150 text-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Scale size={20} className={data.resultat.statut === 'POSITIF' ? 'text-green-600' : 'text-red-600'} />
                  <span className="font-bold text-sm">
                    {data.resultat.statut === 'POSITIF' 
                      ? 'Rentabilité opérationnelle validée.' 
                      : 'Attention : les charges d’exploitation dépassent les revenus opérationnels sur cette période.'}
                  </span>
                </div>
              </div>
            </Card>

            {/* RENTABILITÉ À EFFECTIF CONSTANT (projection annuelle) */}
            {rentabilite && (
              <Card className="p-6 lg:col-span-2" id="card-rentabilite">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-cshp-gray uppercase tracking-wider">Rentabilité à effectif constant (projection 12 mois)</h3>
                  <Badge variant={rentabilite.resultatPrudent >= 0 ? 'success' : 'danger'}>
                    {rentabilite.resultatPrudent >= 0 ? 'Rentable' : 'Déficitaire'}
                  </Badge>
                </div>
                <p className="text-xs text-cshp-gray mb-5">
                  Hypothèse : les <strong>{rentabilite.membresPayants}</strong> membres actifs payants d'aujourd'hui restent et renouvellent aux mêmes prix.
                  Revenus et charges {base === 'net' ? 'hors taxes' : 'taxes incluses'} — la même base des deux côtés.
                  Charges actuelles projetées sur 12 mois. Ventes d'équipement et frais de fédération exclus.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-[11px] uppercase font-bold text-cshp-gray block">Revenu annuel ({base})</span>
                    <span className="text-lg font-black text-cshp-black">{formatMontant(rentabilite.revenusBase ?? rentabilite.revenuAnnuelNet)}</span>
                    <span className="text-[11px] text-cshp-gray block">
                      {base === 'net'
                        ? `${formatMontant(rentabilite.revenuAnnuelBrut)} taxes incluses`
                        : `${formatMontant(rentabilite.revenuAnnuelNet)} hors taxes`}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-[11px] uppercase font-bold text-cshp-gray block">Charges annuelles</span>
                    {/* MÊME base que le résultat : afficher les charges brutes à
                        côté d'un résultat net remettrait l'incohérence corrigée. */}
                    <span className="text-lg font-black text-cshp-black">
                      {formatMontant((rentabilite.chargesBase ?? rentabilite.chargesAnnuelles) + rentabilite.ponctuelles12Mois)}
                    </span>
                    <span className="text-[11px] text-cshp-gray block">
                      dont {formatMontant(rentabilite.ponctuelles12Mois)} ponctuelles
                      {base === 'net' && rentabilite.creditsIntrantsAnnuels
                        ? ` · ${formatMontant(rentabilite.creditsIntrantsAnnuels)} de crédits déduits`
                        : ''}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-[11px] uppercase font-bold text-cshp-gray block">Résultat projeté</span>
                    <span className={`text-lg font-black ${rentabilite.resultatPrudent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatMontant(rentabilite.resultatPrudent)}</span>
                    <span className="text-[11px] text-cshp-gray block">marge {rentabilite.margePct.toFixed(1)} %</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-[11px] uppercase font-bold text-cshp-gray block">Seuil de rentabilité</span>
                    <span className="text-lg font-black text-cshp-black">≈ {rentabilite.membresNecessaires ?? '—'} membres</span>
                    <span className="text-[11px] text-cshp-gray block">
                      à {formatMontant(rentabilite.revenuMoyenParMembre ?? rentabilite.revenuMoyenNetParMembre)}/membre/an {base}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="text-[11px] uppercase font-bold text-cshp-gray mb-2">Revenu annualisé par discipline (taxes incluses)</h4>
                    <div className="space-y-1.5">
                      {rentabilite.parSport.map((s: any) => (
                        <div key={s.sport} className="flex justify-between items-center bg-white border border-gray-100 rounded-lg px-3 py-1.5">
                          <span className="font-semibold text-cshp-black">{s.sport} <span className="text-cshp-gray font-normal">({s.membres} membres)</span></span>
                          <span className="font-bold">{formatMontant(s.revenuAnnuelBrut)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] uppercase font-bold text-cshp-gray mb-2">Charges mensuelles actuelles</h4>
                    <div className="space-y-1.5">
                      <div className="flex justify-between bg-white border border-gray-100 rounded-lg px-3 py-1.5"><span>Masse salariale</span><span className="font-bold">{formatMontant(rentabilite.masseSalarialeMensuelle)}</span></div>
                      <div className="flex justify-between bg-white border border-gray-100 rounded-lg px-3 py-1.5"><span>Loyer</span><span className="font-bold">{formatMontant(rentabilite.loyerMensuel)}</span></div>
                      <div className="flex justify-between bg-white border border-gray-100 rounded-lg px-3 py-1.5"><span>Autres charges récurrentes</span><span className="font-bold">{formatMontant(rentabilite.depensesRecurrentesMensuelles)}</span></div>
                    </div>
                    {rentabilite.sansContrat?.length > 0 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                        ⚠️ {rentabilite.sansContrat.length} membre(s) actif(s) sans contrat chiffré (comptés à 0 $) : {rentabilite.sansContrat.slice(0, 6).join(', ')}{rentabilite.sansContrat.length > 6 ? '…' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

          </div>

          {/* DÉPENSE MODAL (ADD / EDIT) */}
          <Modal
            isOpen={isDepenseModalOpen}
            onClose={() => setIsDepenseModalOpen(false)}
            title={editingDepense ? 'Modifier la charge' : 'Ajouter une charge'}
          >
            <form onSubmit={handleSaveDepense} className="space-y-4">
              <div>
                <Input
                  label="Libellé de la charge *"
                  type="text"
                  placeholder="ex: Location automobile, Hydro-Québec..."
                  value={depenseForm.label}
                  onChange={(e) => setDepenseForm({ ...depenseForm, label: e.target.value })}
                  required
                />
              </div>

              <div>
                <Input
                  label="Montant ($) *"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={depenseForm.montant}
                  onChange={(e) => setDepenseForm({ ...depenseForm, montant: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-cshp-black mb-1">
                  Type de récurrence *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-cshp-black cursor-pointer">
                    <input
                      type="radio"
                      name="moisOption"
                      checked={depenseForm.moisOption === 'current'}
                      onChange={() => setDepenseForm({ ...depenseForm, moisOption: 'current' })}
                    />
                    Mensuelle ({months.find(m => m.value === mois)?.label})
                  </label>
                  <label className="flex items-center gap-2 text-sm text-cshp-black cursor-pointer">
                    <input
                      type="radio"
                      name="moisOption"
                      checked={depenseForm.moisOption === 'all'}
                      onChange={() => setDepenseForm({ ...depenseForm, moisOption: 'all' })}
                    />
                    Récurrente — retranchée CHAQUE MOIS (×12 sur l&apos;année)
                  </label>
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠️ Pour une charge annuelle (ex. assurance 2 400 $/an), saisissez le
                    montant mensuel (200 $) ici, ou le montant complet sur un mois précis.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-cshp-black mb-1">
                  Catégorie de charge
                </label>
                <select
                  value={depenseForm.categorie}
                  onChange={(e) => setDepenseForm({ ...depenseForm, categorie: e.target.value as any })}
                  className="w-full h-11 border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-cshp-red"
                >
                  <option value="FIXE">FIXE (Loyer, Assurances, etc.)</option>
                  <option value="VARIABLE">VARIABLE (Hydro, Matériel, etc.)</option>
                  <option value="SALARIALE">SALARIALE (Prestataires, etc.)</option>
                  <option value="AUTRE">AUTRE (Frais divers, etc.)</option>
                </select>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="flex items-start gap-2 text-sm text-cshp-black cursor-pointer">
                  <input
                    type="checkbox"
                    checked={depenseForm.taxable}
                    onChange={(e) => setDepenseForm({ ...depenseForm, taxable: e.target.checked })}
                    className="mt-0.5 accent-cshp-red"
                  />
                  <span>
                    <span className="font-semibold">Charge taxable (TPS/TVQ incluses dans le montant)</span>
                    <span className="block text-xs text-cshp-gray mt-0.5">
                      Décochez pour une charge EXONÉRÉE de taxes (assurances, salaires…) :
                      la base « net » ne calcule des crédits de TPS/TVQ que sur les charges taxables.
                    </span>
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-semibold text-cshp-black mb-1">
                  Note facultative
                </label>
                <textarea
                  className="w-full min-h-[80px] border border-gray-300 rounded-lg p-3 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-cshp-red resize-none"
                  placeholder="Ajouter des notes explicatives sur la charge..."
                  value={depenseForm.note}
                  onChange={(e) => setDepenseForm({ ...depenseForm, note: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDepenseModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary">
                  Enregistrer
                </Button>
              </div>
            </form>
          </Modal>

          {/* LOYER OVERRIDE MODAL */}
          <Modal
            isOpen={isLoyerModalOpen}
            onClose={() => setIsLoyerModalOpen(false)}
            title={`Forcer le montant du loyer pour ${annee}`}
          >
            <form onSubmit={handleOverrideLoyer} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-150 text-amber-950 rounded-lg text-xs leading-relaxed">
                ✏️ La configuration du loyer de base s&apos;adapte automatiquement chaque année (+2%/an). En overrideant manuellement, vous fixez un montant unique pour toute l&apos;année {annee}.
              </div>

              <div>
                <Input
                  label={`Nouveau montant de calcul pour ${annee} ($) *`}
                  type="number"
                  step="0.01"
                  placeholder="ex: 5800.00"
                  value={loyerForm.montant}
                  onChange={(e) => setLoyerForm({ ...loyerForm, montant: e.target.value })}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsLoyerModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary">
                  Sauvegarder l&apos;override
                </Button>
              </div>
            </form>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
