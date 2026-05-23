import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Plus, Edit3, Archive, ArrowUpDown } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { formatDateLocal } from '../lib/format';

interface Section {
  id: string;
  code: string;
  label: string;
  sport: string;
  ordre: number;
  actif: boolean;
  createdAt?: string | Date;
}

export function Sections() {
  const { user } = useAuth();
  
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);

  // Form States
  const [formCode, setFormCode] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formSport, setFormSport] = useState('KARATE');
  const [formOrdre, setFormOrdre] = useState(0);

  useEffect(() => {
    fetchSections();
  }, []);

  async function fetchSections() {
    setIsLoading(true);
    try {
      const data = await apiFetch<Section[]>('/sections');
      setSections(data || []);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des sections');
    } finally {
      setIsLoading(false);
    }
  }

  const openAddModal = () => {
    setEditingSection(null);
    setFormCode('');
    setFormLabel('');
    setFormSport('KARATE');
    setFormOrdre(sections.length + 1);
    setIsModalOpen(true);
  };

  const openEditModal = (section: Section) => {
    setEditingSection(section);
    setFormCode(section.code);
    setFormLabel(section.label);
    setFormSport(section.sport);
    setFormOrdre(section.ordre);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formLabel || !formSport) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingSection) {
        await apiFetch(`/sections/${editingSection.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            label: formLabel,
            ordre: formOrdre
          })
        });
      } else {
        await apiFetch('/sections', {
          method: 'POST',
          body: JSON.stringify({
            code: formCode,
            label: formLabel,
            sport: formSport,
            ordre: formOrdre
          })
        });
      }
      setIsModalOpen(false);
      fetchSections();
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (id: string, label: string) => {
    if (!window.confirm(`Voulez-vous vraiment archiver la section "${label}" ?`)) return;
    try {
      await apiFetch(`/sections/${id}`, {
        method: 'DELETE'
      });
      fetchSections();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’archivage');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Gestion des Sections</h1>
          <p className="text-sm text-cshp-gray mt-1">Créez, modifiez ou archivez les sections sportives de l'organisation.</p>
        </div>
        <Button onClick={openAddModal} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" /> Ajouter une section
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : sections.length === 0 ? (
        <div className="text-center py-12 text-cshp-gray">
          Aucune section trouvée.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sections.map(s => (
            <Card key={s.id} className="p-5 flex flex-col h-full justify-between gap-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-bold text-cshp-red tracking-wider uppercase bg-red-50 px-2 py-1 rounded">
                      {s.sport}
                    </span>
                    <h3 className="text-lg font-extrabold text-cshp-black mt-2">
                      {s.label}
                    </h3>
                    <p className="text-xs font-mono text-cshp-gray mt-1">
                      Code : {s.code}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => openEditModal(s)}
                      className="p-2 text-cshp-gray hover:text-cshp-black hover:bg-gray-150 rounded-lg transition-colors"
                      title="Modifier"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => handleArchive(s.id, s.label)}
                      className="p-2 text-cshp-gray hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Archiver"
                    >
                      <Archive size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-cshp-gray">
                  <ArrowUpDown size={14} />
                  <span>Ordre d'affichage : <strong>{s.ordre}</strong></span>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                <Badge variant="success">✅ Active</Badge>
                <span className="text-[10px] text-cshp-gray">
                  Créée le {formatDateLocal(s.createdAt)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal d'ajout ou édition */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={editingSection ? "Modifier la section" : "Ajouter une section"} 
        width="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">
              Code de la section {!editingSection && <span className="text-cshp-red">*</span>}
            </label>
            <input
              type="text"
              required
              disabled={!!editingSection}
              placeholder="ex: KARATE_GR4"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value.replace(/\s+/g, '_').toUpperCase())}
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white disabled:bg-gray-100 disabled:text-gray-405 font-mono"
            />
            {!editingSection && (
              <p className="text-[10px] text-cshp-gray">Utilisé en base de données, ex: KARATE_GR4, JUDO_EXPERT</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">
              Nom d'affichage <span className="text-cshp-red">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="ex: Karaté Gr. 4"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white font-medium"
            />
          </div>

          {!editingSection && (
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">
                Sport / Type <span className="text-cshp-red">*</span>
              </label>
              <select
                value={formSport}
                onChange={(e) => setFormSport(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white font-medium"
              >
                <option value="KARATE">KARATÉ</option>
                <option value="JUDO">JUDO</option>
                <option value="NINJAS">NINJAS</option>
                <option value="AUTRE">AUTRE</option>
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-cshp-gray block">
              Ordre d'affichage
            </label>
            <input
              type="number"
              placeholder="ex: 10"
              value={formOrdre}
              onChange={(e) => setFormOrdre(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cshp-red/20 focus:border-cshp-red bg-white"
            />
          </div>

          <div className="flex gap-2 pt-4 justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-cshp-black text-white hover:bg-gray-800 rounded-lg text-sm font-semibold shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Enregistrement...' : 'Confirmer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
