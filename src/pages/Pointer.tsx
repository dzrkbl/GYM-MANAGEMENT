import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useSections } from '../hooks/useSections';

interface Course {
  id: string;
  section: string;
  startTime: string;
  endTime: string;
  coach?: { firstName: string; lastName: string } | null;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  belt?: string;
  sections: { section: string; belt: string | null }[];
}

export function Pointer() {
  const { codes: sections, getLabel } = useSections();
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [pointedMemberIds, setPointedMemberIds] = useState<Set<string>>(new Set());
  
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // 1. Fetch courses for today
  useEffect(() => {
    async function fetchTodayCourses() {
      setIsLoadingCourses(true);
      setError('');
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const fetchedCourses = await apiFetch<Course[]>(`/cours?date=${todayStr}`);
        setCourses(fetchedCourses);
      } catch (err: any) {
        setError("Erreur de chargement des cours. " + err.message);
      } finally {
        setIsLoadingCourses(false);
      }
    }
    fetchTodayCourses();
  }, []);

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
    if (pointedMemberIds.size === members.length) {
      setPointedMemberIds(new Set());
    } else {
      setPointedMemberIds(new Set(members.map(m => m.id)));
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

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await apiFetch<{ pointed: number; skipped: number }>('/presences/pointer', {
        method: 'POST',
        body: JSON.stringify({
          courseId: selectedCourseId,
          date: todayStr,
          memberIds: Array.from(pointedMemberIds)
        })
      });

      setSuccessMessage(`${res.pointed} membre(s) pointé(s) avec succès ! (${res.skipped} déjà pointés)`);
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

          {/* Course Selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-cshp-gray">Cours prévu aujourd'hui</label>
            {isLoadingCourses ? (
              <div className="h-11 bg-gray-100 animate-pulse rounded-lg flex items-center px-4">
                <span className="text-sm text-cshp-gray">Chargement...</span>
              </div>
            ) : courses.filter(c => c.section === selectedSection).length === 0 ? (
              <div className="h-11 bg-gray-50 border border-gray-200 rounded-lg flex items-center px-4">
                <span className="text-sm text-red-500">Aucun cours trouvé aujourd'hui pour {getLabel(selectedSection)}</span>
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
                Membres actifs ({members.length})
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
                {members.map(member => (
                  <li 
                    key={member.id}
                    className="flex justify-between items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => handleToggleMember(member.id)}
                  >
                    <div>
                      <span className="font-medium text-cshp-black block">{(member.lastName ?? '').toUpperCase()} {member.firstName ?? ''}</span>
                      <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-cshp-gray">
                        {getBeltColor(member, selectedSection)}
                      </span>
                    </div>
                    <div>
                      <input 
                        type="checkbox"
                        checked={pointedMemberIds.has(member.id)}
                        onChange={() => {}} // handled by li onClick
                        className="w-6 h-6 rounded border-gray-300 text-cshp-red focus:ring-cshp-red pointer-events-none"
                      />
                    </div>
                  </li>
                ))}
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
