import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDate } from '../lib/format';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Toast } from '../components/ui/Toast'; // we'll need to create this later or just use window.confirm
import { Navigate } from 'react-router-dom';

export function Paiements() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If coach, strictly forbidden
  if (user?.role === 'COACH') {
    return <Navigate to="/dashboard" replace />;
  }

  const SECTIONS = ["TOUS", "KARATE", "JUDO", "U8", "TAEKWONDO", "KICKBOXING"];
  const STATUSES = [
    { value: 'TOUS', label: 'Tous' },
    { value: 'PAYÉ', label: 'Payé' },
    { value: 'EN_RETARD', label: 'En retard' },
    { value: 'EN_ATTENTE', label: 'En attente' }
  ];

  const now = new Date();
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonthValue = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  
  const PERIODS = [
    { value: currentMonthValue, label: 'Ce mois' },
    { value: prevMonthValue, label: 'Mois précédent' },
    { value: 'ALL', label: 'Tout' }
  ];

  const [periodFilter, setPeriodFilter] = useState(currentMonthValue);
  const [sectionFilter, setSectionFilter] = useState(user?.role === 'SECTION_MANAGER' ? (user.section ?? 'TOUS') : 'TOUS');
  const [statusFilter, setStatusFilter] = useState('TOUS');
  
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // TOAST
  const [toastMsg, setToastMsg] = useState('');

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

  const markAsPaid = async (paymentId: string, amount: number) => {
    if (!window.confirm(`Confirmer le paiement de ${formatMontant(amount)} ?`)) return;

    // Optimistic update
    const previousPayments = [...payments];
    setPayments(prev => prev.map(p => {
      if (p.id === paymentId) {
        return { ...p, status: 'PAYÉ', paidDate: new Date().toISOString() };
      }
      return p;
    }));

    try {
      await apiFetch(`/paiements/${paymentId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'PAYÉ', paidDate: new Date().toISOString() })
      });
      setToastMsg(`Paiement de ${formatMontant(amount)} confirmé`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la confirmation');
      setPayments(previousPayments); // rollback
    }
  };

  // derived state for banner
  const summary = useMemo(() => {
    let encaissé = 0;
    let attente = 0;
    let retard = 0;

    payments.forEach(p => {
      if (p.status === 'PAYÉ') encaissé += p.amount;
      if (p.status === 'EN_ATTENTE') attente += p.amount;
      if (p.status === 'EN_RETARD') retard += p.amount;
    });

    return { encaissé, attente, retard };
  }, [payments]);

  // Sorting: 1. EN_RETARD, 2. EN_ATTENTE, 3. PAYÉ
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
      
      return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime(); // Then date desc
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
                  {sec}
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
              <span className="text-cshp-gray mr-2">Encaissé :</span> 
              <span className="font-bold text-green-600">{formatMontant(summary.encaissé)}</span>
            </div>
            <div>
              <span className="text-cshp-gray mr-2">En attente :</span> 
              <span className="font-bold text-yellow-600">{formatMontant(summary.attente)}</span>
            </div>
            <div>
              <span className="text-cshp-gray mr-2">En retard :</span> 
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
                    {p.subscription?.section} · {p.subscription?.type === 'MENSUEL' ? 'Mensuel' : 'Saisonnier'}
                  </div>
                  <div className="text-sm text-cshp-black mt-2 md:mt-1 flex items-center gap-2">
                    <span className="font-bold text-base">{formatMontant(p.amount)}</span>
                    {p.status === 'PAYÉ' && <Badge variant="success">✅ Payé le {new Date(p.paidDate || p.dueDate).toLocaleDateString('fr-CA')}</Badge>}
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
                      onClick={() => markAsPaid(p.id, p.amount)}
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

    </div>
  );
}
