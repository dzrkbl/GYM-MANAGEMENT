import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/api';
import { Spinner } from '../ui/Spinner';

interface GradeFormProps {
  memberId: string;
  memberSection: string;
  currentBelt: string;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  isAdmin: boolean;
}

export function GradeForm({ memberId, memberSection, currentBelt, onSubmit, onCancel, isLoading, isAdmin }: GradeFormProps) {
  const [formData, setFormData] = useState({
    memberId,
    section: memberSection,
    ceinturePrecedente: currentBelt || 'Blanche',
    ceintureMontante: '',
    date: new Date().toISOString().split('T')[0],
    examinateurId: '',
    note: ''
  });

  const [coachs, setCoachs] = useState<any[]>([]);
  const [loadingCoachs, setLoadingCoachs] = useState(true);

  // Example list of grades
  const gradesDisponibles = [
    'Blanche', 'Blanche-Jaune', 'Jaune', 'Jaune-Orange', 'Orange', 
    'Orange-Verte', 'Verte', 'Verte-Bleue', 'Bleue', 'Bleue-Marron', 
    'Marron', 'Noire', '1er Dan', '2ème Dan'
  ];

  useEffect(() => {
    async function loadCoachs() {
      try {
        const data = await apiFetch<any[]>('/coachs');
        setCoachs(data || []);
      } catch (err) {
        console.error("Erreur coachs", err);
      } finally {
        setLoadingCoachs(false);
      }
    }
    loadCoachs();
  }, [memberSection]);
  
  // Suggest next grade
  useEffect(() => {
    const currentIndex = gradesDisponibles.indexOf(formData.ceinturePrecedente);
    if (currentIndex >= 0 && currentIndex < gradesDisponibles.length - 1) {
      setFormData(prev => ({ ...prev, ceintureMontante: gradesDisponibles[currentIndex + 1] }));
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-gray">Ceinture actuelle</label>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-cshp-black font-medium">
            {formData.ceinturePrecedente}
          </div>
        </div>
        
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Nouvelle ceinture *</label>
          <select 
            name="ceintureMontante" 
            value={formData.ceintureMontante} 
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
            required
          >
            <option value="" disabled>Sélectionner...</option>
            {gradesDisponibles.map(grade => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input 
          label="Date de passage *" 
          name="date" 
          type="date" 
          value={formData.date} 
          onChange={handleChange} 
          required 
        />
        
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Examinateur *</label>
          <select 
            name="examinateurId" 
            value={formData.examinateurId} 
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
            required
            disabled={loadingCoachs}
          >
            <option value="" disabled>
              {loadingCoachs ? 'Chargement...' : 'Sélectionner un examinateur...'}
            </option>
            {coachs.map(coach => (
              <option key={coach.id} value={coach.id}>
                {coach.lastName} {coach.firstName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Notes / Commentaires</label>
        <textarea 
          name="note"
          value={formData.note}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg p-3 bg-white min-h-[80px]"
          placeholder="Appréciation, points à améliorer..."
        />
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          Valider le passage
        </Button>
      </div>
    </form>
  );
}
