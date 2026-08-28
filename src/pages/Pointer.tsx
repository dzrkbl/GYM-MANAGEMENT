import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useSections } from '../hooks/useSections';
import { formatDateLocal } from '../lib/format';
import { etatPaiement } from '../lib/echeances';

interface Course {
  id: string;
  section: string;
  startTime: string;
  endTime: string;
  coach?: { firstName: string; lastName: string } | null;
}

interface Versement {
  montant: number;
  datePrevue: string;
  datePaiement: string | null;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  belt?: string;
  status?: string;
  montantFinal?: number | null;
  finContrat?: string | null;
  sections: { section: string; belt: string | null }[];
  versements?: Versement[];
}

// Rappel de paiement affiché au coach pendant la prise de présences :
// versement impayé (visible 7 jours avant l'échéance, et tant qu'il est en
// retard), renouvellement de contrat dû ou imminent, ou solde sans échéance.
function rappelPaiement(member: Member): { texte: string; enRetard: boolean } | null {
  const etat = etatPaiement(member, 7);
  const dateCourte = (d?: string) => formatDateLocal(d, { day: 'numeric', month: 'short' });
  switch (etat.type) {
    case 'RETARD':
      return {
        texte: `${fmtMontant(etat.montant!)} $ · en retard depuis le ${dateCourte(etat.date)}${etat.autres ? ` (+${etat.autres})` : ''}`,
        enRetard: true,
      };
    case 'RENOUVELLEMENT_DU':
      return {
        texte: `${etat.montant ? `${fmtMontant(etat.montant)} $ · ` : ''}renouvellement dû depuis le ${dateCourte(etat.date)}${etat.reste ? ` · reste ${fmtMontant(etat.reste)} $` : ''}`,
        enRetard: true,
      };
    case 'ECHEANCE_PROCHE':
      if (etat.jours! > 7) return null;
      return {
        texte: `${fmtMontant(etat.montant!)} $ · dû le ${dateCourte(etat.date)}${etat.autres ? ` (+${etat.autres})` : ''}`,
        enRetard: false,
      };
    case 'RESTE_SANS_ECHEANCE':
      return { texte: `${fmtMontant(etat.reste!)} $ · solde à régler`, enRetard: true };
    case 'RENOUVELLEMENT_PROCHE':
      return {
        texte: `${etat.montant ? `${fmtMontant(etat.montant)} $ · ` : ''}renouvellement le ${dateCourte(etat.date)}`,
        enRetard: false,
      };
    default:
      return null;
  }
}

const fmtMontant = (m: number) => (m % 1 === 0 ? m.toFixed(0) : m.toFixed(2));

const dateLocaleISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function Pointer() {
  const { codes: sections, getLabel } = useSections();
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  // Jour du COURS pointé : aujourd'hui par défaut, mais modifiable vers le
  // passé (pointage oublié — ex. le karaté d'hier). Jamais le futur.
  const [dateCours, setDateCours] = useState<string>(dateLocaleISO());
  const [dejaPointes, setDejaPointes] = useState<Set<string>>(new Set());
  
  const [members, setMembers] = useState<Member[]>([]);
  const [pointedMemberIds, setPointedMemberIds] = useState<Set<string>>(new Set());
  
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Cours du jour CHOISI (aujourd'hui par défaut ; une date passée liste
  // les cours de CE jour-là pour un pointage rétroactif).
  useEffect(() => {
    async function fetchCoursesDuJour() {
      if (!dateCours) return;
      setIsLoadingCourses(true);
      setError('');
      try {
        const fetchedCourses = await apiFetch<Course[]>(`/cours?date=${dateCours}`);
        setCourses(fetchedCourses);
      } catch (err: any) {
        setError("Erreur de chargement des cours. " + err.message);
      } finally {
        setIsLoadingCourses(false);
      }
    }
    fetchCoursesDuJour();
  }, [dateCours]);

  // Update selected course when sections or courses change
  useEffect(() => {
    if (sections.length > 0 && !selectedSection) {
      setSelectedSection(sections[0]);
    }
  }, [sections, selectedSection]);

  useEffect(() => {
    const sectionCourses = courses.filter(c => c.section === selectedSection);
    if (sectionCourses.length > 0) {
      setSelectedCourseId(sectionCourses[0].id);
    } else {
      setSelectedCourseId('');
    }
  }, [selectedSection, courses]);

  // 2. Fetch members for selected section
  useEffect(() => {
    async function fetchMembers() {
      if (!selectedSection) return;
      setIsLoadingMembers(true);
      setError('');
      setSuccessMessage('');
      setPointedMemberIds(new Set());
      try {
        const fetchedMembers = await apiFetch<Member[]>(`/membres?section=${selectedSection}&status=ACTIF`);
        // Sort alphabetically
        fetchedMembers.sort((a, b) => a.lastName.localeCompare(b.lastName));
        setMembers(fetchedMembers);
      } catch (err: any) {
        setError("Erreur de chargement des membres. " + err.message);
      } finally {
        setIsLoadingMembers(false);
      }
    }
    fetchMembers();
  }, [selectedSection]);

  // Présences déjà enregistrées pour ce cours et ce jour : affichées cochées
  // en vert et retirées de « Tout sélectionner » (le serveur ignore de toute
  // façon les doublons).
  useEffect(() => {
    async function fetchDejaPointes() {
      if (!selectedCourseId || !dateCours) { setDejaPointes(new Set()); return; }
      try {
        const presences = await apiFetch<any[]>(`/presences?courseId=${selectedCourseId}&date=${dateCours}`);
        setDejaPointes(new Set(presences.map((a) => a.memberId ?? a.member?.id).filter(Boolean)));
      } catch {
        setDejaPointes(new Set());
      }
    }
    fetchDejaPointes();
  }, [selectedCourseId, dateCours, successMessage]);

  const handleToggleMember = (id: string) => {
    setPointedMemberIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const restants = members.filter((m) => !dejaPointes.has(m.id)).map((m) => m.id);
    if (pointedMemberIds.size === restants.length && restants.length > 0) {
      setPointedMemberIds(new Set());
    } else {
      setPointedMemberIds(new Set(restants));
    }
  };

  const handleSubmit = async () => {
    if (!selectedCourseId) {
      setError("Aucun cours sélectionné.");
      return;
    }
    if (pointedMemberIds.size === 0) {
      setError("Aucun membre sélectionné.");
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    setSuccessMessage('');

    if (dateCours > dateLocaleISO()) {
      setError('Impossible de pointer une date future.');
      setIsSubmitting(false);
      return;
    }
    try {
      const res = await apiFetch<{ pointed: number; skipped: number }>('/presences/pointer', {
        method: 'POST',
        body: JSON.stringify({
          courseId: selectedCourseId,
          date: dateCours,
          memberIds: Array.from(pointedMemberIds)
        })
      });

      setSuccessMessage(`${res.pointed} membre(s) pointé(s) pour le ${dateCours} ! (${res.skipped} déjà pointés)`);
      setPointedMemberIds(new Set()); // Reset after success
    } catch (err: any) {
      setError(err.message || 'Erreur lors du pointage');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBeltColor = (member: Member, sectionName: string) => {
    const s = member.sections.find(s => s.section === sectionName);
    return s?.belt || 'BLANCHE';
  };

  return (
    <div className="space-y-6 max-w-md mx-auto pb-6">
      <h1 className="text-2xl font-bold text-cshp-black">Pointage Rapide</h1>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex flex-col gap-2">
          <span>{successMessage}</span>
          <Button variant="outline" onClick={() => setSuccessMessage('')}>
            Nouveau pointage
          </Button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {!successMessage && (
        <>
          {/* Section Selector */}
          <div className="flex flex-nowrap gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto whitespace-nowrap scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {sections.map(section => (
              <button
                key={section}
                onClick={() => setSelectedSection(section)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] shrink-0 ${
                  selectedSection === section 
                    ? 'bg-white text-cshp-black shadow-sm font-semibold' 
                    : 'text-cshp-gray hover:text-cshp-black'
                }`}
              >
                {getLabel(section)}
              </button>
            ))}
          </div>

          {/* Jour du cours : aujourd'hui par défaut, passé permis (pointage oublié). */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-cshp-gray">Jour du cours</label>
            <input
              type="date"
              value={dateCours}
              max={dateLocaleISO()}
              onChange={(e) => setDateCours(e.target.value)}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:ring-2 focus:ring-cshp-red outline-none"
            />
            {dateCours !== dateLocaleISO() && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                ⏪ Pointage rétroactif : vous enregistrez les présences du cours du {dateCours}.
              </div>
            )}
          </div>

          {/* Course Selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-cshp-gray">{dateCours === dateLocaleISO() ? "Cours prévu aujourd'hui" : `Cours prévu le ${dateCours}`}</label>
            {isLoadingCourses ? (
              <div className="h-11 bg-gray-100 animate-pulse rounded-lg flex items-center px-4">
                <span className="text-sm text-cshp-gray">Chargement...</span>
              </div>
            ) : courses.filter(c => c.section === selectedSection).length === 0 ? (
              <div className="h-11 bg-gray-50 border border-gray-200 rounded-lg flex items-center px-4">
                <span className="text-sm text-red-500">Aucun cours prévu {dateCours === dateLocaleISO() ? "aujourd'hui" : `le ${dateCours}`} pour {getLabel(selectedSection)}</span>
              </div>
            ) : (
              <select
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:ring-2 focus:ring-cshp-red outline-none"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {courses.filter(c => c.section === selectedSection).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.startTime} - {c.endTime} · {c.coach ? `Coach ${c.coach.firstName}` : 'Sans coach'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Member List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <span className="font-medium text-cshp-black">
                Membres actifs ({members.length}){dejaPointes.size > 0 && <span className="text-xs text-emerald-700 font-semibold"> · {dejaPointes.size} déjà pointé(s)</span>}
              </span>
              <button 
                onClick={handleSelectAll}
                className="text-cshp-red text-sm font-medium p-2 -mr-2 min-h-[44px] flex items-center"
              >
                {pointedMemberIds.size === members.length && members.length > 0 ? 'Désélectionner tout' : 'Sélectionner tout'}
              </button>
            </div>
            
            {isLoadingMembers ? (
              <Spinner />
            ) : members.length === 0 ? (
              <div className="p-8 text-center text-cshp-gray text-sm">
                Aucun membre actif trouvé dans {getLabel(selectedSection)}.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                {members.map(member => {
                  const rappel = rappelPaiement(member);
                  const estDejaPointe = dejaPointes.has(member.id);
                  return (
                  <li
                    key={member.id}
                    className={`flex justify-between items-center p-4 transition-colors ${estDejaPointe ? 'bg-emerald-50/50' : 'hover:bg-gray-50 cursor-pointer'}`}
                    onClick={() => { if (!estDejaPointe) handleToggleMember(member.id); }}
                  >
                    <div>
                      <span className="font-medium text-cshp-black block">{(member.lastName ?? '').toUpperCase()} {member.firstName ?? ''}</span>
                      <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-cshp-gray">
                        {getBeltColor(member, selectedSection)}
                      </span>
                      {rappel && (
                        <span
                          className={`inline-block mt-1 ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            rappel.enRetard ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {rappel.texte}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {estDejaPointe ? (
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-full">Déjà pointé ✓</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={pointedMemberIds.has(member.id)}
                          onChange={() => {}} // handled by li onClick
                          className="w-6 h-6 rounded border-gray-300 text-cshp-red focus:ring-cshp-red pointer-events-none"
                        />
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Button 
            fullWidth 
            onClick={handleSubmit} 
            isLoading={isSubmitting}
            disabled={pointedMemberIds.size === 0 || !selectedCourseId}
            className="mt-6"
          >
            Soumettre {pointedMemberIds.size > 0 && `(${pointedMemberIds.size})`}
          </Button>
        </>
      )}
    </div>
  );
}
