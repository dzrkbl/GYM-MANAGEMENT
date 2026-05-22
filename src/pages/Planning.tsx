import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { CourseForm } from '../components/forms/CourseForm';
import { Plus, Edit2, Trash2, CalendarDays } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useSections } from '../hooks/useSections';

const DAYS = [
  { code: 'LUN', label: 'Lundi' },
  { code: 'MAR', label: 'Mardi' },
  { code: 'MER', label: 'Mercredi' },
  { code: 'JEU', label: 'Jeudi' },
  { code: 'VEN', label: 'Vendredi' },
  { code: 'SAM', label: 'Samedi' },
  { code: 'DIM', label: 'Dimanche' }
];

export function Planning() {
  const { user } = useAuth();
  const { getLabel } = useSections();
  
  const [courses, setCourses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPlanning();
  }, []);

  async function fetchPlanning() {
    setIsLoading(true);
    setError('');
    try {
      const data = await apiFetch<any[]>('/cours');
      setCourses(data.filter((c: any) => c.actif));
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement du planning');
    } finally {
      setIsLoading(false);
    }
  }

  const openAddModal = () => {
    setEditingCourse(null);
    setIsModalOpen(true);
  };

  const openEditModal = (course: any) => {
    setEditingCourse(course);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, sectionName: string) => {
    if (!window.confirm(`Désactiver ce créneau pour la section ${sectionName} ?`)) return;
    try {
      await apiFetch(`/cours/${id}`, { method: 'DELETE' });
      fetchPlanning();
    } catch (e: any) {
      alert("Erreur: " + e.message);
    }
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      if (editingCourse) {
        await apiFetch(`/cours/${editingCourse.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data)
        });
      } else {
        await apiFetch('/cours', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }
      setIsModalOpen(false);
      fetchPlanning();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group courses by day of the week
  const coursesByDay = DAYS.map(day => {
    const dayCourses = courses.filter((c: any) => c.jours.includes(day.code));
    // Sort courses by start time
    dayCourses.sort((a, b) => {
      const [ha, ma] = a.startTime.split(':').map(Number);
      const [hb, mb] = b.startTime.split(':').map(Number);
      return (ha * 60 + ma) - (hb * 60 + mb);
    });
    return {
      ...day,
      items: dayCourses
    };
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black flex items-center gap-2">
          <CalendarDays className="text-cshp-red" />
          Planning Hebdomadaire
        </h1>
        {['ADMIN', 'SECTION_MANAGER'].includes(user?.role || '') && (
          <Button onClick={openAddModal} className="w-full sm:w-auto h-11 px-5">
            <Plus size={20} className="mr-2" /> Ajouter un cours
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : (
        <>
          {/* Mobile View: Row of days showing list of courses for each day with any active items */}
          <div className="md:hidden space-y-4">
            {coursesByDay.map((d) => (
              <div key={d.code} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-cshp-black text-white px-4 py-2.5 font-bold flex justify-between items-center">
                  <span>{d.label}</span>
                  <span className="text-xs bg-cshp-red text-white py-0.5 px-2 rounded-full">
                    {d.items.length} cours
                  </span>
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {d.items.length === 0 ? (
                    <div className="p-4 text-center text-sm text-cshp-gray">Aucun cours planifié.</div>
                  ) : (
                    d.items.map(course => (
                      <div key={`${d.code}-${course.id}`} className="p-4 flex justify-between items-center gap-4">
                        <div className="space-y-1">
                          <div className="font-bold text-lg text-cshp-black">{course.startTime} - {course.endTime}</div>
                          <div className="font-semibold text-cshp-red">{getLabel(course.section)}</div>
                          <div className="text-sm text-cshp-gray">
                            Coach : {course.coach ? `${course.coach.firstName} ${course.coach.lastName}` : 'Sans coach'}
                          </div>
                        </div>
                        {['ADMIN'].includes(user?.role || '') && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditModal(course)}
                              className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors border border-gray-200"
                              title="Modifier"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(course.id, getLabel(course.section))}
                              className="p-2.5 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors border border-gray-200"
                              title="Désactiver"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: 7 Column Grid */}
          <div className="hidden md:grid grid-cols-7 gap-3 xl:gap-4 overflow-x-auto pb-4">
            {coursesByDay.map((d) => (
              <div key={d.code} className="flex-1 min-w-[150px] flex flex-col">
                <div className="bg-cshp-black text-white text-center py-2.5 rounded-t-xl font-bold text-sm tracking-wide uppercase">
                  {d.label}
                </div>
                <div className="bg-gray-50 border-x border-b border-gray-200 rounded-b-xl p-2.5 space-y-2.5 flex-1 min-h-[450px]">
                  {d.items.length === 0 && (
                    <div className="text-xs text-center text-gray-400 py-6 font-medium italic">Libre</div>
                  )}
                  {d.items.map(course => (
                    <Card key={`${d.code}-${course.id}`} className="p-3 text-sm relative group bg-white border border-gray-100 hover:shadow-md transition-shadow">
                      <div className="font-extrabold text-cshp-black">{course.startTime} - {course.endTime}</div>
                      <div className="font-semibold text-cshp-red my-1">{getLabel(course.section)}</div>
                      <div className="text-xs text-cshp-gray font-medium">
                        {course.coach ? `${course.coach.firstName} ${course.coach.lastName}` : 'Sans coach'}
                      </div>
                      
                      {['ADMIN'].includes(user?.role || '') && (
                        <div className="absolute top-2 right-2 hidden group-hover:flex gap-1 bg-white/95 border border-gray-100 rounded-md p-1 shadow-sm transition-all">
                          <button
                            onClick={() => openEditModal(course)}
                            className="p-1 hover:text-cshp-red hover:bg-gray-50 rounded"
                            title="Modifier"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(course.id, getLabel(course.section))}
                            className="p-1 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Désactiver"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={editingCourse ? "Modifier le créneau" : "Ajouter un créneau"}
      >
        <CourseForm
          initialData={editingCourse}
          onSubmit={handleSubmit}
          onCancel={() => setIsModalOpen(false)}
          isLoading={isSubmitting}
        />
      </Modal>

    </div>
  );
}
