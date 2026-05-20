import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiFetch } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { MembreForm } from '../components/forms/MembreForm';
import { Search, Plus } from 'lucide-react';

export function Membres() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  
  const [sectionFilter, setSectionFilter] = useState(user?.role === 'SECTION_MANAGER' ? user.section : 'TOUS');
  const [statusFilter, setStatusFilter] = useState('ACTIF');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, [sectionFilter, statusFilter, debouncedQuery]); // Re-fetch on filter changes

  async function fetchMembers() {
    setIsLoading(true);
    setError('');
    try {
      let url = `/membres?status=${statusFilter}`;
      if (sectionFilter && sectionFilter !== 'TOUS') {
        url += `&section=${sectionFilter}`;
      }
      
      let data = await apiFetch<any[]>(url);
      
      // Client-side search filtering
      if (debouncedQuery) {
        const lowerQ = debouncedQuery.toLowerCase();
        data = data.filter(m => 
          m.firstName.toLowerCase().includes(lowerQ) || 
          m.lastName.toLowerCase().includes(lowerQ)
        );
      }
      
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des membres');
    } finally {
      setIsLoading(false);
    }
  }

  const handleAddMember = async (data: any) => {
    setIsAdding(true);
    try {
      await apiFetch('/membres', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      setIsAddModalOpen(false);
      fetchMembers();
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la création');
    } finally {
      setIsAdding(false);
    }
  };

  const SECTIONS = ["TOUS", "KARATE", "JUDO", "U8", "TAEKWONDO", "KICKBOXING"];
  const STATUSES = [
    { value: 'ACTIF', label: 'Actif' },
    { value: 'INACTIF', label: 'Inactif' },
    { value: 'EN_ATTENTE', label: 'En attente' }
  ];

  const getStatusBadge = (status: string) => {
    if (status === 'ACTIF') return <Badge variant="success">✅ Actif</Badge>;
    if (status === 'INACTIF') return <Badge variant="neutral">Inactif</Badge>;
    if (status === 'EN_ATTENTE') return <Badge variant="warning">⏳ En attente</Badge>;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-cshp-black">Membres</h1>
        <Button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto">
          <Plus size={20} className="mr-2" /> Ajouter
        </Button>
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Rechercher par nom..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cshp-red outline-none"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            {user?.role !== 'SECTION_MANAGER' && (
              <div className="flex flex-wrap gap-2">
                {SECTIONS.map(sec => (
                  <button
                    key={sec}
                    onClick={() => setSectionFilter(sec)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      sectionFilter === sec 
                        ? 'bg-cshp-black text-white' 
                        : 'bg-gray-100 text-cshp-gray hover:bg-gray-200'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            )}
            
            <div className="w-px bg-gray-200 hidden md:block"></div>
            
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(stat => (
                <button
                  key={stat.value}
                  onClick={() => setStatusFilter(stat.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === stat.value 
                      ? 'bg-cshp-black text-white' 
                      : 'bg-gray-100 text-cshp-gray hover:bg-gray-200'
                  }`}
                >
                  {stat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
      ) : isLoading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-cshp-gray">
          Aucun membre trouvé.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map(member => (
            <Card 
               key={member.id} 
               className="p-5 cursor-pointer hover:border-cshp-red transition-colors"
               onClick={() => navigate(`/membres/${member.id}`)}
            >
              <div className="flex flex-col h-full justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-cshp-black">
                    {member.lastName.toUpperCase()} {member.firstName}
                  </h3>
                  
                  <div className="mt-3 flex flex-wrap gap-2">
                    {member.sections.map((s: any) => (
                      <div key={s.id} className="flex gap-1 items-center bg-gray-50 border border-gray-100 rounded-full px-2 py-1">
                        <span className="text-xs font-semibold text-cshp-black">{s.section}</span>
                        <Badge variant="belt">{s.belt || 'Blanche'}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-end border-t border-gray-100 pt-3 mt-2">
                  {getStatusBadge(member.status)}
                  <span className="text-xs text-cshp-gray">
                    Inscrit: {new Date(member.createdAt).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => !isAdding && setIsAddModalOpen(false)} title="Ajouter un membre" width="lg">
        <MembreForm onSubmit={handleAddMember} onCancel={() => setIsAddModalOpen(false)} isLoading={isAdding} />
      </Modal>
    </div>
  );
}
