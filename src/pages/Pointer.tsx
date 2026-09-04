import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { useSections } from '../hooks/useSections';
import { formatDateLocal } from '../lib/format';
import { etatPaiement } from '../lib/echeances';
import { HAUTEUR_ECRAN } from '../lib/layout';
import { lirePointageEnCours, ecrirePointageEnCours, purgerPointageEnCours } from '../lib/pointageEnCours';

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
  const navigate = useNavigate();
  // Brouillon laissé par une visite précédente (ex. : parti corriger le groupe
  // d'un enfant dans sa fiche) : on repart exactement là où on était.
  const [brouillon] = useState(lirePointageEnCours);
  const [selectedSection, setSelectedSection] = useState<string>(brouillon?.section || '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(brouillon?.courseId || '');
  // Jour du COURS pointé : aujourd'hui par défaut, mais modifiable vers le
  // passé (pointage oublié — ex. le karaté d'hier). Jamais le futur.
  const [dateCours, setDateCours] = useState<string>(brouillon?.dateCours || dateLocaleISO());
  const [dejaPointes, setDejaPointes] = useState<Set<string>>(new Set());

  const [members, setMembers] = useState<Member[]>([]);
  const [pointedMemberIds, setPointedMemberIds] = useState<Set<string>>(new Set());
  // Les coches du brouillon se réappliquent UNE fois, à l'arrivée de la liste
  // des membres (intersection : un enfant déplacé de groupe entre-temps
  // disparaît proprement de la sélection).
  const cochesARestaurer = useRef<string[] | null>(
    brouillon && brouillon.coches.length > 0 ? brouillon.coches : null
  );

  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // Résumé affiché à la confirmation : qui est là, qui doit de l'argent.
  const [resume, setResume] = useState<{
    pointes: number;
    dejaAvant: number;
    lignes: { membre: Member; rappel: { texte: string; enRetard: boolean } | null }[];
  } | null>(null);

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
      // Le cours déjà choisi (ou restauré du brouillon) reste choisi tant
      // qu'il appartient au groupe ; sinon, le premier du groupe.
      setSelectedCourseId((actuel) =>
        sectionCourses.some((c) => c.id === actuel) ? actuel : sectionCourses[0].id
      );
    } else {
      setSelectedCourseId('');
    }
  }, [selectedSection, courses]);

  // Le brouillon suit chaque geste : jour, groupe, cours, coches. Ouvrir une
  // fiche membre (ou recharger la page) ne perd plus rien.
  useEffect(() => {
    ecrirePointageEnCours({
      dateCours,
      section: selectedSection,
      courseId: selectedCourseId,
      coches: Array.from(pointedMemberIds),
    });
  }, [dateCours, selectedSection, selectedCourseId, pointedMemberIds]);

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
        // Coches du brouillon, réappliquées une seule fois sur SON groupe.
        if (cochesARestaurer.current && selectedSection === brouillon?.section) {
          const idsConnus = new Set(fetchedMembers.map((m) => m.id));
          setPointedMemberIds(new Set(cochesARestaurer.current.filter((id) => idsConnus.has(id))));
          cochesARestaurer.current = null;
        }
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

      setSuccessMessage(`${res.pointed} membre(s) pointé(s) pour le ${dateCours} !${res.skipped > 0 ? ` (${res.skipped} déjà pointés)` : ''}`);

      // Résumé de confirmation : QUI est là (les pointés à l'instant + ceux
      // déjà pointés du cours) et QUI doit de l'argent — la même logique que
      // les badges de la liste (rappelPaiement), aucune deuxième vérité.
      const idsPresents = new Set([...dejaPointes, ...pointedMemberIds]);
      const lignes = members
        .filter((m) => idsPresents.has(m.id))
        .map((membre) => ({ membre, rappel: rappelPaiement(membre) }))
        .sort((a, b) =>
          Number(!!b.rappel && b.rappel.enRetard) - Number(!!a.rappel && a.rappel.enRetard) ||
          a.membre.lastName.localeCompare(b.membre.lastName)
        );
      setResume({ pointes: res.pointed, dejaAvant: dejaPointes.size, lignes });

      setPointedMemberIds(new Set()); // Reset after success
      // Pointage soumis : le brouillon a fait son travail.
      purgerPointageEnCours();
      // La confirmation vit dans l'en-tête FIXE : elle est visible sans avoir
      // à remonter quoi que ce soit (avant, il fallait faire défiler le
      // <main> et l'écran semblait planter au téléphone).
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

  const coursDuGroupe = courses.filter((c) => c.section === selectedSection);
  const aucunCours = !isLoadingCourses && coursDuGroupe.length === 0;
  // « Tout cocher » ne porte que sur les membres RESTANTS : le libellé doit se
  // comparer à eux, sinon il affichait encore « Tout cocher » alors que tout ce
  // qui pouvait l'être l'était déjà (dès qu'un membre était déjà pointé).
  const nbRestants = members.filter((m) => !dejaPointes.has(m.id)).length;
  const toutCoche = nbRestants > 0 && pointedMemberIds.size === nbRestants;

  /**
   * ÉCRAN FIXE, LISTE SEULE QUI DÉFILE.
   *
   * Avant, toute la page défilait dans le <main> : les onglets de groupe
   * partaient vers le haut, et le bouton « Soumettre », simplement collant,
   * disparaissait dès que la barre d'adresse du téléphone se repliait
   * (100vh > hauteur visible). Maintenant la page fait EXACTEMENT la hauteur
   * visible (HAUTEUR_ECRAN, en 100dvh) et se découpe en trois : en-tête figé,
   * liste défilante, pied figé. Rien ne flotte, rien ne peut se cacher.
   */
  return (
    <div className={`${HAUTEUR_ECRAN} flex flex-col w-full max-w-md mx-auto gap-3`}>
      {/* ---------- EN-TÊTE FIGÉ ---------- */}
      <div className="shrink-0 space-y-2.5">
        <h1 className="text-xl md:text-2xl font-bold text-cshp-black">Pointage rapide</h1>

        {/* La confirmation N'EFFACE PLUS l'écran : la liste reste là, les
            pointés passent en vert « Déjà pointé ✓ ». */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-lg flex items-start justify-between gap-2 text-sm">
            <span className="font-semibold">✅ {successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              aria-label="Fermer la confirmation"
              className="shrink-0 -mr-1 p-1.5 rounded-full text-green-700 hover:bg-green-100"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Groupes : rangée FIGÉE, qu'on fait rouler horizontalement au pouce
            jusqu'au groupe voulu (elle ne part jamais vers le haut). */}
        <div className="flex flex-nowrap gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto overscroll-x-contain whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {sections.map(section => (
            <button
              key={section}
              onClick={() => setSelectedSection(section)}
              className={`shrink-0 px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] ${
                selectedSection === section
                  ? 'bg-white text-cshp-black shadow-sm font-semibold'
                  : 'text-cshp-gray hover:text-cshp-black'
              }`}
            >
              {getLabel(section)}
            </button>
          ))}
        </div>

        {/* Jour et cours côte à côte : deux champs sur une seule rangée, pour
            laisser le maximum de hauteur à la liste au téléphone. */}
        <div className="grid grid-cols-2 gap-2">
          {/* Jour du cours : aujourd'hui par défaut, passé permis (pointage oublié). */}
          <div className="space-y-1 min-w-0">
            <label className="block text-[11px] font-medium text-cshp-gray">Jour du cours</label>
            <input
              type="date"
              value={dateCours}
              max={dateLocaleISO()}
              onChange={(e) => setDateCours(e.target.value)}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-2 bg-white text-sm focus:ring-2 focus:ring-cshp-red outline-none"
            />
          </div>

          <div className="space-y-1 min-w-0">
            <label className="block text-[11px] font-medium text-cshp-gray">Cours</label>
            {isLoadingCourses ? (
              <div className="min-h-[44px] bg-gray-100 animate-pulse rounded-lg flex items-center px-3">
                <span className="text-sm text-cshp-gray">Chargement…</span>
              </div>
            ) : aucunCours ? (
              <div className="min-h-[44px] bg-gray-50 border border-gray-200 rounded-lg flex items-center px-3">
                <span className="text-sm text-red-500 font-medium">Aucun</span>
              </div>
            ) : (
              <select
                className="w-full min-h-[44px] border border-gray-300 rounded-lg px-2 bg-white text-sm focus:ring-2 focus:ring-cshp-red outline-none"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
              >
                {coursDuGroupe.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.startTime}–{c.endTime} · {c.coach ? `Coach ${c.coach.firstName}` : 'Sans coach'}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {aucunCours && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold">
            Aucun cours prévu {dateCours === dateLocaleISO() ? "aujourd'hui" : `le ${dateCours}`} pour {getLabel(selectedSection)}.
          </div>
        )}

        {dateCours !== dateLocaleISO() && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
            ⏪ Pointage rétroactif : vous enregistrez les présences du cours du {dateCours}.
          </div>
        )}
      </div>

      {/* ---------- LISTE : LA SEULE ZONE QUI DÉFILE ---------- */}
      <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="shrink-0 px-3 py-2 border-b border-gray-100 flex justify-between items-center gap-2 bg-gray-50">
          <span className="text-sm font-medium text-cshp-black min-w-0">
            Membres actifs ({members.length})
            {dejaPointes.size > 0 && (
              <span className="block text-xs text-emerald-700 font-semibold">{dejaPointes.size} déjà pointé(s)</span>
            )}
          </span>
          <button
            onClick={handleSelectAll}
            className="shrink-0 text-cshp-red text-sm font-medium px-2 -mr-1 min-h-[44px] flex items-center"
          >
            {toutCoche ? 'Tout décocher' : 'Tout cocher'}
          </button>
        </div>

        {isLoadingMembers ? (
          <div className="flex-1 flex items-center justify-center"><Spinner /></div>
        ) : members.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-cshp-gray text-sm">
            Aucun membre actif trouvé dans {getLabel(selectedSection)}.
          </div>
        ) : (
          // `overscroll-contain` : arrivé en bas de la liste, le geste ne
          // « déborde » pas sur la page derrière (rien ne bouge autour).
          <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-gray-100">
            {members.map(member => {
              const rappel = rappelPaiement(member);
              const estDejaPointe = dejaPointes.has(member.id);
              return (
              <li
                key={member.id}
                className={`flex justify-between items-center gap-2 px-3 py-3 transition-colors ${estDejaPointe ? 'bg-emerald-50/50' : 'hover:bg-gray-50 cursor-pointer'}`}
                onClick={() => { if (!estDejaPointe) handleToggleMember(member.id); }}
              >
                <div className="min-w-0">
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
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Ouvrir la fiche SANS perdre le pointage : le brouillon est
                      écrit à chaque geste, et la fiche offre le retour direct. */}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/membres/${member.id}`); }}
                    className="p-2.5 -my-1 rounded-full text-gray-300 hover:text-cshp-red hover:bg-gray-100 transition-colors"
                    title="Ouvrir sa fiche — le pointage en cours est conservé"
                    aria-label={`Fiche de ${member.firstName} ${member.lastName}`}
                  >
                    <UserRound size={19} />
                  </button>
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

      {/* ---------- PIED FIGÉ : le bouton ne peut plus se cacher ---------- */}
      <div className="shrink-0">
        <Button
          fullWidth
          onClick={handleSubmit}
          isLoading={isSubmitting}
          disabled={pointedMemberIds.size === 0 || !selectedCourseId}
          className="min-h-[52px] shadow-lg"
        >
          {pointedMemberIds.size > 0 ? `Pointer ${pointedMemberIds.size} présence(s)` : 'Soumettre'}
        </Button>
      </div>

      {/* ---------- RÉSUMÉ DE CONFIRMATION ----------
          Qui est là, et qui doit de l'argent : le parent est AU dojo, c'est
          le moment d'encaisser. Mêmes montants que les badges de la liste. */}
      <Modal
        isOpen={!!resume}
        onClose={() => setResume(null)}
        title="Pointage enregistré ✅"
        width="lg"
      >
        {resume && (() => {
          const enSouffrance = resume.lignes.filter((l) => l.rappel?.enRetard);
          const aVenir = resume.lignes.filter((l) => l.rappel && !l.rappel.enRetard);
          const ligneMembre = (l: (typeof resume.lignes)[number], rouge: boolean) => (
            <li key={l.membre.id} className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${rouge ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="min-w-0">
                <span className="font-bold text-cshp-black block">
                  {(l.membre.lastName ?? '').toUpperCase()} {l.membre.firstName ?? ''}
                </span>
                <span className={`text-xs font-semibold ${rouge ? 'text-red-600' : 'text-amber-700'}`}>{l.rappel!.texte}</span>
              </div>
              <button
                onClick={() => { setResume(null); navigate(`/membres/${l.membre.id}`); }}
                className="shrink-0 p-2 rounded-full text-gray-400 hover:text-cshp-red hover:bg-white"
                title="Ouvrir sa fiche"
                aria-label={`Fiche de ${l.membre.firstName} ${l.membre.lastName}`}
              >
                <UserRound size={18} />
              </button>
            </li>
          );
          return (
            <div className="space-y-4">
              <p className="text-sm text-cshp-black">
                <strong>{resume.lignes.length} présent(s)</strong> à ce cours
                {resume.pointes > 0 && <> — {resume.pointes} pointé(s) à l'instant{resume.dejaAvant > 0 ? `, ${resume.dejaAvant} déjà pointé(s)` : ''}</>}.
              </p>

              {enSouffrance.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider">
                    💰 À encaisser parmi les présents ({enSouffrance.length})
                  </p>
                  <ul className="space-y-2 max-h-[38vh] overflow-y-auto">
                    {enSouffrance.map((l) => ligneMembre(l, true))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm font-semibold text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
                  🎉 Personne ne doit d'argent parmi les présents.
                </p>
              )}

              {aVenir.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                    📅 Échéances qui approchent ({aVenir.length})
                  </p>
                  <ul className="space-y-2 max-h-[24vh] overflow-y-auto">
                    {aVenir.map((l) => ligneMembre(l, false))}
                  </ul>
                </div>
              )}

              <Button fullWidth onClick={() => setResume(null)} className="min-h-[48px]">
                Fermer
              </Button>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
