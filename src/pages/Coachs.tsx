import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { formatMontant, formatDateLocal } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { CoachForm } from '../components/forms/CoachForm';
import { Plus, UserCircle, Edit3 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

export function Coachs() {
  const { user } = useAuth();
  
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const [coachs, setCoachs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCoach, setEditingCoach] = useState<any>(null);

  useEffect(() => {
    fetchCoachs();
  }, []);

  async function fetchCoachs() {
    setIsLoading(true);
    try {
      const data = await apiFetch<any[]>('/coachs');
      setCoachs(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des coachs');
    } finally {
      setIsLoading(false);
    }
  }

  const openAddModal = () => {
    setEditingCoach(null);
    setIsModalOpen(true);
  };

  const openEditModal = (coach: any) => {
    setEditingCoach(coach);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      if (editingCoach) {
        await apiFetch(`/coachs/${editingCoach.id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
      } else {
        await apiFetch('/coachs', {
          method: 'POST',
          body: JSON.stringify(data)
        });
      }
      setIsModalOpen(false);
      fetchCoachs();
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Coachs</h1>
        <Button onClick={openAddModal} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" /> Ajouter
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : coachs.length === 0 ? (
        <div className="text-center py-12 text-cshp-gray">
          Aucun coach trouvé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coachs.map(c => (
            <Card key={c.id} className="p-5 flex flex-col h-full justify-between gap-4">
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex gap-3 items-center">
                    <UserCircle size={40} className="text-gray-300" />
                    <div>
                      <h3 className="text-lg font-bold text-cshp-black">
                        {c.lastName} {c.firstName}
                      </h3>
                      <p className="text-sm text-cshp-gray">
                        {c.section || 'Toutes sections'} · {c.role === 'SECTION_MANAGER' ? 'Section Manager' : 'Coach'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openEditModal(c)}
                    className="p-1 text-cshp-gray hover:bg-gray-100 rounded transition-colors"
                  >
                    <Edit3 size={18} />
                  </button>
                </div>
                
                <div className="mt-4 text-sm space-y-1">
                  <p className="flex justify-between">
                    <span className="text-cshp-gray">Rémunération :</span>
                    <span className="font-bold text-cshp-black">{formatMontant(c.remuneration || 0)} /mois</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-cshp-gray">Courriel :</span>
                    <span className="text-cshp-black truncate w-40 text-right">{c.email}</span>
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-gray-100 pt-3 mt-2">
                {c.actif ? <Badge variant="success">✅ Actif</Badge> : <Badge variant="danger">Inactif</Badge>}
                <span className="text-xs text-cshp-gray">
                  Depuis {formatDateLocal(c.dateDebut)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={editingCoach ? "Modifier le coach" : "Ajouter un coach"} 
        width="lg"
      >
        <CoachForm 
          initialData={editingCoach} 
          onSubmit={handleSubmit} 
          onCancel={() => setIsModalOpen(false)} 
          isLoading={isSubmitting} 
        />
      </Modal>
    </div>
  );
}
