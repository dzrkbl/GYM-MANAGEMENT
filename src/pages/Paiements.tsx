import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDate, formatDateLocal, todayLocalISO } from '../lib/format';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Navigate } from 'react-router-dom';
import { Modal } from '../components/ui/Modal';
import { useSections } from '../hooks/useSections';

export function Paiements() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If coach, strictly forbidden
  if (user?.role === 'COACH') {
    return <Navigate to="/dashboard" replace />;
  }

  const { codes, getLabel } = useSections();
  const SECTIONS = ["TOUS", ...codes];
  const STATUSES = [
    { value: 'TOUS', label: 'Tous' },
    { value: 'PAYÉ', label: 'Payé' },
    { value: 'EN_RETARD', label: 'En retard' },
    { value: 'EN_ATTENTE', label: 'En attente' }
  ];

  const now = new Date();
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Mois précédent par arithmétique de chaîne : `setMonth(-1)` un 29/30/31
  // débordait et renvoyait le mois COURANT (les deux boutons devenaient identiques).
  const [cy, cm] = currentMonthValue.split('-').map(Number);
  const prevMonthValue = cm === 1 ? `${cy - 1}-12` : `${cy}-${String(cm - 1).padStart(2, '0')}`;

  const PERIODS = [
    { value: currentMonthValue, label: 'Ce mois' },
    { value: prevMonthValue, label: 'Mois précédent' },
    { value: 'ALL', label: 'Tout' }
  ];

  // Filtre initial via l'URL (?statut=EN_RETARD depuis la carte « Retards » du tableau de bord).
  const [searchParams] = useSearchParams();
  const statutInitial = searchParams.get('statut');

  const [periodFilter, setPeriodFilter] = useState(currentMonthValue);
  const [sectionFilter, setSectionFilter] = useState(user?.role === 'SECTION_MANAGER' ? (user.section ?? 'TOUS') : 'TOUS');
  const [statusFilter, setStatusFilter] = useState(
    statutInitial && ['PAYÉ', 'EN_RETARD', 'EN_ATTENTE'].includes(statutInitial) ? statutInitial : 'TOUS'
  );
  
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // TOAST
  const [toastMsg, setToastMsg] = useState('');

  // Modal State
  const [payModal, setPayModal] = useState<{ open: boolean; versementId: string | null; amount: number }>({ open: false, versementId: null, amount: 0 });
  const [payDate, setPayDate] = useState(todayLocalISO()); // aujourd'hui par défaut
  const [payMethod, setPayMethod] = useState('COMPTANT');

  useEffect(() => {
    fetchPayments();
  }, [periodFilter, sectionFilter, statusFilter]);

  async function fetchPayments() {
    setIsLoading(true);
    setError('');
    try {
      let url = '/paiements?';
      const params = new URLSearchParams();
      if (statusFilter !== 'TOUS') params.append('status', statusFilter);
      if (sectionFilter !== 'TOUS') params.append('section', sectionFilter);
      if (periodFilter !== 'ALL') params.append('month', periodFilter);
      
      const data = await apiFetch<any[]>(url + params.toString());
      setPayments(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des paiements');
    } finally {
      setIsLoading(false);
    }
  }

  const openPayModal = (id: string, amount: number) => {
    setPayModal({ open: true, versementId: id, amount });
    setPayDate(todayLocalISO());
    setPayMethod('COMPTANT');
  };

  const handleConfirmPay = async () => {
    if (!payModal.versementId) return;

    const { versementId, amount } = payModal;
    
    setPayModal({ open: false, versementId: null, amount: 0 });

    const previousPayments = [...payments];
    
    // Optimistic update
    setPayments(prev => prev.map(p => {
      if (p.id === versementId) {
        return { ...p, status: 'PAYÉ', paidDate: payDate };
      }
      return p;
    }));

    try {
      // Même endpoint que la fiche membre : accessible aux gestionnaires de
      // section (l'ancien /paiements/:id/payer était réservé ADMIN, ce qui
      // faisait échouer le bouton pour eux après une mise à jour optimiste).
      await apiFetch(`/versements/${versementId}/payer`, {
        method: 'PUT',
        body: JSON.stringify({
          datePaiement: payDate,
          methodePaiement: payMethod
        })
      });
      setToastMsg(`Paiement de ${formatMontant(amount)} confirmé`);
      setTimeout(() => setToastMsg(''), 3000);
      fetchPayments();
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la confirmation');
      setPayments(previousPayments); // rollback
    }
  };

  // Résumé de la sélection :
  //  - Encaissé = argent réellement REÇU pendant le mois consulté (datePaiement),
  //    pas les échéances du mois (l'ancien calcul confondait « dû » et « reçu »).
  //  - En retard = tous les impayés échus visibles (la vue « Ce mois » inclut
  //    ceux des mois précédents, envoyés par le serveur).
  const summary = useMemo(() => {
    const moisSel = periodFilter !== 'ALL' ? periodFilter : null;
    let encaissé = 0;
    let attente = 0;
    let retard = 0;

    payments.forEach(p => {
      if (p.status === 'PAYÉ') {
        if (!moisSel || String(p.paidDate || '').slice(0, 7) === moisSel) encaissé += p.amount;
      }
      if (p.status === 'EN_ATTENTE') attente += p.amount;
      if (p.status === 'EN_RETARD') retard += p.amount;
    });

    return { encaissé, attente, retard };
  }, [payments, periodFilter]);

  // Tri : 1. EN_RETARD (le plus ancien en premier — le plus urgent),
  //       2. EN_ATTENTE (prochaine échéance en premier),
  //       3. PAYÉ (le plus récent en premier).
  const sortedPayments = useMemo(() => {
    const list = [...payments];

    const getStatusWeight = (status: string) => {
      if (status === 'EN_RETARD') return 1;
      if (status === 'EN_ATTENTE') return 2;
      return 3;
    };

    list.sort((a, b) => {
      const wA = getStatusWeight(a.status);
      const wB = getStatusWeight(b.status);
      if (wA !== wB) return wA - wB; // Sort by status group

      if (a.status === 'PAYÉ') {
        return new Date(b.paidDate || b.dueDate).getTime() - new Date(a.paidDate || a.dueDate).getTime();
      }
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return list;
  }, [payments]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Paiements</h1>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
        
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(period => (
            <button
              key={period.value}
              onClick={() => setPeriodFilter(period.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodFilter === period.value 
                  ? 'bg-cshp-black text-white' 
                  : 'bg-gray-100 text-cshp-gray hover:bg-gray-200'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
          {user?.role !== 'SECTION_MANAGER' && (
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map(sec => (
                <button
                  key={sec}
                  onClick={() => setSectionFilter(sec)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    sectionFilter === sec 
                      ? 'bg-cshp-black text-white' 
                      : 'bg-gray-100 text-cshp-gray hover:bg-gray-200'
                  }`}
                >
                  {sec === 'TOUS' ? 'Tous' : getLabel(sec)}
                </button>
              ))}
            </div>
          )}
          
          <div className="w-px bg-gray-200 hidden md:block"></div>
          
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(stat => (
              <button
                key={stat.value}
                onClick={() => setStatusFilter(stat.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === stat.value 
                    ? 'bg-cshp-black text-white' 
                    : 'bg-gray-100 text-cshp-gray hover:bg-gray-200'
                }`}
              >
                {stat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="sticky top-[16px] md:top-4 z-20 bg-white p-4 rounded-xl shadow-md border border-gray-200 flex flex-col md:flex-row gap-4 justify-between items-center whitespace-nowrap">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-cshp-gray uppercase tracking-wider mb-1">Résumé de la sélection</span>
          <div className="flex gap-4 md:gap-8 overflow-x-auto text-sm md:text-base">
            <div>
              <span className="text-cshp-gray mr-2">{periodFilter === 'ALL' ? 'Encaissé (tout) :' : 'Reçu ce mois :'}</span>
              <span className="font-bold text-green-600">{formatMontant(summary.encaissé)}</span>
            </div>
            <div>
              <span className="text-cshp-gray mr-2">À venir :</span>
              <span className="font-bold text-yellow-600">{formatMontant(summary.attente)}</span>
            </div>
            <div>
              <span className="text-cshp-gray mr-2">{periodFilter === currentMonthValue || periodFilter === 'ALL' ? 'En retard (total) :' : 'En retard :'}</span>
              <span className="font-bold text-cshp-red">{formatMontant(summary.retard)} 🔴</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
           <div className="p-8 flex justify-center"><Spinner /></div>
        ) : error ? (
           <div className="p-6 text-red-600">{error}</div>
        ) : sortedPayments.length === 0 ? (
           <div className="p-12 text-center flex flex-col items-center">
             <span className="text-4xl mb-4">💸</span>
             <p className="text-cshp-gray font-medium text-lg">Aucun paiement trouvé</p>
             <p className="text-sm text-gray-400 mt-1">pour ces critères</p>
             <button 
               onClick={() => {
                 setPeriodFilter(currentMonthValue);
                 setSectionFilter(user?.role === 'SECTION_MANAGER' ? (user.section ?? 'TOUS') : 'TOUS');
                 setStatusFilter('TOUS'); 
               }}
               className="mt-6 text-cshp-red hover:text-red-700 font-semibold"
             >
               Réinitialiser les filtres
             </button>
           </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedPayments.map(p => (
              <li 
                key={p.id} 
                className={`p-4 transition-colors hover:bg-gray-50 flex flex-col md:flex-row justify-between md:items-center gap-4 cursor-pointer cursor-default ${p.status === 'EN_RETARD' ? 'bg-red-50/30' : ''}`}
                onClick={(e) => {
                  // Prevent navigation if click was on action button
                  if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                    navigate(`/membres/${p.memberId}`);
                  }
                }}
              >
                <div>
                  <h3 className="font-bold text-cshp-black hover:text-cshp-red transition-colors inline-flex cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/membres/${p.memberId}`); }}>
                    {p.member?.lastName} {p.member?.firstName}
                  </h3>
                  <div className="text-sm text-cshp-gray mt-1">
                    {getLabel(p.section || '')}
                  </div>
                  <div className="text-sm text-cshp-black mt-2 md:mt-1 flex items-center gap-2">
                    <span className="font-bold text-base">{formatMontant(p.amount)}</span>
                    {p.status === 'PAYÉ' && <Badge variant="success">✅ Payé le {formatDateLocal(p.paidDate || p.dueDate)}</Badge>}
                    {p.status === 'EN_ATTENTE' && <Badge variant="warning">⏳ En attente</Badge>}
                    {p.status === 'EN_RETARD' && <Badge variant="danger">🔴 En retard</Badge>}
                  </div>
                  {p.status !== 'PAYÉ' && (
                    <div className="text-xs text-cshp-gray mt-1">
                      Dû le {formatDate(p.dueDate)}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {(p.status === 'EN_RETARD' || p.status === 'EN_ATTENTE') && (
                    <button 
                      onClick={() => openPayModal(p.id, p.amount)}
                      className="bg-cshp-black hover:bg-gray-800 text-white font-medium text-sm py-2 px-4 rounded-lg shadow-sm transition-all active:scale-95"
                    >
                      Marquer comme payé
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-800 text-white px-4 py-3 rounded-lg shadow-xl font-medium animate-fade-in-up z-50 flex items-center gap-2">
          <span>✅</span> {toastMsg}
        </div>
      )}

      {/* Modal de Paiement */}
      <Modal
        isOpen={payModal.open}
        onClose={() => setPayModal({ open: false, versementId: null, amount: 0 })}
        title="Enregistrer un paiement"
      >
        <div className="space-y-4">
          <p className="text-sm text-cshp-gray">
            Veuillez entrer les détails du paiement de <strong className="text-cshp-black">{formatMontant(payModal.amount)}</strong>.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">Date de paiement</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">Méthode de paiement</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white font-medium"
            >
              <option value="COMPTANT">COMPTANT</option>
              <option value="VIREMENT">VIREMENT</option>
              <option value="CHEQUE">CHÈQUE</option>
              <option value="INTERAC">INTERAC</option>
            </select>
          </div>

          <div className="flex gap-2 pt-4 justify-end">
            <button
              onClick={() => setPayModal({ open: false, versementId: null, amount: 0 })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmPay}
              className="px-4 py-2 bg-cshp-black text-white hover:bg-gray-800 rounded-lg text-sm font-semibold shadow-md active:scale-95 transition-all"
            >
              Confirmer
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
