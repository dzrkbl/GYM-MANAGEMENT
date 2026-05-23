import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { MembreForm } from '../components/membres/MembreForm';
import { useSections } from '../hooks/useSections';
import { Search, Plus, Eye, Calendar, DollarSign, UserCheck } from 'lucide-react';
import { formatDateLocal } from '../lib/format';

export function Membres() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  
  const [sectionFilter, setSectionFilter] = useState(
    user?.role === 'SECTION_MANAGER' ? (user.section ?? 'TOUS') : 'TOUS'
  );
  const [statusFilter, setStatusFilter] = useState('ACTIF');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, [sectionFilter, statusFilter, debouncedQuery]);

  async function fetchMembers() {
    setIsLoading(true);
    setError('');
    try {
      let url = `/membres?status=${statusFilter}`;
      let data = await apiFetch<any[]>(url);
      
      // Filter by section (groupe) in client to match exactly member.groupe
      if (sectionFilter && sectionFilter !== 'TOUS') {
        data = data.filter(m => m.groupe === sectionFilter);
      }
      
      // Client-side search filtering
      if (debouncedQuery) {
        const lowerQ = debouncedQuery.toLowerCase();
        data = data.filter(m => 
          (m.firstName ?? '').toLowerCase().includes(lowerQ) || 
          (m.lastName ?? '').toLowerCase().includes(lowerQ)
        );
      }
      
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des membres');
    } finally {
      setIsLoading(false);
    }
  }

  const { codes, getLabel } = useSections();
  const SECTIONS = useMemo(() => {
    const list = ["TOUS", ...codes];
    if (!list.includes("MENSUEL")) {
      list.push("MENSUEL");
    }
    return list;
  }, [codes]);

  const STATUSES = [
    { value: 'ACTIF', label: 'Actif' },
    { value: 'INACTIF', label: 'Inactif' },
    { value: 'EN_ATTENTE', label: 'En attente' }
  ];

  // Helper pour calculer le statut complet du paiement en temps réel
  const getPaiementStatus = (member: any) => {
    const versements = member.versements || [];
    const finalAmount = member.montantFinal || 0;
    
    const today = new Date();
    today.setHours(0,0,0,0);

    const totalPaid = versements
      .filter((v: any) => v.datePaiement)
      .reduce((sum: number, v: any) => sum + (v.montant || 0), 0);

    const restToPay = finalAmount - totalPaid;
    
    if (finalAmount <= 0) {
      return {
        label: 'Gratuit',
        colorClass: 'bg-gray-100 text-gray-700 border-gray-300'
      };
    }

    if (restToPay <= 0) {
      return {
        label: '✅ À jour (Soldé)',
        colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    }

    // Vérifier si un versement passé n'est pas payé
    const existsLate = versements.some((v: any) => {
      if (v.datePaiement) return false;
      const prevue = new Date(v.datePrevue);
      prevue.setHours(0,0,0,0);
      return prevue < today;
    });

    if (existsLate) {
      return {
        label: '⚠️ En retard',
        colorClass: 'bg-red-50 text-red-700 border-red-200 font-bold'
      };
    }

    // Trouver le prochain versement
    const nextVersement = versements
      .filter((v: any) => !v.datePaiement)
      .sort((a: any, b: any) => new Date(a.datePrevue).getTime() - new Date(b.datePrevue).getTime())[0];

    if (nextVersement) {
      const prevue = new Date(nextVersement.datePrevue);
      prevue.setHours(0,0,0,0);
      const diffTime = prevue.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        label: `🔵 Échéance dans ${diffDays} j.`,
        colorClass: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    }

    return {
      label: '✅ À jour',
      colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <UserCheck className="text-cshp-red" /> Liste des membres
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gérez vos athlètes, plans d'abonnements, cotisations et échéanciers.</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto bg-cshp-red hover:bg-red-700 text-white font-bold h-11 shadow-sm">
          <Plus size={20} className="mr-2" /> Ajouter un membre
        </Button>
      </div>

      {/* RECHERCHE ET FILTRES */}
      <Card className="p-4 shadow-sm border border-gray-100 bg-white">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Rechercher par prénom, nom..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cshp-red focus:border-transparent outline-none bg-white font-medium text-sm text-gray-800"
            />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between border-t border-gray-100 pt-3">
            {user?.role !== 'SECTION_MANAGER' && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-extrabold text-gray-400 tracking-wider">Groupes / Disciplines</span>
                <div className="flex flex-wrap gap-1.5">
                  {SECTIONS.map(sec => (
                    <button
                      key={sec}
                      onClick={() => setSectionFilter(sec)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        sectionFilter === sec 
                          ? 'bg-slate-900 text-white shadow-sm font-bold' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {sec === 'TOUS' ? 'Tous' : getLabel(sec)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-extrabold text-gray-400 tracking-wider">Statut d'activité</span>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map(stat => (
                  <button
                    key={stat.value}
                    onClick={() => setStatusFilter(stat.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      statusFilter === stat.value 
                        ? 'bg-cshp-red text-white shadow-sm font-bold' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {stat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* TABLEAU / VUE LISTE ADMINISTRATIVE */}
      {error ? (
        <div className="p-4 bg-red-50-border border-red-200 text-red-600 rounded-lg font-medium shadow-sm">{error}</div>
      ) : isLoading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : members.length === 0 ? (
        <Card className="text-center py-16 text-gray-500 border border-gray-100 shadow-sm">
          <Calendar size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-700 font-medium">Aucun athlète dans cette sélection.</p>
          <p className="text-xs text-gray-400 mt-1">Créez un profil pour commencer à faire le suivi.</p>
        </Card>
      ) : (
        <Card className="shadow-sm border border-gray-100 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 w-16">#</th>
                  <th className="py-3 px-4">Nom</th>
                  <th className="py-3 px-4">Prénom</th>
                  <th className="py-3 px-4">Groupe</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4 text-right">Montant final</th>
                  <th className="py-3 px-4 text-right">Total payé</th>
                  <th className="py-3 px-4 text-right">Reste dû</th>
                  <th className="py-3 px-4">Fin contrat</th>
                  <th className="py-3 px-4 text-center">Statut paiement</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {members.map((member, index) => {
                  const paiement = getPaiementStatus(member);
                  const totalPaid = (member.versements || [])
                    .filter((v: any) => v.datePaiement)
                    .reduce((sum: number, v: any) => sum + (v.montant || 0), 0);
                  const restToPay = (member.montantFinal || 0) - totalPaid;

                  return (
                    <tr 
                      key={member.id} 
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/membres/${member.id}`)}
                    >
                      <td className="py-3.5 px-4 font-mono text-gray-500 font-semibold">
                        {String(index + 1).padStart(3, '0')}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900 uppercase">
                        {member.lastName}
                      </td>
                      <td className="py-3.5 px-4 text-gray-700 font-medium">
                        {member.firstName}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="neutral" className="bg-slate-100 text-slate-800 border-none px-2.5 py-1 text-xs">
                          {getLabel(member.groupe)}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-xs text-gray-600 uppercase">
                        {member.plan || '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-gray-900">
                        {member.montantFinal !== null ? `${member.montantFinal.toFixed(2)} $` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-600 font-bold">
                        {totalPaid > 0 ? `${totalPaid.toFixed(2)} $` : '0.00 $'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-gray-900">
                        {restToPay > 0 ? (
                          <span className="text-amber-600">{restToPay.toFixed(2)} $</span>
                        ) : (
                          <span className="text-gray-400">0.00 $</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-gray-600">
                        {member.finContrat 
                          ? formatDateLocal(member.finContrat)
                          : '-'
                        }
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${paiement.colorClass}`}>
                          {paiement.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                        <button 
                          className="text-cshp-red hover:bg-red-50 hover:text-red-700 h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 transition-colors bg-white font-medium cursor-pointer"
                          onClick={() => navigate(`/membres/${member.id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* MODALE AJOUT MEMBRE */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="" width="xl">
        <MembreForm 
          onSuccess={() => {
            setIsAddModalOpen(false);
            fetchMembers();
          }} 
          onCancel={() => setIsAddModalOpen(false)} 
        />
      </Modal>
    </div>
  );
}
