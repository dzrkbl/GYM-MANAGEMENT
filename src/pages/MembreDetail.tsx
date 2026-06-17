import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, payerVersement } from '../lib/api';
import { formatMontant, formatDate, formatDateLocal } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { MembreForm } from '../components/membres/MembreForm';
import { GradeForm } from '../components/forms/GradeForm';
import { 
  ArrowLeft, UserCircle, Phone, Calendar as CalIcon, Edit3, Award, 
  DollarSign, Users, CheckCircle, Clock, Heart, Mail, Check, AlertTriangle, ShieldAlert
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { KATAS_KARATE, estKarate } from '../lib/katas';

export function MembreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [member, setMember] = useState<any>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [allMembres, setAllMembres] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Onglet actif : 'profil' | 'paiements' | 'presences' | 'famille'
  const [activeTab, setActiveTab] = useState<'profil' | 'paiements' | 'presences' | 'famille'>('profil');

  // Modales
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<{name: string, belt: string} | null>(null);

  // Modale Paiement d'un versement
  const [isPayVersementOpen, setIsPayVersementOpen] = useState(false);
  const [currentVersement, setCurrentVersement] = useState<any>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState('VIREMENT');
  const [payNote, setPayNote] = useState('');
  const [isPayingVersement, setIsPayingVersement] = useState(false);

  useEffect(() => {
    fetchMemberData();
    fetchGrades();
    fetchAllMembres();
  }, [id]);

  async function fetchGrades() {
    try {
      const data = await apiFetch<any[]>(`/grades/membre/${id}`);
      setGrades(data);
    } catch (err) {
      console.warn("Erreur chargement grades", err);
    }
  }

  async function fetchAllMembres() {
    try {
      const data = await apiFetch<any[]>('/membres');
      setAllMembres(data);
    } catch (err) {
      console.warn("Erreur chargement de tous les membres", err);
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

  // Enregistrer le paiement d'un versement
  const openPayVersementModal = (versement: any) => {
    setCurrentVersement(versement);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('VIREMENT');
    setPayNote('');
    setIsPayVersementOpen(true);
  };

  const handleSaveVersementPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVersement) return;

    setIsPayingVersement(true);
    try {
      await payerVersement(currentVersement.id, {
        datePaiement: payDate,
        methodePaiement: payMethod,
        note: payNote,
      });
      setIsPayVersementOpen(false);
      fetchMemberData();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la validation du paiement.');
    } finally {
      setIsPayingVersement(false);
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><Spinner /></div>;
  if (error || !member) return <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error || 'Membre introuvable'}</div>;

  // Calcul du taux et du statut
  const groupLabel = (g: string) => {
    switch (g) {
      case 'KARATE_GR1': return 'Karaté Gr. 1';
      case 'KARATE_GR2': return 'Karaté Gr. 2';
      case 'KARATE_GR3': return 'Karaté Gr. 3';
      case 'JUDO_GR1': return 'Judo Gr. 1';
      case 'JUDO_GR2': return 'Judo Gr. 2';
      case 'JUDO_GR3': return 'Judo Gr. 3';
      case 'NINJAS_GR1': return 'Ninjas Gr. 1';
      case 'NINJAS_GR2': return 'Ninjas Gr. 2';
      case 'NINJAS_GR3': return 'Ninjas Gr. 3';
      case 'MENSUEL': return 'Mensuel';
      default: return g || '-';
    }
  };

  // Liste des parrainés
  const parraines = allMembres.filter(m => m.referePar === member.id);
  
  // Parrain direct
  const parrain = allMembres.find(m => m.id === member.referePar);

  // Famille liée
  const familleMembres = allMembres.filter(m => 
    (member.membreFamilleId && m.id === member.membreFamilleId) || 
    (m.membreFamilleId === member.id)
  );

  // Présences durant les 30 derniers jours
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentAttendances = attendances.filter(a => new Date(a.date) >= thirtyDaysAgo);

  const getStatusBadge = (status: string) => {
    if (status === 'ACTIF') return <Badge variant="success">✅ Actif</Badge>;
    if (status === 'INACTIF') return <Badge variant="neutral">Inactif</Badge>;
    if (status === 'EN_ATTENTE') return <Badge variant="warning">⏳ En attente</Badge>;
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 px-4">
      {/* Bouton retour et modification */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 md:relative z-10">
        <button onClick={() => navigate('/membres')} className="flex items-center text-gray-500 hover:text-gray-800 cursor-pointer font-semibold text-sm">
          <ArrowLeft className="mr-2" size={20} /> Retour aux membres
        </button>
        <Button variant="outline" onClick={() => setIsEditModalOpen(true)} className="min-h-[40px] text-sm py-1 border-gray-300">
          <Edit3 size={16} className="mr-2" /> Modifier le Profil
        </Button>
      </div>

      {/* HEADER DE PRÉSENTATION RAPIDE */}
      <Card className="p-6 shadow-sm border border-gray-100 bg-white">
        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start text-center sm:text-left">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0 shadow-inner">
            <UserCircle size={56} className="stroke-[1.5]" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-center sm:justify-start">
              <h1 className="text-2xl font-extrabold text-gray-900 uppercase tracking-tight">
                {member.lastName} <span className="font-normal capitalize text-gray-700">{member.firstName}</span>
              </h1>
              <div className="inline-flex justify-center">{getStatusBadge(member.status)}</div>
            </div>

            <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1 justify-center sm:justify-start">
              {member.dateOfBirth && (
                <span className="flex items-center gap-1">
                  <CalIcon className="w-4 h-4 text-gray-400" /> Né(e) le : {formatDate(member.dateOfBirth)}
                </span>
              )}
              {member.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4 text-gray-400" /> {member.phone}
                </span>
              )}
              {member.email && (
                <span className="flex items-center gap-1 font-medium">
                  <Mail className="w-4 h-4 text-gray-400" /> {member.email}
                </span>
              )}
            </div>

            <div className="pt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
              <Badge variant="neutral" className="bg-slate-900 text-white font-bold px-3 py-1 text-xs">
                {groupLabel(member.sections?.[0]?.section)}
              </Badge>
              {member.sections?.[0]?.belt && (
                <Badge variant="belt" className="font-semibold text-xs py-1">
                  🥋 Belt: {member.sections[0].belt} {member.sections[0].beltSize ? `(${member.sections[0].beltSize})` : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* TABS DE NAVIGATION */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 sm:space-x-4" aria-label="Tabs">
          {[
            { id: 'profil', label: 'Profil Complet', icon: UserCircle },
            { id: 'paiements', label: 'Échéances & Paiements', icon: DollarSign },
            { id: 'presences', label: 'Présences', icon: Clock },
            { id: 'famille', label: 'Famille & Parrainage', icon: Users },
          ].map(tab => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 flex items-center gap-1.5 border-b-2 font-bold text-xs sm:text-sm tracking-tight transition-all rounded-t-lg ${
                  isActive
                    ? 'border-cshp-red text-cshp-red bg-red-50/40'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <IconComponent className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* --- DUPLICATE DISPLAY FOR TABS CONTENT --- */}
      
      {/* 1. ONGLET PROFIL */}
      {activeTab === 'profil' && (
        <div className="space-y-6">
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Fiche d'identité</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Âge actuel</span>
                <span className="text-gray-800 font-semibold text-sm">
                  {member.dateOfBirth ? `${new Date().getFullYear() - new Date(member.dateOfBirth).getFullYear()} ans` : '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Poids corporel</span>
                <span className="text-gray-800 font-semibold text-sm">
                  {member.poids ? `${member.poids} kg` : 'Non renseigné'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Date de début</span>
                <span className="text-gray-800 font-semibold text-sm">
                  {member.dateInscription ? formatDateLocal(member.dateInscription) : '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Date de fin d'adhésion</span>
                <span className="text-gray-800 font-bold text-cshp-red text-sm">
                  {member.finContrat ? formatDateLocal(member.finContrat) : 'Indéfinie'}
                </span>
              </div>
            </div>

            {member.notes && (
              <div className="pt-3 border-t border-gray-100">
                <span className="text-gray-400 block text-xs uppercase font-extrabold mb-1">Notes administratives ou médicales</span>
                <div className="bg-slate-50 border border-slate-100 text-slate-800 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-line italic">
                  "{member.notes}"
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Coordonnées & contact d'urgence</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Téléphone</span>
                <span className="text-gray-800 font-semibold">{member.phone || '-'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Courriel</span>
                <span className="text-gray-800 font-semibold break-all">{member.email || '-'}</span>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Adresse</span>
                <span className="text-gray-800 font-semibold">
                  {[member.adresse, member.ville, member.codePostal].filter(Boolean).join(', ') || '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Parent / tuteur</span>
                <span className="text-gray-800 font-semibold">{member.parentName || '-'}</span>
                <span className="text-gray-500 block text-xs">
                  {member.parentPhone || ''}{member.parentEmail ? ` · ${member.parentEmail}` : ''}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Contact d'urgence</span>
                <span className="text-gray-800 font-semibold">
                  {member.urgenceNom || '-'}{member.urgenceLien ? ` (${member.urgenceLien})` : ''}
                </span>
                <span className="text-gray-500 block text-xs">{member.urgenceTel || ''}</span>
              </div>
            </div>
            {member.problemeSante && (
              <div className="pt-3 border-t border-gray-100">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 uppercase">
                  <AlertTriangle size={14} /> Problème de santé signalé
                </span>
                {member.noteSante && <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">{member.noteSante}</p>}
              </div>
            )}
          </Card>

          {/* Grille de Ceintures et Historique des Passages de Grades */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Grades & Progression</h3>
              {user?.role !== 'COACH' && member.sections?.[0] && (
                <Button 
                  variant="outline" 
                  onClick={() => openGradeModal(member.sections[0].section, member.sections[0].belt || "Blanche")}
                  className="text-xs !min-h-0 h-9 px-3"
                >
                  Ajouter un passage
                </Button>
              )}
            </div>

            {grades.length > 0 ? (
              <div className="space-y-3">
                {grades.map(g => (
                  <div key={g.id} className="text-sm border border-gray-100 bg-gray-50/50 rounded-xl p-3 flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900">🥋 {g.ceintureMontante}</span>
                        <span className="text-gray-400 text-xs">({g.section})</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Instructeur : {g.examinateur ? `${g.examinateur.firstName} ${g.examinateur.lastName}` : 'Inconnu'}
                      </p>
                      {g.note && <p className="text-xs italic text-gray-600 mt-1">"{g.note}"</p>}
                    </div>
                    <span className="text-xs font-semibold text-gray-400 shrink-0">
                      {formatDateLocal(g.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun historique de grade enregistré.</p>
            )}
          </Card>

          {/* Programme de katas — Karaté uniquement */}
          {member.sections?.some((s: any) => estKarate(s.section)) && (
            <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Programme de katas — Karaté</h3>
              <p className="text-xs text-gray-500">Katas à réviser à la maison selon le grade visé.</p>
              <div className="space-y-3">
                {KATAS_KARATE.map((niveau) => (
                  <div key={niveau.kyu} className="text-sm">
                    <p className="font-semibold text-gray-900">
                      {niveau.ceinture} <span className="text-gray-400 font-normal">({niveau.kyu})</span>
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {niveau.katas.map((k) => (
                        <li key={k.nom}>
                          {k.videoUrl ? (
                            <a
                              href={k.videoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs bg-cshp-red/10 text-cshp-red font-semibold px-2 py-0.5 rounded"
                            >
                              ▶ {k.nom}
                            </a>
                          ) : (
                            <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{k.nom}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* 2. ONGLET PAIEMENTS */}
      {activeTab === 'paiements' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Fiche d'abonnement récapitulative */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-md">
            <div>
              <span className="text-xs text-slate-400 font-extrabold uppercase tracking-wider block">
                Formule contractée
              </span>
              <span className="text-xl font-black block mt-0.5">
                Plan {member.plan || 'Non spécifié'}
              </span>
              <div className="text-xs text-slate-300 mt-1 space-y-0.5">
                <p>• Cotisation initiale : {member.prixBase ? `${member.prixBase.toFixed(2)} $` : '0.00 $'}</p>
                {member.rabaisFamille && <p>• Option famille appliquée (-10%)</p>}
                {Number(member.rabaisCustomPct) > 0 && <p>• Rabais manuel appliqué : -{member.rabaisCustomPct}%</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <span className="text-xs text-slate-400 block uppercase font-bold">Montant contractuel final :</span>
              <span className="text-3xl font-extrabold text-cshp-red block">
                {member.montantFinal ? `${member.montantFinal.toFixed(2)} $` : '0.00 $'}
              </span>
            </div>
          </div>

          {/* ÉCHÉANCIER COMPLET */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Échéancier de facturation</h3>
            
            {member.versements && member.versements.length > 0 ? (
              <div className="space-y-4">
                {member.versements.map((v: any, index: number) => {
                  const isPaid = !!v.datePaiement;
                  const isLate = !isPaid && new Date(v.datePrevue) < new Date();
                  return (
                    <div 
                      key={v.id} 
                      className={`border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all ${
                        isPaid 
                          ? 'border-emerald-100 bg-emerald-50/10' 
                          : isLate 
                          ? 'border-red-100 bg-red-50/10 animate-pulse' 
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">Versement #{v.numeroVersement}</span>
                          {isPaid ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                              Payé ✅
                            </span>
                          ) : isLate ? (
                            <span className="bg-red-100 text-red-800 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full border border-red-200">
                              En retard ⚠️
                            </span>
                          ) : (
                            <span className="bg-blue-100 text-blue-800 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                              Planifié 🔵
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 space-y-1">
                          <p>Échéance prévue : <strong>{formatDateLocal(v.datePrevue, { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
                          {isPaid && (
                            <div className="bg-slate-100/60 text-slate-700 p-2 rounded-lg mt-2 text-[11px] font-medium border border-slate-200/50">
                              Paid on {formatDateLocal(v.datePaiement) || '-'} via <span className="uppercase font-bold">{v.methodePaiement}</span>
                              {v.note && <span className="block mt-0.5 text-gray-500 italic">"Note: {v.note}"</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right w-full sm:w-auto flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2 shrink-0 border-t sm:border-0 pt-2 sm:pt-0 border-gray-100">
                        <span className="text-lg font-black text-slate-900">{v.montant.toFixed(2)} $</span>
                        {!isPaid && (
                          <Button 
                            className="bg-cshp-red hover:bg-red-700 text-white text-xs font-bold py-1 h-9 !min-h-0 flex items-center gap-1 shrink-0"
                            onClick={() => openPayVersementModal(v)}
                          >
                            <DollarSign className="w-3.5 h-3.5" /> Encaisser
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun échéancier de paiement disponible pour ce membre.</p>
            )}
          </Card>
        </div>
      )}

      {/* 3. ONGLET PRÉSENCES */}
      {activeTab === 'presences' && (
        <div className="space-y-6">
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Statistiques de Fréquentation</h3>
            
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-slate-50 border rounded-2xl">
                <span className="text-3xl font-black text-slate-900 block">{recentAttendances.length}</span>
                <span className="text-xs text-gray-400 uppercase font-extrabold mt-1 block">30 derniers jours</span>
              </div>
              <div className="p-4 bg-slate-50 border rounded-2xl">
                <span className="text-3xl font-black text-slate-900 block">{attendances.length}</span>
                <span className="text-xs text-gray-400 uppercase font-extrabold mt-1 block">Présences totales</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase text-gray-400 tracking-wider">Toutes les séances de pointage</h4>
              {attendances.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {[...attendances]
                    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((a, i) => (
                      <div key={i} className="text-xs sm:text-sm bg-white border rounded-lg p-3 flex justify-between items-center hover:bg-slate-50 transition-colors">
                        <span className="font-bold text-gray-800">
                          {formatDateLocal(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 uppercase font-bold bg-slate-100 px-2 py-0.5 rounded">Cours : {a.course?.section || member.sections?.[0]?.section}</span>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Aucun pointage enregistré pour le moment.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 4. ONGLET FAMILLE & RÉFÉRENCEMENT */}
      {activeTab === 'famille' && (
        <div className="space-y-6">
          {/* FAMILLE COMPLÈTE */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Membres de Famille</h3>
            
            {familleMembres.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {familleMembres.map(fam => (
                  <div 
                    key={fam.id} 
                    className="p-3 bg-slate-50 border border-gray-100 rounded-xl flex items-center justify-between cursor-pointer hover:border-cshp-red"
                    onClick={() => navigate(`/membres/${fam.id}`)}
                  >
                    <div>
                      <p className="font-bold text-sm text-gray-900 uppercase">{fam.lastName} <span className="capitalize font-medium text-gray-700">{fam.firstName}</span></p>
                      <p className="text-xs text-gray-500 uppercase">{fam.sections?.[0]?.section || '-'}</p>
                    </div>
                    <Badge variant="success" className="text-[10px]">Famille</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun membre de la famille n'est actuellement lié.</p>
            )}
          </Card>

          {/* PARRAIN DIRECT & PARRAINÉ */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Parrainage d'adhésion</h3>
            
            {/* Référé par */}
            {parrain ? (
              <div className="space-y-2">
                <span className="text-xs uppercase font-extrabold text-gray-400 block">Référé par (Parrain direct)</span>
                <div 
                  className="p-3 border border-indigo-100 bg-indigo-50/10 rounded-xl flex items-center justify-between cursor-pointer hover:bg-slate-100 max-w-sm transition-colors"
                  onClick={() => navigate(`/membres/${parrain.id}`)}
                >
                  <div>
                    <p className="font-bold text-sm text-indigo-900 uppercase">{parrain.lastName} {parrain.firstName}</p>
                    <p className="text-[10px] uppercase font-bold text-indigo-500">Parrain officiel</p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-indigo-500" />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-xs uppercase font-extrabold text-gray-400 block">Parrain direct</span>
                <p className="text-xs text-gray-400 italic">Ce membre n'a pas été référé par un parrain.</p>
              </div>
            )}

            {/* Membres que j'ai parrainés */}
            <div className="space-y-2 pt-3 border-t border-gray-100 mt-2">
              <span className="text-xs uppercase font-extrabold text-gray-400 block">Membres parrainés par vous ({parraines.length})</span>
              {parraines.length > 0 ? (
                <div className="space-y-2">
                  {parraines.map(p => (
                    <div 
                      key={p.id} 
                      className="p-3 border border-gray-100 hover:border-gray-300 rounded-xl flex justify-between items-center text-sm cursor-pointer"
                      onClick={() => navigate(`/membres/${p.id}`)}
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-gray-900 uppercase">
                          {p.lastName} <span className="capitalize font-medium text-gray-600">{p.firstName}</span>
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase">Inscrit le {formatDateLocal(p.dateInscription || p.createdAt)}</p>
                      </div>
                      
                      <div className="text-right">
                        {p.rabaisReferentApplique ? (
                          <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] uppercase font-black border border-emerald-200">
                            Appliqué ✅
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded bg-amber-100 text-amber-850 text-[10px] uppercase font-black border border-amber-200">
                            À appliquer 🔔 (offert: {p.rabaisReferentPct || 10}%)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Vous n'avez pas encore parrainé d'autres athlètes.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* --- TOUTES LES MODALES --- */}

      {/* MODALE ÉDITION DU PROFIL */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="" width="xl">
        <MembreForm 
          membre={member} 
          onSuccess={() => {
            setIsEditModalOpen(false);
            fetchMemberData();
          }} 
          onCancel={() => setIsEditModalOpen(false)} 
        />
      </Modal>

      {/* MODALE EXAM / GRADE */}
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

      {/* MODALE ENCAISSER VERSEMENT */}
      <Modal isOpen={isPayVersementOpen} onClose={() => !isPayingVersement && setIsPayVersementOpen(false)} title="Encaisser un versement" width="md">
        {currentVersement && (
          <form onSubmit={handleSaveVersementPayment} className="space-y-4">
            <div className="bg-slate-50 border p-3 rounded-lg text-sm text-slate-800 leading-relaxed text-center font-semibold">
              Versement #{currentVersement.numeroVersement} d'un montant de &nbsp;
              <span className="text-lg font-black text-slate-900">{currentVersement.montant.toFixed(2)} $</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date réelle de paiement
              </label>
              <input
                type="date"
                required
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mode de versement
              </label>
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm"
              >
                <option value="VIREMENT">Virement Interac / Bancaire</option>
                <option value="CASH">Argent Comptant</option>
                <option value="CHEQUE">Chèque</option>
                <option value="CARTE">Carte de Crédit/Débit</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Note / Commentaire
              </label>
              <input
                type="text"
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
                placeholder="Ex. Reçu #0283, chèque n° 239..."
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm"
              />
            </div>

            <div className="flex gap-4 pt-4 border-t border-gray-100">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsPayVersementOpen(false)} disabled={isPayingVersement}>
                Annuler
              </Button>
              <Button type="submit" isLoading={isPayingVersement} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Confirmer l'encaissement
              </Button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
}
