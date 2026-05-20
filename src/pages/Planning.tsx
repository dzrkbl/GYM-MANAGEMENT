import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { CourseForm } from '../components/forms/CourseForm';
import { Plus, Edit2, Trash2, CalendarDays } from 'lucide-react';
import { Card } from '../components/ui/Card';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function Planning() {
  const { user } = useAuth();
  
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
    try {
      const data = await apiFetch<any[]>('/planning');
      // Filter out non-active courses and organize
      setCourses(data.filter(c => c.actif));
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

  const handleDelete = async (id: string) => {
    if (!window.confirm("Désactiver ce créneau ?")) return;
    try {
      await apiFetch(`/planning/${id}`, { method: 'DELETE' });
      fetchPlanning();
    } catch (e: any) {
      alert("Erreur: " + e.message);
    }
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      if (editingCourse) {
        await apiFetch(`/planning/${editingCourse.id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      } else {
        await apiFetch('/planning', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }
      setIsModalOpen(false);
      fetchPlanning();
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Organize courses by day
  const coursesByDay = DAYS.map((day, index) => {
    return {
      day,
      items: courses.filter(c => c.dayOfWeek === index)
    };
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black flex items-center gap-2">
          <CalendarDays className="text-cshp-red" />
          Planning de Semaine
        </h1>
        {['ADMIN', 'SECTION_MANAGER'].includes(user?.role || '') && (
          <Button onClick={openAddModal} className="w-full sm:w-auto">
            <Plus size={20} className="mr-2" /> Ajouter un créneau
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : (
        <>
          {/* Vue Mobile (Liste) */}
          <div className="md:hidden space-y-4">
            {coursesByDay.filter(d => d.items.length > 0).map((d) => (
              <div key={d.day} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 font-bold text-cshp-black">
                  {d.day}
                </div>
                <div className="divide-y divide-gray-100">
                  {d.items.map(course => (
                    <div key={course.id} className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-lg mb-1">{course.startTime} - {course.endTime}</div>
                        <div className="font-medium text-cshp-red">{course.section}</div>
                        <div className="text-sm text-cshp-gray mt-1">
                          Coach {course.coach?.firstName || 'Non assigné'}
                        </div>
                      </div>
                      {['ADMIN', 'SECTION_MANAGER'].includes(user?.role || '') && (
                        <div className="flex gap-2">
                          <button onClick={() => openEditModal(course)} className="p-2 text-gray-500 hover:bg-gray-100 rounded">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete(course.id)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {courses.length === 0 && (
              <div className="text-center py-12 text-cshp-gray">Aucun cours planifié.</div>
            )}
          </div>

          {/* Vue Desktop (Grille) */}
          <div className="hidden md:flex gap-4 overflow-x-auto pb-4">
            {coursesByDay.slice(1).concat(coursesByDay.slice(0,1)).map((d, index) => ( // Start from Monday
              <div key={d.day} className="flex-1 min-w-[200px]">
                <div className="bg-cshp-black text-white text-center py-2 rounded-t-lg font-bold text-sm tracking-wide uppercase">
                  {d.day}
                </div>
                <div className="bg-gray-50 border-x border-b border-gray-200 rounded-b-lg min-h-[400px] p-2 space-y-2">
                  {d.items.length === 0 && <div className="text-xs text-center text-gray-400 py-4">Libre</div>}
                  {d.items.map(course => (
                    <Card key={course.id} className="p-3 text-sm relative group">
                      <div className="font-bold text-cshp-black">{course.startTime} - {course.endTime}</div>
                      <div className="font-medium text-cshp-red my-1">{course.section}</div>
                      <div className="text-xs text-cshp-gray">
                        {course.coach ? `${course.coach.firstName} ${course.coach.lastName}` : 'Sans coach'}
                      </div>
                      
                      {['ADMIN', 'SECTION_MANAGER'].includes(user?.role || '') && (
                        <div className="absolute top-2 right-2 hidden group-hover:flex gap-1 bg-white/90 rounded p-1 shadow-sm">
                          <button onClick={() => openEditModal(course)} className="p-1 hover:text-cshp-red" title="Modifier">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(course.id)} className="p-1 hover:text-red-600" title="Supprimer">
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
