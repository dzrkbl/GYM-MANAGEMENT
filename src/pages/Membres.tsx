import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Search, Plus, Eye, Calendar, DollarSign, UserCheck, FileText } from 'lucide-react';
import { formatDateLocal } from '../lib/format';
import { etatPaiement } from '../lib/echeances';

// Déclenche le téléchargement d'un PDF renvoyé en base64 par l'API.
function telechargerPdfBase64(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Membres() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  
  // Filtres portés par l'URL (?groupe=, ?statut=, ?suivi=) : revenir en
  // arrière depuis une fiche membre restaure le groupe consulté au lieu de
  // retomber sur « Tous », et un lien copié conserve la vue.
  const [searchParams, setSearchParams] = useSearchParams();
  const suiviFilter = searchParams.get('suivi'); // 'renouvellement' | null
  const defautSection = user?.role === 'SECTION_MANAGER' ? (user.section ?? 'TOUS') : 'TOUS';
  const sectionFilter = searchParams.get('groupe') ?? defautSection;
  const statusFilter = searchParams.get('statut') ?? 'ACTIF';
  const setFiltreUrl = (cle: 'groupe' | 'statut', valeur: string, defaut: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (valeur === defaut) next.delete(cle); // URL propre sur les valeurs par défaut
      else next.set(cle, valeur);
      return next;
    }, { replace: true });
  };
  const setSectionFilter = (v: string) => setFiltreUrl('groupe', v, defautSection);
  const setStatusFilter = (v: string) => setFiltreUrl('statut', v, 'ACTIF');
  
  // Tri cliquable des colonnes. Purement local : la liste complète est déjà
  // chargée, il n'y a pas de pagination à respecter.
  const [tri, setTri] = useState<{ col: string; sens: 1 | -1 } | null>(null);
  const basculerTri = (col: string) =>
    setTri((p) => (p?.col === col ? { col, sens: p.sens === 1 ? -1 : 1 } : { col, sens: 1 }));

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // --- Mode « Factures » : cocher des membres puis générer une facture par
  // famille avec les montants versés durant l'année civile choisie. ---
  const anneeCourante = new Date().getFullYear();
  const [modeFacture, setModeFacture] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anneeFacture, setAnneeFacture] = useState(anneeCourante);
  const [isGeneratingFactures, setIsGeneratingFactures] = useState(false);
  const [factureMsg, setFactureMsg] = useState('');

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenererFactures = async () => {
    if (selectedIds.size === 0) return;
    setIsGeneratingFactures(true);
    setFactureMsg('');
    try {
      const res = await apiFetch<{ annee: number; factures: Array<{ filename: string; base64: string; membres: string[]; total: number }> }>(
        '/membres/factures',
        { method: 'POST', body: JSON.stringify({ memberIds: Array.from(selectedIds), annee: anneeFacture }) }
      );
      res.factures.forEach((f, i) => {
        // Petit décalage entre les téléchargements pour que le navigateur les accepte tous.
        setTimeout(() => telechargerPdfBase64(f.base64, f.filename), i * 400);
      });
      setFactureMsg(`${res.factures.length} facture(s) générée(s) : ${res.factures.map(f => f.membres.join(' + ')).join(' · ')}`);
      setSelectedIds(new Set());
    } catch (err: any) {
      setFactureMsg('Erreur : ' + (err.message || 'génération impossible'));
    } finally {
      setIsGeneratingFactures(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [sectionFilter, statusFilter, debouncedQuery]);

  async function fetchMembers() {
    setIsLoading(true);
    setError('');
    try {
      let url = `/membres?status=${statusFilter}`;
      if (sectionFilter && sectionFilter !== 'TOUS') {
        url += `&section=${sectionFilter}`;
      }
      let data = await apiFetch<any[]>(url);
      
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
  const SECTIONS = useMemo(() => ["TOUS", ...codes], [codes]);

  const STATUSES = [
    { value: 'ACTIF', label: 'Actif' },
    { value: 'INACTIF', label: 'Inactif' },
    { value: 'EN_ATTENTE', label: 'En attente' }
  ];

  // Liste affichée : filtre de suivi (renouvellements échus), puis tri cliquable.
  const membersAffiches = useMemo(() => {
    const base = suiviFilter === 'renouvellement'
      ? members.filter((m) => etatPaiement(m).type === 'RENOUVELLEMENT_DU')
      : members;
    if (!tri) return base;

    const totalPaye = (m: any) => (m.versements || [])
      .filter((v: any) => v.datePaiement)
      .reduce((s: number, v: any) => s + (v.montant || 0), 0);

    // Valeur de tri par colonne. Les valeurs manquantes sont renvoyées à null
    // et systématiquement placées EN DERNIER, quel que soit le sens : un membre
    // sans date de fin de contrat ne doit pas squatter le haut du tableau.
    const cle = (m: any): string | number | null => {
      switch (tri.col) {
        case 'lastName':   return (m.lastName || '').toLowerCase();
        case 'firstName':  return (m.firstName || '').toLowerCase();
        case 'groupe':     return getLabel(m.sections?.[0]?.section)?.toLowerCase() ?? null;
        case 'presence':   return m.dernierePresence ? new Date(m.dernierePresence).getTime() : null;
        case 'plan':       return m.plan || null;
        case 'montant':    return m.montantFinal ?? null;
        case 'paye':       return totalPaye(m);
        case 'reste':      return (m.montantFinal || 0) - totalPaye(m);
        case 'finContrat': return m.finContrat ? new Date(m.finContrat).getTime() : null;
        case 'paiement':   return getPaiementStatus(m).label;
        default:           return null;
      }
    };

    return [...base].sort((a, b) => {
      const va = cle(a), vb = cle(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;   // les vides toujours en bas
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * tri.sens;
      return String(va).localeCompare(String(vb), 'fr') * tri.sens;
    });
  }, [members, suiviFilter, tri, getLabel]);

  // Statut de paiement en temps réel — tient compte de la fin de contrat :
  // un échéancier soldé n'est « à jour » que tant que le contrat court.
  const getPaiementStatus = (member: any) => {
    // Un membre parti (INACTIF) n'est plus suivi : pas de faux « En retard ».
    if (member.status === 'INACTIF') {
      return { label: '— (parti)', colorClass: 'bg-gray-50 text-gray-400 border-gray-200' };
    }
    const etat = etatPaiement(member);
    switch (etat.type) {
      case 'GRATUIT':
        return { label: 'Gratuit', colorClass: 'bg-gray-100 text-gray-700 border-gray-300' };
      case 'RETARD':
        return { label: '⚠️ En retard', colorClass: 'bg-red-50 text-red-700 border-red-200 font-bold' };
      case 'RENOUVELLEMENT_DU':
        return {
          label: `🔄 Renouvellement dû depuis le ${formatDateLocal(etat.date, { day: 'numeric', month: 'short' })}${etat.reste ? ` · reste ${etat.reste} $` : ''}`,
          colorClass: 'bg-red-50 text-red-700 border-red-200 font-bold',
        };
      case 'ECHEANCE_PROCHE':
        return { label: `🔵 Échéance dans ${etat.jours} j.`, colorClass: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'RESTE_SANS_ECHEANCE':
        return {
          label: `💰 Reste ${etat.reste} $ — aucune échéance planifiée`,
          colorClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
        };
      case 'RENOUVELLEMENT_PROCHE':
        return {
          label: `🔄 Renouvellement le ${formatDateLocal(etat.date, { day: 'numeric', month: 'short' })}`,
          colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      default:
        return { label: '✅ À jour (Soldé)', colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {user?.role === 'ADMIN' && (
            <Button
              variant={modeFacture ? 'primary' : 'outline'}
              onClick={() => { setModeFacture(!modeFacture); setSelectedIds(new Set()); setFactureMsg(''); }}
              className="w-full sm:w-auto h-11 font-bold"
            >
              <FileText size={18} className="mr-2" /> {modeFacture ? 'Quitter le mode factures' : 'Factures'}
            </Button>
          )}
          <Button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto bg-cshp-red hover:bg-red-700 text-white font-bold h-11 shadow-sm">
            <Plus size={20} className="mr-2" /> Ajouter un membre
          </Button>
        </div>
      </div>

      {/* Barre d'action du mode factures */}
      {modeFacture && (
        <div className="sticky top-2 z-30 bg-slate-900 text-white p-3 sm:p-4 rounded-xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <div className="text-sm">
            <span className="font-bold">{selectedIds.size}</span> membre(s) coché(s) —
            une facture par famille, avec les montants versés durant l'année choisie.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={anneeFacture}
              onChange={(e) => setAnneeFacture(Number(e.target.value))}
              className="min-h-[40px] rounded-lg px-2 text-cshp-black text-sm font-semibold bg-white"
            >
              {[anneeCourante, anneeCourante - 1, anneeCourante - 2].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Button
              onClick={handleGenererFactures}
              isLoading={isGeneratingFactures}
              disabled={selectedIds.size === 0}
              className="bg-cshp-red hover:bg-red-700 text-white font-bold h-10"
            >
              Générer les factures
            </Button>
          </div>
        </div>
      )}
      {factureMsg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${factureMsg.startsWith('Erreur') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {factureMsg}
        </div>
      )}

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

      {/* Filtre « renouvellements échus » actif (depuis le tableau de bord) */}
      {suiviFilter === 'renouvellement' && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold flex items-center justify-between">
          <span>🔄 Filtre actif : renouvellements échus seulement ({membersAffiches.length} membre(s))</span>
          <button
            onClick={() => setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('suivi'); // ne retire que ce filtre, garde groupe/statut
              return next;
            }, { replace: true })}
            className="underline text-xs hover:text-amber-950"
          >
            ✕ Retirer le filtre
          </button>
        </div>
      )}

      {/* TABLEAU / VUE LISTE ADMINISTRATIVE */}
      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg font-medium shadow-sm">{error}</div>
      ) : isLoading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : membersAffiches.length === 0 ? (
        <Card className="text-center py-16 text-gray-500 border border-gray-100 shadow-sm">
          <Calendar size={48} className="mx-auto text-gray-300 mb-3" />
          {user && user.role !== 'ADMIN' && !user.section ? (
            <>
              <p className="text-gray-700 font-medium">Aucune section n'est attitrée à votre compte.</p>
              <p className="text-xs text-gray-400 mt-1">Demandez à un administrateur de vous assigner vos groupes (page Coachs) pour voir les membres de votre discipline.</p>
            </>
          ) : (
            <>
              <p className="text-gray-700 font-medium">Aucun athlète dans cette sélection.</p>
              <p className="text-xs text-gray-400 mt-1">Créez un profil pour commencer à faire le suivi.</p>
            </>
          )}
        </Card>
      ) : (
        <Card className="shadow-sm border border-gray-100 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1150px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-extrabold uppercase text-[10px] tracking-wider">
                  {modeFacture && <th className="py-3 px-4 w-10">✔</th>}
                  <th className="py-3 px-4 w-16">#</th>
                  {([
                    ['lastName', 'Nom', ''],
                    ['firstName', 'Prénom', ''],
                    ['groupe', 'Groupe', ''],
                    ['presence', 'Dernière présence', ''],
                    ['plan', 'Plan', ''],
                    ['montant', 'Montant final', 'text-right'],
                    ['paye', 'Total payé', 'text-right'],
                    ['reste', 'Reste dû', 'text-right'],
                    ['finContrat', 'Fin contrat', ''],
                    ['paiement', 'Statut paiement', 'text-center'],
                  ] as const).map(([col, label, align]) => (
                    <th key={col} className={`py-3 px-4 ${align}`}>
                      <button
                        onClick={() => basculerTri(col)}
                        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-cshp-red transition-colors ${
                          tri?.col === col ? 'text-cshp-red' : ''
                        }`}
                        title={`Trier par ${label.toLowerCase()}`}
                      >
                        {label}
                        <span className={tri?.col === col ? '' : 'opacity-25'}>
                          {tri?.col === col && tri.sens === -1 ? '▼' : '▲'}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {membersAffiches.map((member, index) => {
                  const paiement = getPaiementStatus(member);
                  const totalPaid = (member.versements || [])
                    .filter((v: any) => v.datePaiement)
                    .reduce((sum: number, v: any) => sum + (v.montant || 0), 0);
                  const restToPay = (member.montantFinal || 0) - totalPaid;

                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${modeFacture && selectedIds.has(member.id) ? 'bg-red-50/50' : ''}`}
                      onClick={() => (modeFacture ? toggleSelected(member.id) : navigate(`/membres/${member.id}`))}
                    >
                      {modeFacture && (
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(member.id)}
                            onChange={() => toggleSelected(member.id)}
                            className="w-5 h-5 rounded text-cshp-red focus:ring-cshp-red"
                          />
                        </td>
                      )}
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
                          {getLabel(member.sections?.[0]?.section)}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold">
                        {member.dernierePresence ? (() => {
                          const jours = Math.floor((Date.now() - new Date(member.dernierePresence).getTime()) / 86_400_000);
                          const couleur = jours <= 7 ? 'text-emerald-600' : jours <= 21 ? 'text-amber-600' : 'text-red-600';
                          return (
                            <span className={couleur}>
                              {formatDateLocal(member.dernierePresence)}
                              <span className="text-gray-400 font-normal"> · {jours === 0 ? "aujourd'hui" : `il y a ${jours} j`}</span>
                            </span>
                          );
                        })() : (
                          <span className="text-gray-400">Jamais pointé</span>
                        )}
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
