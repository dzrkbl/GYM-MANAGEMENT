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

const DAYS_LIST = [
  { code: 'LUN', label: 'Lun' },
  { code: 'MAR', label: 'Mar' },
  { code: 'MER', label: 'Mer' },
  { code: 'JEU', label: 'Jeu' },
  { code: 'VEN', label: 'Ven' },
  { code: 'SAM', label: 'Sam' },
  { code: 'DIM', label: 'Dim' }
];

export function CourseForm({ initialData, onSubmit, onCancel, isLoading }: CourseFormProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { sections, getLabel } = useSections();

  const [formData, setFormData] = useState({
    section: initialData?.section || (isAdmin ? '' : user?.section) || '',
    startTime: initialData?.startTime || '17:00',
    endTime: initialData?.endTime || '18:30',
    coachId: initialData?.coachId || '',
    actif: initialData?.actif ?? true
  });

  const [selectedDays, setSelectedDays] = useState<string[]>(initialData?.jours || []);
  const [coachs, setCoachs] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadCoachs() {
      try {
        const data = await apiFetch<any[]>('/coachs');
        setCoachs(data.filter((c: any) => c.actif));
      } catch (err) {
        console.error(err);
      }
    }
    loadCoachs();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let parsedValue: any = value;
    if (type === 'checkbox') parsedValue = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleDayToggle = (dayCode: string) => {
    setSelectedDays(prev => {
      if (prev.includes(dayCode)) {
        return prev.filter(d => d !== dayCode);
      } else {
        return [...prev, dayCode];
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Validation
    if (!formData.section) {
      setErrorMsg('La section est obligatoire.');
      return;
    }

    if (selectedDays.length === 0) {
      setErrorMsg('Veuillez cocher au moins un jour de répétition.');
      return;
    }

    const [startH, startM] = formData.startTime.split(':').map(Number);
    const [endH, endM] = formData.endTime.split(':').map(Number);
    const startTimeVal = startH * 60 + startM;
    const endTimeVal = endH * 60 + endM;

    if (endTimeVal <= startTimeVal) {
      setErrorMsg('L’heure de fin doit être supérieure à l’heure de début.');
      return;
    }

    const payload = {
      ...formData,
      jours: selectedDays,
      coachId: formData.coachId || null
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium border border-red-100 flex items-center gap-2">
          <span>⚠️</span> {errorMsg}
        </div>
      )}

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
          {coachs.map(c => (
            <option key={c.id} value={c.id}>{c.lastName} {c.firstName}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-2 text-sm font-medium text-cshp-black">Jours de répétition *</label>
        <div className="flex flex-wrap gap-2">
          {DAYS_LIST.map(day => {
            const isChecked = selectedDays.includes(day.code);
            return (
              <button
                type="button"
                key={day.code}
                onClick={() => handleDayToggle(day.code)}
                className={`min-h-[44px] min-w-[44px] px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  isChecked
                    ? 'bg-cshp-red text-white border-cshp-red shadow-sm'
                    : 'bg-white text-cshp-black border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>{isChecked ? '✓' : '☐'}</span>
                <span>{day.label}</span>
              </button>
            );
          })}
        </div>
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
