import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, payerVersement } from '../lib/api';
import { formatMontant, formatDate, formatDateLocal, todayLocalISO, joursAvantEcheance } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { MembreForm } from '../components/membres/MembreForm';
import { GradeForm } from '../components/forms/GradeForm';
import { 
  ArrowLeft, UserCircle, Phone, Calendar as CalIcon, Edit3, Award, 
  DollarSign, Users, CheckCircle, Clock, Heart, Mail, Check, AlertTriangle, ShieldAlert, Trash2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { KATAS_KARATE, estKarate } from '../lib/katas';
import { etatPaiement } from '../lib/echeances';
import { saisonCourante, saisonsChoix } from '../lib/saison';
import { CEINTURES_LIST } from '../components/membres/MembreForm';
import { useSections } from '../hooks/useSections';
import { Input } from '../components/ui/Input';

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

  // --- Édition rapide : les champs simples, sans passer par l'assistant en
  // 4 étapes (le groupe, la ceinture, les coordonnées, les notes… se corrigent
  // ici sans jamais toucher au plan ni à l'échéancier). ---
  const { sections: sectionsDisponibles, getLabel: labelSection } = useSections();
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [quickEdit, setQuickEdit] = useState<any>({});
  const [isQuickSaving, setIsQuickSaving] = useState(false);

  const openQuickEdit = () => {
    setQuickEdit({
      groupe: member?.sections?.[0]?.section || '',
      ceinture: member?.sections?.[0]?.belt || member?.currentBelt || 'Blanche',
      phone: member?.phone || '',
      email: member?.email || '',
      parentName: member?.parentName || '',
      parentPhone: member?.parentPhone || '',
      parentEmail: member?.parentEmail || '',
      dob: member?.dateOfBirth ? member.dateOfBirth.split('T')[0] : '',
      membreDepuis: member?.signupDate ? member.signupDate.split('T')[0] : '',
      poids: member?.poids ?? '',
      notes: member?.notes || '',
    });
    setIsQuickEditOpen(true);
  };

  const saveQuickEdit = async () => {
    setIsQuickSaving(true);
    try {
      await apiFetch(`/membres/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          sections: [{ section: quickEdit.groupe, belt: quickEdit.ceinture || 'Blanche' }],
          currentBelt: quickEdit.ceinture || 'Blanche',
          phone: quickEdit.phone || null,
          email: quickEdit.email || null,
          parentName: quickEdit.parentName || null,
          parentPhone: quickEdit.parentPhone || null,
          parentEmail: quickEdit.parentEmail || null,
          dob: quickEdit.dob || null,
          membreDepuis: quickEdit.membreDepuis || null,
          poids: quickEdit.poids !== '' ? Number(quickEdit.poids) : null,
          notes: quickEdit.notes || null,
        }),
      });
      setIsQuickEditOpen(false);
      fetchMemberData();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsQuickSaving(false);
    }
  };
  const qe = (k: string) => (e: any) => setQuickEdit((p: any) => ({ ...p, [k]: e.target.value }));

  // --- Renouvellement en un geste : nouveau contrat + encaissement immédiat.
  // Cas type : le parent passe payer le trimestre suivant — l'échéancier de
  // l'ancien contrat est soldé, il n'y a donc RIEN à « encaisser » sans ça. ---
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [renew, setRenew] = useState<any>({});

  const openRenew = () => {
    const plan = member?.plan === 'ANNUEL' ? 'ANNUEL' : 'TRIMESTRIEL';
    setRenew({
      // Continuité du service : le nouveau contrat commence à la FIN de
      // l'ancien (règle du centre), pas au jour du paiement — modifiable si
      // l'athlète a fait une vraie pause.
      dateDebut: member?.finContrat ? member.finContrat.split('T')[0] : todayLocalISO(),
      plan,
      montant: member?.montantFinal || (plan === 'ANNUEL' ? 790 : 250),
      nbVersements: 1,
      encaisser: true,
      methode: 'COMPTANT',
      datePaiement: todayLocalISO(),
    });
    setIsRenewOpen(true);
  };

  const submitRenew = async () => {
    setIsRenewing(true);
    try {
      await apiFetch(`/membres/${member.id}/renouveler`, {
        method: 'POST',
        body: JSON.stringify({
          dateDebut: renew.dateDebut,
          plan: renew.plan,
          montant: Number(renew.montant),
          nbVersements: renew.plan === 'TRIMESTRIEL' ? 1 : Number(renew.nbVersements),
          premierPaiement: renew.encaisser
            ? { methode: renew.methode, datePaiement: renew.datePaiement }
            : null,
        }),
      });
      setIsRenewOpen(false);
      fetchMemberData();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors du renouvellement');
    } finally {
      setIsRenewing(false);
    }
  };
  const rn = (k: string) => (e: any) => setRenew((p: any) => ({ ...p, [k]: e.target.value }));
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [selectedSection, setSelectedSection] = useState<{name: string, belt: string} | null>(null);

  // Modale Paiement d'un versement
  const [isPayVersementOpen, setIsPayVersementOpen] = useState(false);
  const [currentVersement, setCurrentVersement] = useState<any>(null);
  const [payDate, setPayDate] = useState(todayLocalISO());
  const [payMethod, setPayMethod] = useState('VIREMENT');
  const [payNote, setPayNote] = useState('');
  const [isPayingVersement, setIsPayingVersement] = useState(false);

  // Historique des contrats précédents replié par défaut (la confusion type :
  // les versements payés de l'ANCIEN contrat pris pour ceux du renouvellement).
  const [showHistorique, setShowHistorique] = useState(false);

  const annulerPaiementVersement = async (v: any) => {
    if (!confirm(
      `Annuler le paiement du versement #${v.numeroVersement} (${v.montant.toFixed(2)} $) ?\n` +
      `Il redeviendra « à percevoir » (échéance : ${formatDateLocal(v.datePrevue)}).\n` +
      `À utiliser pour corriger une erreur d'encaissement.`
    )) return;
    try {
      await apiFetch(`/versements/${v.id}/annuler-paiement`, { method: 'PATCH' });
      fetchMemberData();
    } catch (err: any) {
      alert(err?.message || "Erreur lors de l'annulation du paiement");
    }
  };

  const supprimerVersement = async (v: any) => {
    const paye = !!v.datePaiement;
    if (!confirm(paye
      ? `⚠️ SUPPRIMER le versement #${v.numeroVersement} DÉJÀ PAYÉ (${v.montant.toFixed(2)} $ le ${formatDateLocal(v.datePaiement)}) ?\n` +
        `Il disparaîtra aussi des revenus des rapports.\n` +
        `Pour une simple erreur d'encaissement, préférez « Annuler le paiement ».`
      : `Supprimer le versement #${v.numeroVersement} (${v.montant.toFixed(2)} $ à percevoir le ${formatDateLocal(v.datePrevue)}) ?`
    )) return;
    try {
      await apiFetch(`/versements/${v.id}`, { method: 'DELETE' });
      fetchMemberData();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la suppression');
    }
  };

  // Affiliations fédération + achats d'équipement (endpoints ADMIN seulement).
  const [affiliations, setAffiliations] = useState<any[]>([]);
  const [achats, setAchats] = useState<any[]>([]);
  const [showAffForm, setShowAffForm] = useState(false);
  const [affForm, setAffForm] = useState({ discipline: 'KARATE', saison: saisonCourante(), numero: '', montant: '', datePaiement: '', note: '' });
  const [isAffSaving, setIsAffSaving] = useState(false);

  useEffect(() => {
    fetchMemberData();
    fetchGrades();
    fetchAllMembres();
  }, [id]);

  useEffect(() => {
    if (user && id) {
      fetchAffiliations();
      apiFetch<any[]>(`/inventaire/ventes?membreId=${id}`).then(setAchats).catch(() => {});
    }
  }, [id, user]);

  async function fetchAffiliations() {
    try {
      const res = await apiFetch<{ affiliations: any[] }>(`/affiliations?membreId=${id}`);
      setAffiliations(res.affiliations);
    } catch (err) {
      console.warn('Erreur chargement affiliations', err);
    }
  }

  const ajouterAffiliation = async () => {
    setIsAffSaving(true);
    try {
      const montant = affForm.montant.trim() === '' ? null : parseFloat(affForm.montant.replace(',', '.'));
      await apiFetch('/affiliations', {
        method: 'POST',
        body: JSON.stringify({
          membreId: id,
          discipline: affForm.discipline,
          saison: affForm.saison,
          numero: affForm.numero.trim() || null,
          montant: montant != null && !isNaN(montant) ? montant : null,
          datePaiement: affForm.datePaiement || null,
          note: affForm.note.trim() || null,
        }),
      });
      setShowAffForm(false);
      setAffForm({ discipline: 'KARATE', saison: saisonCourante(), numero: '', montant: '', datePaiement: '', note: '' });
      await fetchAffiliations();
    } catch (err: any) {
      alert(err?.message || "Erreur lors de l'ajout de l'affiliation");
    } finally {
      setIsAffSaving(false);
    }
  };

  const supprimerAffiliation = async (a: any) => {
    if (!confirm(`Supprimer l'affiliation ${a.discipline} ${a.saison} ?`)) return;
    try {
      await apiFetch(`/affiliations/${a.id}`, { method: 'DELETE' });
      await fetchAffiliations();
    } catch (err: any) {
      alert(err?.message || 'Erreur de suppression');
    }
  };

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
    setPayDate(todayLocalISO());
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
        <div className="flex items-center gap-2">
          <Button onClick={openQuickEdit} className="min-h-[40px] text-sm py-1 bg-cshp-black hover:bg-gray-800 text-white">
            <Edit3 size={16} className="mr-2" /> Édition rapide
          </Button>
          <Button variant="outline" onClick={() => setIsEditModalOpen(true)} className="min-h-[40px] text-sm py-1 border-gray-300">
            Profil complet
          </Button>
          {user?.role === 'ADMIN' && (
            <button
              title="Supprimer définitivement (doublon/test — impossible si des paiements sont encaissés)"
              className="p-2 text-gray-300 hover:text-red-600 transition-colors"
              onClick={async () => {
                if (!confirm(`Supprimer DÉFINITIVEMENT ${member.firstName} ${member.lastName} ?\n\nCette action est irréversible (fiche, échéancier, présences). Pour un membre qui quitte, utilisez plutôt le statut « Inactif ».`)) return;
                if (!confirm('Dernière confirmation : suppression définitive ?')) return;
                try {
                  await apiFetch(`/membres/${member.id}?definitif=1`, { method: 'DELETE' });
                  navigate('/membres');
                } catch (err: any) {
                  alert(err?.message || 'Suppression refusée');
                }
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
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
              <div className="inline-flex justify-center items-center gap-2">
                {getStatusBadge(member.status)}
                {/* Changement rapide de statut, sans passer par le formulaire complet */}
                <select
                  value={member.status}
                  onChange={async (e) => {
                    const nouveau = e.target.value;
                    try {
                      await apiFetch(`/membres/${member.id}/statut`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: nouveau }),
                      });
                      fetchMemberData();
                    } catch (err: any) {
                      alert(err?.message || 'Erreur lors du changement de statut');
                    }
                  }}
                  className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white text-gray-600 hover:border-gray-400 cursor-pointer"
                  title="Changer le statut"
                >
                  <option value="ACTIF">Actif</option>
                  <option value="INACTIF">Inactif</option>
                  <option value="EN_ATTENTE">En attente</option>
                </select>
              </div>
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
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Membre depuis</span>
                <span className="text-gray-800 font-semibold text-sm">
                  {member.signupDate ? formatDateLocal(member.signupDate) : '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Début du contrat en cours</span>
                <span className="text-gray-800 font-semibold text-sm">
                  {member.dateInscription ? formatDateLocal(member.dateInscription) : '-'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-gray-400 block text-xs uppercase font-extrabold">Fin du contrat en cours</span>
                <span className="text-gray-800 font-bold text-cshp-red text-sm">
                  {member.finContrat ? formatDateLocal(member.finContrat) : 'Indéfinie'}
                </span>
              </div>
            </div>

            {(member.provenance || member.refereParNom) && (
              <div className="text-sm">
                <span className="text-gray-400 block text-xs uppercase font-extrabold mb-1">Provenance</span>
                <p className="text-gray-700">
                  {{
                    BOUCHE_A_OREILLE: 'Bouche-à-oreille',
                    RESEAUX_SOCIAUX: 'Réseaux sociaux',
                    WEB: 'Web',
                    ECOLE: 'École',
                    AUTRE: 'Autre',
                  }[member.provenance as string] || member.provenance || '—'}
                  {member.refereParNom && <> · Référé par : <strong>{member.refereParNom}</strong></>}
                </p>
              </div>
            )}
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

          {/* Affiliations fédération — déterminent l'admissibilité aux compétitions (saison sept. → août) */}
          {user && (
            <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Affiliations fédération</h3>
                <button
                  onClick={() => setShowAffForm((v) => !v)}
                  className="text-xs font-bold text-cshp-red hover:underline cursor-pointer"
                >
                  {showAffForm ? 'Fermer' : '+ Ajouter'}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                L'affiliation de la saison détermine l'admissibilité aux compétitions. Le montant va à la fédération : <strong>pas un revenu du club</strong>.
              </p>

              {showAffForm && (
                <div className="p-3 bg-slate-50 rounded-xl space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Discipline</label>
                      <select
                        className="min-h-[40px] w-full border border-gray-300 rounded-lg px-2 bg-white text-sm"
                        value={affForm.discipline}
                        onChange={(e) => setAffForm({ ...affForm, discipline: e.target.value })}
                      >
                        <option value="KARATE">Karaté</option>
                        <option value="JUDO">Judo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Saison</label>
                      <select
                        className="min-h-[40px] w-full border border-gray-300 rounded-lg px-2 bg-white text-sm"
                        value={affForm.saison}
                        onChange={(e) => setAffForm({ ...affForm, saison: e.target.value })}
                      >
                        {saisonsChoix().map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <Input label="N° fédération" value={affForm.numero} onChange={(e: any) => setAffForm({ ...affForm, numero: e.target.value })} />
                    <Input label="Montant $ (fédé)" inputMode="decimal" value={affForm.montant} onChange={(e: any) => setAffForm({ ...affForm, montant: e.target.value })} />
                    <Input label="Payée le" type="date" value={affForm.datePaiement} onChange={(e: any) => setAffForm({ ...affForm, datePaiement: e.target.value })} />
                    <Input label="Note" value={affForm.note} onChange={(e: any) => setAffForm({ ...affForm, note: e.target.value })} />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={ajouterAffiliation} disabled={isAffSaving} className="!min-h-0 h-9 text-sm">
                      {isAffSaving ? 'Ajout…' : "Ajouter l'affiliation"}
                    </Button>
                  </div>
                </div>
              )}

              {affiliations.length > 0 ? (
                <div className="space-y-2">
                  {affiliations.map((a: any) => (
                    <div key={a.id} className="p-3 border border-gray-100 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={a.saison === saisonCourante() ? 'success' : 'neutral'}>
                          {a.discipline === 'KARATE' ? 'Karaté' : 'Judo'} {a.saison}
                        </Badge>
                        {a.saison === saisonCourante() && <span className="text-xs text-emerald-600 font-bold">Saison courante ✓</span>}
                        {a.numero && <span className="text-xs text-gray-500">n° {a.numero}</span>}
                        {a.montant != null && <span className="text-xs text-gray-500">{formatMontant(a.montant)} (fédé)</span>}
                        {a.datePaiement && <span className="text-xs text-gray-400">payée le {formatDateLocal(a.datePaiement)}</span>}
                      </div>
                      <button onClick={() => supprimerAffiliation(a)} className="text-red-400 hover:text-red-600 cursor-pointer" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  Aucune affiliation enregistrée — cet athlète n'est pas admissible aux compétitions {saisonCourante()}.
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* 2. ONGLET PAIEMENTS */}
      {activeTab === 'paiements' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Alerte renouvellement / solde : l'échéancier soldé ne suffit pas si le contrat est terminé. */}
          {(() => {
            const etat = etatPaiement(member);
            if (etat.type === 'RENOUVELLEMENT_DU') {
              return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span>
                    🔄 Contrat terminé le {formatDateLocal(etat.date)} — le renouvellement
                    {etat.montant ? ` (${formatMontant(etat.montant)})` : ''} est à percevoir.
                    {etat.reste ? ` Il reste aussi ${formatMontant(etat.reste)} impayés sur l'ancien contrat.` : ''}
                  </span>
                  <Button onClick={openRenew} className="shrink-0 bg-cshp-red hover:bg-red-700 text-white h-10">
                    🔄 Renouveler maintenant
                  </Button>
                </div>
              );
            }
            if (etat.type === 'RESTE_SANS_ECHEANCE') {
              return (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-semibold">
                  💰 Il reste {formatMontant(etat.reste!)} à percevoir sur ce contrat, mais aucun
                  versement n'est planifié — ajoutez l'échéance via « Modifier ».
                </div>
              );
            }
            if (etat.type === 'RENOUVELLEMENT_PROCHE') {
              return (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span>
                    🔄 Le contrat se termine le {formatDateLocal(etat.date)} — renouvellement
                    {etat.montant ? ` (${formatMontant(etat.montant)})` : ''} à prévoir.
                  </span>
                  <Button variant="outline" onClick={openRenew} className="shrink-0 h-10 border-amber-300 text-amber-800">
                    🔄 Renouveler
                  </Button>
                </div>
              );
            }
            return null;
          })()}

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
            <div className="sm:text-right space-y-2">
              <span className="text-xs text-slate-400 block uppercase font-bold">Montant contractuel final :</span>
              <span className="text-3xl font-extrabold text-cshp-red block">
                {member.montantFinal ? `${member.montantFinal.toFixed(2)} $` : '0.00 $'}
              </span>
              <button
                onClick={openRenew}
                className="text-xs font-bold text-slate-300 hover:text-white underline underline-offset-2"
              >
                🔄 Renouveler le contrat
              </button>
            </div>
          </div>

          {/* ÉCHÉANCIER COMPLET */}
          <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Échéancier de facturation</h3>
            
            {member.versements && member.versements.length > 0 ? (
              <div className="space-y-4">
                {(() => {
                  // Séparer le contrat EN COURS (échéances ≥ début du contrat) de
                  // l'historique des contrats précédents — après un renouvellement,
                  // les anciens versements payés se confondaient avec les nouveaux.
                  const debutContrat = member.dateInscription ? new Date(member.dateInscription).getTime() : null;
                  const tous = member.versements as any[];
                  const actuels = debutContrat ? tous.filter((v: any) => new Date(v.datePrevue).getTime() >= debutContrat) : tous;
                  const historique = debutContrat ? tous.filter((v: any) => new Date(v.datePrevue).getTime() < debutContrat) : [];
                  return (
                    <>
                      {historique.length > 0 && (
                        <p className="text-[11px] uppercase font-extrabold text-gray-400 tracking-wider">
                          Contrat en cours (depuis le {formatDateLocal(member.dateInscription)})
                        </p>
                      )}
                      {actuels.length === 0 && (
                        <p className="text-xs text-gray-400 italic">Aucun versement sur le contrat en cours.</p>
                      )}
                      {[...actuels, ...(showHistorique ? historique : [])].map((v: any, index: number) => {
                  const isPaid = !!v.datePaiement;
                  const isLate = !isPaid && joursAvantEcheance(v.datePrevue) < 0;
                  // Frais de retard (règlement art. 6) : 10 $/sem après 7 jours, sauf exonération.
                  const joursRetard = isLate ? -joursAvantEcheance(v.datePrevue) : 0;
                  const frais = !v.exonererFraisRetard && joursRetard > 7 ? Math.floor(joursRetard / 7) * 10 : 0;
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
                          {((isLate && (frais > 0 || v.exonererFraisRetard)) || v.fraisRetardFactures != null) && (
                            <p className={v.exonererFraisRetard ? 'text-gray-400' : 'text-red-600 font-semibold'}>
                              {v.exonererFraisRetard
                                ? 'Frais de retard exonérés'
                                : v.fraisRetardFactures != null
                                  ? <>Frais chargés : {v.fraisRetardFactures.toFixed(2)} $ <span className="text-gray-400 font-normal">(compteur : {frais} $)</span></>
                                  : `Frais de retard courus : ${frais} $ (10 $/semaine)`}
                              {user?.role === 'ADMIN' && (
                                <>
                                  <button
                                    className="ml-2 underline text-[11px] text-gray-500 hover:text-gray-800"
                                    onClick={async () => {
                                      // Charger un montant CHOISI (ex. 4 sem = 40 $ courus, ne charger que 10 $).
                                      const saisie = prompt(
                                        `Frais de retard à charger pour ce versement\n(compteur automatique : ${frais} $ · vide = revenir à l'automatique · 0 = aucun frais)`,
                                        v.fraisRetardFactures != null ? String(v.fraisRetardFactures) : ''
                                      );
                                      if (saisie === null) return;
                                      const montant = saisie.trim() === '' ? null : Number(saisie.replace(',', '.'));
                                      if (montant !== null && (isNaN(montant) || montant < 0)) { alert('Montant invalide'); return; }
                                      try {
                                        await apiFetch(`/versements/${v.id}/frais-retard`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ montantFacture: montant }),
                                        });
                                        fetchMemberData();
                                      } catch (err: any) {
                                        alert(err?.message || 'Erreur');
                                      }
                                    }}
                                  >
                                    {v.fraisRetardFactures != null ? 'Modifier le montant' : 'Charger un montant'}
                                  </button>
                                  <button
                                    className="ml-2 underline text-[11px] text-gray-500 hover:text-gray-800"
                                    onClick={async () => {
                                      try {
                                        await apiFetch(`/versements/${v.id}/frais-retard`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ exonerer: !v.exonererFraisRetard }),
                                        });
                                        fetchMemberData();
                                      } catch (err: any) {
                                        alert(err?.message || 'Erreur');
                                      }
                                    }}
                                  >
                                    {v.exonererFraisRetard ? 'Rétablir les frais' : 'Exonérer'}
                                  </button>
                                </>
                              )}
                            </p>
                          )}
                          {isPaid && (
                            <div className="bg-slate-100/60 text-slate-700 p-2 rounded-lg mt-2 text-[11px] font-medium border border-slate-200/50">
                              Payé le {formatDateLocal(v.datePaiement) || '-'} via <span className="uppercase font-bold">{v.methodePaiement}</span>
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
                        {user?.role === 'ADMIN' && (
                          <div className="flex gap-3">
                            {isPaid && (
                              <button
                                onClick={() => annulerPaiementVersement(v)}
                                className="text-[11px] underline text-gray-400 hover:text-amber-700 cursor-pointer"
                                title="Erreur d'encaissement : le versement redevient à percevoir"
                              >
                                ↩ Annuler le paiement
                              </button>
                            )}
                            <button
                              onClick={() => supprimerVersement(v)}
                              className="text-[11px] underline text-gray-400 hover:text-red-600 cursor-pointer"
                              title="Supprimer ce versement (erreur de saisie, doublon)"
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                      {historique.length > 0 && (
                        <button
                          onClick={() => setShowHistorique((h) => !h)}
                          className="w-full text-left text-xs font-bold text-gray-500 hover:text-cshp-black cursor-pointer py-2 border-t border-dashed border-gray-200"
                        >
                          {showHistorique ? '▾ Masquer' : '▸ Afficher'} l'historique des contrats précédents ({historique.length} versement{historique.length > 1 ? 's' : ''}, tous antérieurs au {formatDateLocal(member.dateInscription)})
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun échéancier de paiement disponible pour ce membre.</p>
            )}
          </Card>

          {/* Achats d'équipement — tracés au dossier, JAMAIS ajoutés automatiquement à la facture annuelle */}
          {user && achats.length > 0 && (
            <Card className="p-6 bg-white border border-gray-100 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b pb-1">Achats d'équipement</h3>
              <div className="space-y-2">
                {achats.map((v: any) => (
                  <div key={v.id} className="p-3 border border-gray-100 rounded-xl flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <span className="font-semibold text-gray-900">
                        {v.quantite > 1 ? `${v.quantite} × ` : ''}
                        {[v.article?.nom, v.article?.marque, v.article?.couleur, v.article?.taille ? `t. ${v.article.taille}` : null].filter(Boolean).join(' · ')}
                      </span>
                      <span className="text-xs text-gray-400 block">{formatDateLocal(v.date)}{v.note ? ` — ${v.note}` : ''}</span>
                    </div>
                    <span className="font-bold text-gray-900">{formatMontant(v.prixUnitaire * v.quantite)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 italic">
                Ces achats ne sont pas ajoutés automatiquement à la facture annuelle ni aux revenus de cotisations (ajout manuel si souhaité).
              </p>
            </Card>
          )}
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

      {/* MODALE RENOUVELLEMENT : nouveau contrat + encaissement immédiat */}
      <Modal isOpen={isRenewOpen} onClose={() => !isRenewing && setIsRenewOpen(false)} title="Renouveler le contrat" width="lg">
        <div className="space-y-4">
          <p className="text-xs text-cshp-gray -mt-2">
            Crée le nouveau contrat ({renew.plan === 'ANNUEL' ? '12 mois' : '3 mois'}) et ajoute son
            échéancier à la suite de l'historique — rien n'est effacé, l'ancienneté ne change pas.
            Le reçu part automatiquement (sauf comptant).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Formule</label>
              <select
                value={renew.plan}
                onChange={(e) => setRenew((p: any) => ({
                  ...p, plan: e.target.value,
                  montant: e.target.value === 'ANNUEL' ? (member?.plan === 'ANNUEL' && member?.montantFinal ? member.montantFinal : 790) : (member?.plan === 'TRIMESTRIEL' && member?.montantFinal ? member.montantFinal : 250),
                  nbVersements: 1,
                }))}
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
              >
                <option value="TRIMESTRIEL">Trimestriel (3 mois)</option>
                <option value="ANNUEL">Annuel (12 mois)</option>
              </select>
            </div>
            <Input label="Montant du contrat ($)" type="number" step="0.01" value={renew.montant} onChange={rn('montant')} />
            <div>
              <Input label="Début du nouveau contrat" type="date" value={renew.dateDebut} onChange={rn('dateDebut')} />
              <p className="text-xs text-cshp-gray mt-1">
                Par défaut : la fin de l'ancien contrat (continuité du service). Modifie-la
                seulement si l'athlète a fait une vraie pause.
              </p>
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Nombre de versements</label>
              {renew.plan === 'TRIMESTRIEL' ? (
                <div className="min-h-[44px] border border-gray-200 rounded-lg px-3 bg-gray-50 flex items-center text-sm text-cshp-gray">
                  1 fois (règle du trimestriel)
                </div>
              ) : (
                <select
                  value={renew.nbVersements}
                  onChange={rn('nbVersements')}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
                >
                  <option value={1}>1 fois</option>
                  <option value={2}>2 fois (1 par mois)</option>
                  <option value={3}>3 fois (1 par mois)</option>
                </select>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-cshp-black font-medium">
            <input
              type="checkbox"
              checked={!!renew.encaisser}
              onChange={(e) => setRenew((p: any) => ({ ...p, encaisser: e.target.checked }))}
              className="w-5 h-5 rounded text-cshp-red focus:ring-cshp-red"
            />
            Encaisser le 1ᵉʳ versement maintenant
          </label>
          {renew.encaisser && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <label className="block mb-1 text-sm font-medium text-cshp-black">Méthode</label>
                <select
                  value={renew.methode}
                  onChange={rn('methode')}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
                >
                  <option value="COMPTANT">COMPTANT</option>
                  <option value="VIREMENT">VIREMENT</option>
                  <option value="CHEQUE">CHÈQUE</option>
                  <option value="CARTE">CARTE</option>
                </select>
              </div>
              <Input label="Date du paiement" type="date" value={renew.datePaiement} onChange={rn('datePaiement')} />
            </div>
          )}

          <div className="text-xs text-cshp-gray bg-slate-50 border border-slate-200 rounded-lg p-3">
            Résumé : contrat du <strong>{renew.dateDebut}</strong>, {renew.plan === 'ANNUEL' ? 'annuel' : 'trimestriel'},{' '}
            <strong>{Number(renew.montant || 0).toFixed(2)} $</strong> en{' '}
            {renew.plan === 'TRIMESTRIEL' ? 1 : renew.nbVersements} versement(s)
            {renew.encaisser ? ' — 1ᵉʳ versement encaissé immédiatement.' : ' — aucun encaissement immédiat.'}
          </div>

          <div className="flex gap-3 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={() => setIsRenewOpen(false)} className="flex-1" disabled={isRenewing}>
              Annuler
            </Button>
            <Button onClick={submitRenew} isLoading={isRenewing} className="flex-1 bg-cshp-red hover:bg-red-700 text-white">
              Confirmer le renouvellement
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODALE ÉDITION RAPIDE : champs simples, sans toucher au plan ni à l'échéancier */}
      <Modal isOpen={isQuickEditOpen} onClose={() => !isQuickSaving && setIsQuickEditOpen(false)} title="Édition rapide" width="lg">
        <div className="space-y-4">
          <p className="text-xs text-cshp-gray -mt-2">
            Modifie les informations courantes sans passer par les étapes du profil complet.
            Le plan, l'échéancier et les paiements ne sont pas touchés.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Groupe</label>
              <select
                value={quickEdit.groupe}
                onChange={qe('groupe')}
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
              >
                {sectionsDisponibles.map((s: any) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Ceinture</label>
              <select
                value={quickEdit.ceinture}
                onChange={qe('ceinture')}
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
              >
                {CEINTURES_LIST.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Input label="Téléphone (athlète)" value={quickEdit.phone} onChange={qe('phone')} />
            <Input label="Courriel (athlète)" value={quickEdit.email} onChange={qe('email')} />
            <Input label="Nom du parent" value={quickEdit.parentName} onChange={qe('parentName')} />
            <Input label="Téléphone du parent" value={quickEdit.parentPhone} onChange={qe('parentPhone')} />
            <div className="sm:col-span-2">
              <Input label="Courriel du parent (rappels et reçus — ';' pour plusieurs)" value={quickEdit.parentEmail} onChange={qe('parentEmail')} />
            </div>
            <Input label="Date de naissance" type="date" value={quickEdit.dob} onChange={qe('dob')} />
            <div>
              <Input label="Membre depuis (1re inscription)" type="date" value={quickEdit.membreDepuis} onChange={qe('membreDepuis')} />
              <p className="text-xs text-cshp-gray mt-1">L'ancienneté au club — ne change pas lors d'un renouvellement.</p>
            </div>
            <Input label="Poids (kg)" type="number" step="0.1" value={quickEdit.poids} onChange={qe('poids')} />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-cshp-black">Notes</label>
            <textarea
              value={quickEdit.notes}
              onChange={qe('notes')}
              rows={3}
              className="w-full border border-gray-300 rounded-lg p-3 bg-white text-sm"
            />
          </div>
          <div className="flex gap-3 pt-3 border-t border-gray-100">
            <Button variant="outline" onClick={() => setIsQuickEditOpen(false)} className="flex-1" disabled={isQuickSaving}>
              Annuler
            </Button>
            <Button onClick={saveQuickEdit} isLoading={isQuickSaving} className="flex-1">
              Enregistrer
            </Button>
          </div>
        </div>
      </Modal>

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
