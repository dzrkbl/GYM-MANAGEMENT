import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { createMembre, updateMembre, apiFetch } from '../../lib/api';
import { calculerMontantFinal, calculerFinContrat, TARIFS } from '../../lib/tarifs';
import { User, CreditCard, ChevronRight, ChevronLeft, Plus, Trash, Search, Check, AlertCircle } from 'lucide-react';
import { useSections } from '../../hooks/useSections';
import { formatDateLocal } from '../../lib/format';

interface MembreFormProps {
  membre?: any; // Si fourni, on est en mode édition
  onSuccess: () => void;
  onCancel: () => void;
}

const CEINTURES_LIST = [
  "Blanche",
  "Blanche-Jaune",
  "Jaune",
  "Jaune-Orange",
  "Orange",
  "Orange-Verte",
  "Verte",
  "Verte-Bleue",
  "Bleue",
  "Bleue-Marron",
  "Marron 1",
  "Marron 2",
  "Marron 3",
  "Noire"
];

export function MembreForm({ membre, onSuccess, onCancel }: MembreFormProps) {
  const isEditing = !!membre;
  const { sections, getLabel } = useSections();

  const GROUPES = useMemo(() => {
    const list = sections.map(s => ({ value: s.code, label: s.label }));
    if (!list.some(item => item.value === 'MENSUEL')) {
      list.push({ value: 'MENSUEL', label: 'Mensuel' });
    }
    return list;
  }, [sections]);

  // Étape courante (1 à 4)
  const [currentStep, setCurrentStep] = useState(1);

  // Liste de tous les membres pour la recherche (famille, référent)
  const [membresList, setMembresList] = useState<any[]>([]);
  const [searchFamille, setSearchFamille] = useState('');
  const [searchReferent, setSearchReferent] = useState('');
  const [showFamilleDropdown, setShowFamilleDropdown] = useState(false);
  const [showReferentDropdown, setShowReferentDropdown] = useState(false);

  // Charger les membres pour la recherche
  useEffect(() => {
    apiFetch<any[]>('/membres')
      .then(res => {
        // exclure le membre lui-même en mode édition
        const list = Array.isArray(res) ? res : [];
        setMembresList(isEditing ? list.filter((m: any) => m.id !== membre.id) : list);
      })
      .catch(err => console.error('Erreur chargement membres:', err));
  }, [isEditing, membre]);

  // --- ÉTAT DU FORMULAIRE ---
  // Section A
  const [firstName, setFirstName] = useState(membre?.firstName || '');
  const [lastName, setLastName] = useState(membre?.lastName || '');
  const [email, setEmail] = useState(membre?.email || '');
  const [phone, setPhone] = useState(membre?.phone || '');
  const [dob, setDob] = useState(membre?.dateOfBirth ? membre.dateOfBirth.split('T')[0] : '');
  const [poids, setPoids] = useState<number | ''>(membre?.poids !== undefined && membre?.poids !== null ? membre.poids : '');
  const [groupe, setGroupe] = useState(membre?.groupe || '');

  useEffect(() => {
    if (GROUPES.length > 0 && !groupe) {
      setGroupe(GROUPES[0].value);
    }
  }, [GROUPES, groupe]);
  const [belt, setBelt] = useState(membre?.sections?.[0]?.belt || 'Blanche');
  const [tailleBelt, setTailleBelt] = useState(membre?.sections?.[0]?.beltSize || '');
  const [status, setStatus] = useState<any>(membre?.status || 'ACTIF');
  const [notes, setNotes] = useState(membre?.notes || '');

  // Section B
  const [dateInscription, setDateInscription] = useState(
    membre?.dateInscription ? membre.dateInscription.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [plan, setPlan] = useState<'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL'>(membre?.plan || 'TRIMESTRIEL');
  const [montantCustom, setMontantCustom] = useState<number | ''>(
    membre?.plan === 'MENSUEL' ? (membre.prixBase || '') : ''
  );

  useEffect(() => {
    if (plan !== 'MENSUEL') {
      setMontantCustom('');
    }
  }, [plan]);

  const [rabaisFamille, setRabaisFamille] = useState(membre?.rabaisFamille || false);
  const [membreFamilleId, setMembreFamilleId] = useState(membre?.membreFamilleId || '');
  const [rabaisCustomPct, setRabaisCustomPct] = useState<number | ''>(membre?.rabaisCustomPct || '');
  const [raisonRabaisCustom, setRaisonRabaisCustom] = useState(membre?.raisonRabaisCustom || '');

  // Section C
  const [modeVersement, setModeVersement] = useState<'1' | '2' | '3' | 'custom'>(
    membre?.versements && membre.versements.length > 0
      ? (membre.versements.length <= 3 && !membre.versements.some((v: any, i: number) => {
          // vérifier si les montants sont inégaux ou non standards
          return false; // par défaut garder custom s'il y a des versements ou essayer de détecter
        }) ? `${membre.versements.length}` as any : 'custom')
      : '3'
  );
  const [versements, setVersements] = useState<any[]>(() => {
    if (membre?.versements && membre.versements.length > 0) {
      return membre.versements.map((v: any) => ({
        id: v.id,
        numeroVersement: v.numeroVersement,
        montant: v.montant,
        datePrevue: v.datePrevue.split('T')[0],
        datePaiement: v.datePaiement ? v.datePaiement.split('T')[0] : null,
        methodePaiement: v.methodePaiement || null,
        note: v.note || '',
      }));
    }
    return [];
  });

  // Section D
  const [referePar, setReferePar] = useState(membre?.referePar || '');
  const [rabaisReferentPct, setRabaisReferentPct] = useState<number | ''>(membre?.rabaisReferentPct || '');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // --- CALCULS TEMPS RÉEL ---
  // Âge calculé à la volée
  const age = useMemo(() => {
    if (!dob) return null;
    const birthYear = new Date(dob).getFullYear();
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  }, [dob]);

  // Prix de base
  const prixBase = useMemo(() => {
    if (plan === 'MENSUEL') return typeof montantCustom === 'number' ? montantCustom : 0;
    return TARIFS[plan]?.base ?? 0;
  }, [plan, montantCustom]);

  // Montant final calculé en temps réel
  const montantFinalCalculated = useMemo(() => {
    const pct = rabaisCustomPct !== '' && rabaisCustomPct !== null
      ? Number(rabaisCustomPct)
      : null;
    return calculerMontantFinal({
      plan,
      rabaisFamille,
      rabaisCustomPct: pct && pct > 0 ? pct : null,
      prixBase,
    });
  }, [plan, rabaisFamille, rabaisCustomPct, prixBase]);

  // Fin du contrat calculée automatiquement
  const finContratCalculated = useMemo(() => {
    return calculerFinContrat(dateInscription, plan);
  }, [dateInscription, plan]);

  // Total des versements actuels
  const totalVersements = useMemo(() => {
    return versements.reduce((acc, curr) => acc + (Number(curr.montant) || 0), 0);
  }, [versements]);

  const areVersementsValid = useMemo(() => {
    return Math.abs(totalVersements - montantFinalCalculated) < 0.01;
  }, [totalVersements, montantFinalCalculated]);

  // --- SERVICES DE RECHERCHE ---
  const filteredMembresFamille = useMemo(() => {
    if (!searchFamille) return membresList;
    return membresList.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchFamille.toLowerCase())
    );
  }, [searchFamille, membresList]);

  const filteredMembresReferent = useMemo(() => {
    if (!searchReferent) return membresList;
    return membresList.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchReferent.toLowerCase())
    );
  }, [searchReferent, membresList]);

  // Nom du parrain/famille résolu pour l'affichage de recherche
  const selectedFamilleLabel = useMemo(() => {
    if (!membreFamilleId) return '';
    const m = membresList.find(x => x.id === membreFamilleId);
    return m ? `${m.firstName} ${m.lastName}` : '';
  }, [membreFamilleId, membresList]);

  const selectedReferentLabel = useMemo(() => {
    if (!referePar) return '';
    const m = membresList.find(x => x.id === referePar);
    return m ? `${m.firstName} ${m.lastName}` : '';
  }, [referePar, membresList]);

  // --- MISE À JOUR DE L'ÉCHÉANCIER AUTOMATIQUE ---
  useEffect(() => {
    if (modeVersement !== 'custom') {
      const parts = Number(modeVersement);
      if (isNaN(parts) || parts <= 0) return;

      const baseAmount = Math.floor((montantFinalCalculated / parts) * 100) / 100;
      const roundedVersements = [];

      for (let i = 1; i <= parts; i++) {
        const d = new Date(dateInscription);
        d.setMonth(d.getMonth() + (i - 1));
        
        // Ajuster le dernier versement pour pallier les arrondis
        const montantStr = i === parts 
          ? (montantFinalCalculated - (baseAmount * (parts - 1))).toFixed(2)
          : baseAmount.toFixed(2);

        roundedVersements.push({
          numeroVersement: i,
          montant: Number(montantStr),
          datePrevue: d.toISOString().split('T')[0],
          datePaiement: null,
          methodePaiement: null,
          note: '',
        });
      }
      setVersements(roundedVersements);
    }
  }, [modeVersement, montantFinalCalculated, dateInscription]);

  const addCustomVersement = () => {
    const nextNum = versements.length + 1;
    const d = new Date(dateInscription);
    d.setMonth(d.getMonth() + (nextNum - 1));

    setVersements([
      ...versements,
      {
        numeroVersement: nextNum,
        montant: 0,
        datePrevue: d.toISOString().split('T')[0],
        datePaiement: null,
        methodePaiement: null,
        note: '',
      }
    ]);
  };

  const removeVersement = (index: number) => {
    const updated = versements.filter((_, i) => i !== index).map((v, i) => ({
      ...v,
      numeroVersement: i + 1
    }));
    setVersements(updated);
  };

  const updateVersementField = (index: number, field: string, val: any) => {
    const next = [...versements];
    next[index] = { ...next[index], [field]: val };
    setVersements(next);
  };

  // --- ACTIONS NAVIGATION ---
  const handleNext = () => {
    if (currentStep === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setErrorMessage("Le prénom et le nom sont requis.");
        return;
      }
      setErrorMessage("");
    }
    if (currentStep === 2) {
      setErrorMessage("");
    }
    if (currentStep === 3) {
      if (!areVersementsValid) {
        setErrorMessage("Le total des versements doit être exactement égal au montant final.");
        return;
      }
      setErrorMessage("");
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handlePrev = () => {
    setErrorMessage("");
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // --- APPUIS DE SOUMISSION ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('Le prénom et le nom sont obligatoires.');
      setCurrentStep(1);
      return;
    }

    if (!areVersementsValid) {
      setErrorMessage(`La somme des versements (${totalVersements.toFixed(2)} $) ne correspond pas au montant calculé (${montantFinalCalculated.toFixed(2)} $).`);
      setCurrentStep(3);
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        dob: dob || null,
        poids: poids !== '' ? Number(poids) : null,
        groupe,
        sections: [{ section: groupe, belt: belt || "Blanche" }],
        notes,
        status,
        dateInscription,
        finContrat: finContratCalculated.toISOString().split('T')[0],
        plan,
        prixBase,
        rabaisFamille,
        membreFamilleId: rabaisFamille ? membreFamilleId : null,
        rabaisCustomPct: rabaisCustomPct !== '' ? Number(rabaisCustomPct) : null,
        raisonRabaisCustom: rabaisCustomPct !== '' ? raisonRabaisCustom : null,
        montantFinal: montantFinalCalculated,
        referePar: referePar || null,
        rabaisReferentPct: rabaisReferentPct !== '' ? Number(rabaisReferentPct) : null,
        versements: versements.map(v => ({
          numeroVersement: v.numeroVersement,
          montant: Number(v.montant),
          datePrevue: v.datePrevue,
          datePaiement: v.datePaiement,
          methodePaiement: v.methodePaiement,
          note: v.note,
        })),
      };

      if (isEditing) {
        await updateMembre(membre.id, payload);
      } else {
        await createMembre(payload);
      }

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-md border border-gray-100 overflow-hidden">
      {/* Header & Steps progress bar */}
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h2 className="text-lg font-bold text-center text-gray-800">
          {isEditing ? `Modifier le membre : ${membre.firstName} ${membre.lastName}` : "Création d'un nouveau membre"}
        </h2>
        {/* Steps indicator */}
        <div className="flex items-center justify-between mt-4 max-w-md mx-auto relative px-4">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2 z-0" />
          {[1, 2, 3, 4].map(step => (
            <button
              key={step}
              type="button"
              onClick={() => step < currentStep || (step === 1 || firstName && lastName) ? setCurrentStep(step) : null}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs z-10 border transition-all ${
                currentStep === step
                  ? 'bg-cshp-red text-white border-cshp-red shadow-sm'
                  : currentStep > step
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
            >
              {currentStep > step ? <Check className="w-4 h-4" /> : step}
            </button>
          ))}
        </div>
        <div className="flex justify-between max-w-md mx-auto text-[10px] text-gray-500 font-medium px-1 mt-1 text-center">
          <span className={currentStep === 1 ? 'text-cshp-red font-bold' : ''}>Profil</span>
          <span className={currentStep === 2 ? 'text-cshp-red font-bold' : ''}>Contrat</span>
          <span className={currentStep === 3 ? 'text-cshp-red font-bold' : ''}>Échéances</span>
          <span className={currentStep === 4 ? 'text-cshp-red font-bold' : ''}>Parrainage</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
        {errorMessage && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded flex items-start gap-2 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* --- ÉTAPE 1 : PROFIL --- */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Étape 1 — Informations personnelles</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Prénom *"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Ex. Jean"
                required
              />
              <Input
                label="Nom *"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Ex. Dupont"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Email(s) (séparez par ';' pour plusieurs)"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Ex. email@test.com; parent@test.com"
                />
              </div>
              <Input
                label="Téléphone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Ex. 514-123-4567"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Date de naissance</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    className="flex-1 min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
                  />
                  {age !== null && (
                    <Badge variant="neutral" className="h-10 px-3 bg-gray-100 flex items-center justify-center text-sm">
                      {age} ans
                    </Badge>
                  )}
                </div>
              </div>
              <Input
                label="Poids (kg)"
                type="number"
                step="0.1"
                value={poids}
                onChange={e => setPoids(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex. 72.5"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Groupe</label>
                <select
                  value={groupe}
                  onChange={e => setGroupe(e.target.value)}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                >
                  {GROUPES.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Ceinture (Grade)</label>
                <select
                  value={belt}
                  onChange={e => setBelt(e.target.value)}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                >
                  {CEINTURES_LIST.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Taille de ceinture"
                value={tailleBelt}
                onChange={e => setTailleBelt(e.target.value)}
                placeholder="Ex. 3, 4, M..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Statut d'activité</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                >
                  <option value="ACTIF">Actif</option>
                  <option value="INACTIF">Inactif</option>
                  <option value="EN_ATTENTE">En attente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-cshp-black mb-1">Notes médicales ou générales</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 bg-white text-sm min-h-[80px]"
                placeholder="Asthme, allergies, dispense, dispense d'activité..."
              />
            </div>
          </div>
        )}

        {/* --- ÉTAPE 2 : CONTRAT --- */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Étape 2 — Contrat & Tarification</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Date d'inscription</label>
                <input
                  type="date"
                  value={dateInscription}
                  onChange={e => setDateInscription(e.target.value)}
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cshp-black mb-1">Date fin de contrat auto</label>
                <div className="w-full min-h-[44px] border border-gray-200 bg-gray-50 rounded-lg px-3 flex items-center text-gray-700 text-sm font-medium">
                  {formatDateLocal(finContratCalculated)}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-cshp-black mb-2">Choix du plan d'abonnement</label>
              <div className="grid grid-cols-3 gap-3">
                {(['MENSUEL', 'TRIMESTRIEL', 'ANNUEL'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`p-4 border rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                      plan === p
                        ? 'border-cshp-red bg-red-50 text-cshp-red font-bold ring-2 ring-cshp-red ring-opacity-20'
                        : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    <span className="text-xs uppercase font-semibold">{p}</span>
                    <span className="text-lg">
                      {TARIFS[p].base !== null ? `${TARIFS[p].base} $` : 'Sur mesure'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {plan === 'MENSUEL' && (
              <Input
                label="Montant personnalisé ($) *"
                type="number"
                value={montantCustom}
                onChange={e => setMontantCustom(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex. 120"
                required
              />
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-start gap-3">
                <input
                  id="rabaisFamille"
                  type="checkbox"
                  checked={rabaisFamille}
                  onChange={e => setRabaisFamille(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-cshp-red focus:ring-cshp-red mt-0.5"
                />
                <div className="flex-1">
                  <label htmlFor="rabaisFamille" className="text-sm font-bold text-gray-800">
                    Bénéficie du rabais famille (-10 %)
                  </label>
                  <p className="text-xs text-gray-500">
                    S'applique si un autre membre de la même famille est inscrit.
                  </p>
                </div>
              </div>

              {rabaisFamille && (
                <div className="relative pt-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Membre principal lié *
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-9 pr-3 min-h-[40px] border border-gray-300 bg-white rounded-lg text-sm"
                      placeholder="Rechercher par prénom ou nom de famille..."
                      value={searchFamille || selectedFamilleLabel}
                      onFocus={() => setShowFamilleDropdown(true)}
                      onBlur={() => setTimeout(() => setShowFamilleDropdown(false), 200)}
                      onChange={e => {
                        setSearchFamille(e.target.value);
                        setMembreFamilleId('');
                      }}
                    />
                  </div>

                  {showFamilleDropdown && filteredMembresFamille.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      {filteredMembresFamille.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 border-b border-gray-100 last:border-0 flex justify-between"
                          onMouseDown={() => {
                            setMembreFamilleId(m.id);
                            setSearchFamille(`${m.firstName} ${m.lastName}`);
                            setShowFamilleDropdown(false);
                          }}
                        >
                          <span className="font-semibold text-gray-800">{m.firstName} {m.lastName}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase">{m.groupe}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {membreFamilleId && (
                    <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1 font-semibold">
                      <Check className="w-3.5 h-3.5" /> Lié à : {selectedFamilleLabel}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Rabais supplémentaire (%)"
                type="number"
                min="0"
                max="100"
                value={rabaisCustomPct}
                onChange={e => setRabaisCustomPct(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex. 15 (pour -15%)"
              />
              <Input
                label="Raison du rabais supplémentaire"
                value={raisonRabaisCustom}
                onChange={e => setRaisonRabaisCustom(e.target.value)}
                placeholder="Ex. Partenariat club, ami..."
                disabled={rabaisCustomPct === ''}
              />
            </div>

            {/* GRAND AFFICHAGE DU FACTEUR TARIF */}
            <div className="bg-slate-900 text-white rounded-xl p-5 flex justify-between items-center shadow-inner mt-4">
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                  Abonnement {plan}
                </span>
                <span className="text-xs text-slate-300 block">
                  Base: {prixBase} $ {rabaisFamille && '• Rabais Famille (-10%)'} {Number(rabaisCustomPct) > 0 && `• Rabais custom (-${rabaisCustomPct}%)`}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Montant final de la cotisation :</span>
                <span className="text-3xl font-extrabold text-cshp-red">
                  {montantFinalCalculated.toFixed(2)} $
                </span>
              </div>
            </div>
          </div>
        )}

        {/* --- ÉTAPE 3 : ÉCHÉANCIER --- */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Étape 3 — Échéancier de paiements</h3>
            
            <div className="bg-slate-50 border p-4 rounded-xl flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Cotisation finale due :</span>
              <span className="text-lg font-bold text-gray-900 border-b border-dashed border-gray-400">
                {montantFinalCalculated.toFixed(2)} $
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-cshp-black mb-2">Option de fractionnement</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: '1', label: '1 fois' },
                  { value: '2', label: '2 fois' },
                  { value: '3', label: '3 fois' },
                  { value: 'custom', label: 'Perso.' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setModeVersement(opt.value as any)}
                    className={`py-3 px-1 border rounded-lg text-xs font-bold transition-all text-center ${
                      modeVersement === opt.value
                        ? 'border-cshp-red bg-red-50 text-cshp-red'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-gray-600 uppercase">Versements programmés</h4>
                {modeVersement === 'custom' && (
                  <Button type="button" variant="outline" className="text-xs !min-h-0 h-8 px-2.5 flex items-center gap-1" onClick={addCustomVersement}>
                    <Plus className="w-3.5 h-3.5" /> Ajouter
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {versements.map((v, i) => (
                  <div key={i} className="flex gap-2 items-center bg-white border border-gray-200 p-3 rounded-lg relative">
                    <span className="w-6 text-sm font-bold text-gray-400 text-center">#{v.numeroVersement}</span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        label="Cotisation ($)"
                        type="number"
                        step="0.01"
                        value={v.montant}
                        onChange={e => updateVersementField(i, 'montant', Number(e.target.value))}
                        disabled={modeVersement !== 'custom'}
                        required
                      />
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Date prévue</label>
                        <input
                          type="date"
                          value={v.datePrevue}
                          onChange={e => updateVersementField(i, 'datePrevue', e.target.value)}
                          className="w-full min-h-[44px] border border-gray-300 rounded-lg px-2 text-sm bg-white"
                          required
                        />
                      </div>
                    </div>
                    {modeVersement === 'custom' && (
                      <button
                        type="button"
                        onClick={() => removeVersement(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* STATUT COMPARAISON VERSEMENTS */}
              <div className={`mt-2 p-3 rounded-lg text-xs font-bold flex items-center justify-between border ${
                areVersementsValid
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}>
                <span>Total de l'échéancier : {totalVersements.toFixed(2)} $</span>
                <span>Cible : {montantFinalCalculated.toFixed(2)} $</span>
                <span>
                  {areVersementsValid ? "✅ Équilibré" : "⚠️ Déséquilibré, ajustez les versements"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* --- ÉTAPE 4 : PARRAINAGE --- */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Étape 4 — Parrainage & Référencement</h3>
            
            <div className="bg-slate-50 border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Référé par (Parrain)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-3 min-h-[44px] border border-gray-300 bg-white rounded-lg text-sm"
                    placeholder="Entrez le prénom ou nom du membre parrain..."
                    value={searchReferent || selectedReferentLabel}
                    onFocus={() => setShowReferentDropdown(true)}
                    onBlur={() => setTimeout(() => setShowReferentDropdown(false), 200)}
                    onChange={e => {
                      setSearchReferent(e.target.value);
                      setReferePar('');
                    }}
                  />
                </div>

                {showReferentDropdown && filteredMembresReferent.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                    {filteredMembresReferent.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 border-b border-gray-100 last:border-0 flex justify-between"
                        onMouseDown={() => {
                          setReferePar(m.id);
                          setSearchReferent(`${m.firstName} ${m.lastName}`);
                          setShowReferentDropdown(false);
                        }}
                      >
                        <span className="font-semibold text-gray-800">{m.firstName} {m.lastName}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase">{m.groupe}</span>
                      </button>
                    ))}
                  </div>
                )}

                {referePar && (
                  <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1 font-semibold">
                    <Check className="w-3.5 h-3.5" /> Parrain sélectionné : {selectedReferentLabel}
                  </div>
                )}
              </div>

              {referePar && (
                <div className="space-y-2 pt-2 animate-fadeIn">
                  <Input
                    label="Rabais pour le référent (%)"
                    type="number"
                    min="0"
                    max="100"
                    value={rabaisReferentPct}
                    onChange={e => setRabaisReferentPct(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ex. 10 (pour offrir -10%)"
                  />
                  <p className="text-xs text-amber-600 italic font-medium leading-relaxed">
                    * Ce rabais sera appliqué au prochain renouvellement d'abonnement du référent, pas sur le contrat actuel.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase">Récapitulatif</h4>
              <div className="text-xs text-gray-600 space-y-1">
                <p>• Membre : <strong className="text-gray-900">{firstName} {lastName}</strong></p>
                <p>• Groupe : <strong className="text-gray-900">{getLabel(groupe) || groupe}</strong> (Ceinture : {belt})</p>
                <p>• Plan : <strong className="text-gray-900">{plan}</strong> ({montantFinalCalculated.toFixed(2)} $)</p>
                <p>• Échéances : <strong className="text-slate-800">{versements.length} versement(s)</strong></p>
                <p>• Fin de contrat : <strong className="text-gray-900">{formatDateLocal(finContratCalculated)}</strong></p>
              </div>
            </div>
          </div>
        )}

        {/* --- BOUTONS NAVIGATION BAS --- */}
        <div className="flex gap-4 pt-4 border-t border-gray-200">
          {currentStep > 1 ? (
            <Button type="button" variant="outline" onClick={handlePrev} className="flex-1 flex justify-center items-center gap-1 h-11">
              <ChevronLeft className="w-4 h-4" /> Précédent
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">
              Annuler
            </Button>
          )}

          {currentStep < 4 ? (
            <Button type="button" onClick={handleNext} className="flex-1 flex justify-center items-center gap-1 h-11 bg-slate-800 hover:bg-slate-900">
              Suivant <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" isLoading={isLoading} className="flex-1 h-11 bg-cshp-red hover:bg-red-700 text-white font-bold">
              {isEditing ? 'Sauvegarder les modifications' : 'Enregistrer le membre'}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
