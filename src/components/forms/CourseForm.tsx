import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useSections } from '../../hooks/useSections';

interface CourseFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function CourseForm({ initialData, onSubmit, onCancel, isLoading }: CourseFormProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { sections, getLabel } = useSections();

  const [formData, setFormData] = useState({
    section: initialData?.section || (isAdmin ? '' : user?.section) || '',
    dayOfWeek: initialData?.dayOfWeek !== undefined ? initialData.dayOfWeek : 1,
    startTime: initialData?.startTime || '17:00',
    endTime: initialData?.endTime || '18:00',
    coachId: initialData?.coachId || '',
    actif: initialData?.actif ?? true
  });

  const [coachs, setCoachs] = useState<any[]>([]);

  useEffect(() => {
    async function loadCoachs() {
      try {
        const data = await apiFetch<any[]>('/coachs');
        setCoachs(data.filter(c => c.actif));
      } catch (err) {
        console.error(err);
      }
    }
    loadCoachs();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let parsedValue: any = value;
    
    if (name === 'dayOfWeek') parsedValue = parseInt(value, 10);
    if (type === 'checkbox') parsedValue = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData };
    if (!payload.coachId) payload.coachId = null;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Section *</label>
          {isAdmin ? (
            <select
              name="section"
              value={formData.section}
              onChange={handleChange}
              className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
              required
            >
              <option value="">-- Choisir une section --</option>
              {sections.map(s => (
                <option key={s.id} value={s.code}>{s.label}</option>
              ))}
            </select>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-cshp-black font-medium">
              {getLabel(formData.section)}
            </div>
          )}
        </div>
        
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Jour de la semaine *</label>
          <select
            name="dayOfWeek"
            value={formData.dayOfWeek}
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
            required
          >
            <option value={1}>Lundi</option>
            <option value={2}>Mardi</option>
            <option value={3}>Mercredi</option>
            <option value={4}>Jeudi</option>
            <option value={5}>Vendredi</option>
            <option value={6}>Samedi</option>
            <option value={0}>Dimanche</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input label="Heure début *" name="startTime" type="time" value={formData.startTime} onChange={handleChange} required />
        <Input label="Heure fin *" name="endTime" type="time" value={formData.endTime} onChange={handleChange} required />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Coach Assigné</label>
        <select
          name="coachId"
          value={formData.coachId || ''}
          onChange={handleChange}
          className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
        >
          <option value="">-- Sans coach assigné --</option>
          {coachs.filter(c => c.section === 'TOUS' || c.section === formData.section).map(c => (
            <option key={c.id} value={c.id}>{c.lastName} {c.firstName}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          {initialData ? 'Enregistrer' : 'Créer le cours'}
        </Button>
      </div>
    </form>
  );
}
