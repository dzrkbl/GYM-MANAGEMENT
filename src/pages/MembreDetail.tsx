import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDate } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { MembreForm } from '../components/forms/MembreForm';
import { PaiementForm } from '../components/forms/PaiementForm';
import { GradeForm } from '../components/forms/GradeForm';
import { ArrowLeft, UserCircle, Phone, Calendar as CalIcon, Edit3, Award } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function MembreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [member, setMember] = useState<any>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<{name: string, belt: string} | null>(null);

  useEffect(() => {
    fetchMemberData();
    fetchGrades();
  }, [id]);

  async function fetchGrades() {
    try {
      const data = await apiFetch<any[]>(`/grades/membre/${id}`);
      setGrades(data);
    } catch (err) {
      console.warn("Erreur chargement grades", err);
    }
  }

  async function fetchMemberData() {
    setIsLoading(true);
    try {
      const memData = await apiFetch<any>(`/membres/${id}`);
      setMember(memData);

      try {
        const attData = await apiFetch<any[]>(`/presences/membre/${id}`);
        setAttendances(attData);
      } catch (attErr) {
        console.warn("Erreur chargement présences", attErr);
      }

    } catch (err: any) {
      setError(err.message || "Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  }

  const handleEditMember = async (data: any) => {
    setIsSubmitting(true);
    try {
      await apiFetch(`/membres/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      setIsEditModalOpen(false);
      fetchMemberData();
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la modification');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddPayment = async (data: any) => {
    setIsPaying(true);
    try {
      // Optimistic update for UI feel (optional, but requested for 'Marquer comme payé' list, doing it simple here)
      await apiFetch('/paiements', {
        method: 'POST',
        body: JSON.stringify({
          memberId: id!,
          subscriptionId: activeSub?.id, 
          status: 'PAYÉ',
          ...data
        })
      });
      setIsPaymentModalOpen(false);
      fetchMemberData(); // refresh payments list
    } catch (error: any) {
      alert(error.message || 'Erreur lors du paiement');
    } finally {
      setIsPaying(false);
    }
  };

  const handleGradeSubmit = async (data: any) => {
    setIsGrading(true);
    try {
      await apiFetch('/grades', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      setIsGradeModalOpen(false);
      fetchGrades();
      fetchMemberData();
    } catch (error: any) {
      alert(error.message || 'Erreur lors du passage de grade');
    } finally {
      setIsGrading(false);
    }
  };

  const openGradeModal = (sectionName: string, belt: string) => {
    setSelectedSection({ name: sectionName, belt });
    setIsGradeModalOpen(true);
  };

  if (isLoading) return <div className="p-8 flex justify-center"><Spinner /></div>;
  if (error || !member) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error || 'Membre introuvable'}</div>;

  // Derive active subscription
  const activeSub = member.subscriptions?.find((s: any) => s.status === 'ACTIVE' || s.status === 'EN_ATTENTE');
  
  // Attendances calculation 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentAttendances = attendances.filter(a => new Date(a.date) >= thirtyDaysAgo);
  // Approximation of total cours is 8 per month per section generally. Let's just show raw count.
  const presencesCount = recentAttendances.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 md:relative z-10">
        <button onClick={() => navigate(-1)} className="flex items-center text-cshp-gray hover:text-cshp-black cursor-pointer">
          <ArrowLeft className="mr-2" size={20} /> Retour
        </button>
        <Button variant="outline" onClick={() => setIsEditModalOpen(true)} className="min-h-[40px] text-sm py-1">
          <Edit3 size={16} className="mr-2" /> Modifier
        </Button>
      </div>

      {/* Profil */}
      <Card className="p-6">
        <div className="flex gap-4 items-start">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <UserCircle size={40} className="text-gray-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cshp-black uppercase">{member.lastName} <span className="capitalize">{member.firstName}</span></h1>
            {member.dateOfBirth && (
              <p className="text-cshp-gray mt-1">
                Né(e) le {formatDate(member.dateOfBirth)} 
              </p>
            )}
            <div className="mt-2 space-y-1">
              {member.phone && <div className="flex items-center text-sm text-cshp-black"><Phone size={14} className="mr-2 text-cshp-gray"/> {member.phone}</div>}
              {member.parentName && (
                <div className="flex items-center text-sm text-cshp-black bg-yellow-50 px-2 py-1 rounded inline-flex mt-1">
                  👤 Parent: {member.parentName} — {member.parentPhone}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Sections & Grades */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-cshp-gray tracking-wider mb-4 uppercase">Sections & Grades</h3>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {member.sections.map((s: any) => (
               <div key={s.id} className="flex gap-4 items-center bg-gray-50 border border-gray-100 rounded-lg p-4 w-full sm:w-auto shrink-0 justify-between">
                 <div className="flex gap-3 items-center">
                   <Award size={20} className="text-cshp-red" />
                   <div>
                     <span className="font-bold text-cshp-black block">{s.section}</span>
                     <Badge variant="belt" className="mt-1">{s.belt || 'Blanche'}</Badge>
                   </div>
                 </div>
                 {user?.role !== 'COACH' && (
                   <Button variant="outline" className="text-xs shrink-0" onClick={() => openGradeModal(s.section, s.belt)}>
                     + Passage
                   </Button>
                 )}
               </div>
            ))}
          </div>

          {grades.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-sm font-bold text-cshp-black mb-3">Historique des passages</h4>
              <ul className="space-y-3">
                {grades.map(g => (
                  <li key={g.id} className="text-sm flex flex-col md:flex-row md:items-center justify-between bg-white border border-gray-100 rounded-lg p-3 shadow-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cshp-black">🥋 {g.ceintureMontante}</span>
                        <span className="text-cshp-gray text-xs">({g.section})</span>
                      </div>
                      <div className="mt-1 text-cshp-gray">
                        Examinateur : {g.examinateur?.firstName} {g.examinateur?.lastName}
                      </div>
                      {g.note && <div className="mt-2 text-xs italic text-gray-500">"{g.note}"</div>}
                    </div>
                    <div className="text-cshp-gray font-medium shrink-0 mt-2 md:mt-0 text-right">
                      {new Date(g.date).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Abonnement */}
      <Card className="p-6">
         <h3 className="text-xs font-bold text-cshp-gray tracking-wider mb-4 uppercase">Abonnement Actif</h3>
         {activeSub ? (
           <div className="space-y-3">
             <div className="flex justify-between items-start border-b border-gray-100 pb-3">
               <div>
                 <p className="font-bold text-cshp-black">{activeSub.type} · {activeSub.section}</p>
                 <p className="text-cshp-red font-medium mt-1">{formatMontant(activeSub.amount)} / mois</p>
               </div>
               <Badge variant={activeSub.status === 'ACTIVE' ? 'success' : 'warning'}>
                 {activeSub.status === 'ACTIVE' ? '✅ Actif' : '⏳ En attente'}
               </Badge>
             </div>
             <p className="text-sm text-cshp-gray flex items-center">
               <CalIcon size={14} className="mr-2" /> Fin de cycle : {formatDate(activeSub.endDate)}
             </p>
           </div>
         ) : (
           <p className="text-sm text-cshp-gray">Aucun abonnement actif.</p>
         )}
      </Card>

      {/* Paiements */}
      <Card className="p-6">
         <div className="flex justify-between items-center mb-4">
           <h3 className="text-xs font-bold text-cshp-gray tracking-wider uppercase">Historique des Paiements</h3>
           {activeSub && (
             <Button variant="outline" className="min-h-[36px] text-xs py-1 h-auto" onClick={() => setIsPaymentModalOpen(true)}>
               + Enregistrer
             </Button>
           )}
         </div>
         {member.payments && member.payments.length > 0 ? (
           <ul className="space-y-3">
             {[...member.payments].sort((a,b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
             .map((p: any) => (
               <li key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                 <div>
                   <p className="font-medium text-sm text-cshp-black">
                     {new Date(p.dueDate).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })}
                   </p>
                   <p className="text-xs text-cshp-gray">{p.method || 'Non payé'}</p>
                 </div>
                 <div className="text-right">
                   <p className="font-medium text-cshp-black">{formatMontant(p.amount)}</p>
                   {p.status === 'PAYÉ' ? (
                     <span className="text-xs font-semibold text-green-600 block mt-1">✅ Payé</span>
                   ) : (
                     <span className="text-xs font-semibold text-red-500 block mt-1">🔴 {p.status === 'EN_RETARD' ? 'En retard' : 'En attente'}</span>
                   )}
                 </div>
               </li>
             ))}
           </ul>
         ) : (
           <p className="text-sm text-cshp-gray">Aucun paiement enregistré.</p>
         )}
      </Card>

      {/* Présences */}
      <Card className="p-6">
        <h3 className="text-xs font-bold text-cshp-gray tracking-wider mb-4 uppercase">Présences (30 derniers jours)</h3>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-cshp-black">{presencesCount}</div>
          <div className="text-sm text-cshp-gray">cours assistés<br/>depuis 1 mois</div>
        </div>
      </Card>

      <Modal isOpen={isEditModalOpen} onClose={() => !isSubmitting && setIsEditModalOpen(false)} title="Modifier le membre" width="lg">
        <MembreForm initialData={member} onSubmit={handleEditMember} onCancel={() => setIsEditModalOpen(false)} isLoading={isSubmitting} />
      </Modal>

      <Modal isOpen={isPaymentModalOpen} onClose={() => !isPaying && setIsPaymentModalOpen(false)} title="Enregistrer un paiement">
         <PaiementForm amount={activeSub?.amount || 0} onSubmit={handleAddPayment} onCancel={() => setIsPaymentModalOpen(false)} isLoading={isPaying} />
      </Modal>
      
      <Modal isOpen={isGradeModalOpen} onClose={() => !isGrading && setIsGradeModalOpen(false)} title="Passage de grade" width="lg">
        {selectedSection && (
          <GradeForm 
            memberId={member.id} 
            memberSection={selectedSection.name} 
            currentBelt={selectedSection.belt}
            onSubmit={handleGradeSubmit} 
            onCancel={() => setIsGradeModalOpen(false)} 
            isLoading={isGrading}
            isAdmin={user?.role === 'ADMIN'}
          />
        )}
      </Modal>

    </div>
  );
}
