import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface CoachFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function CoachForm({ initialData, onSubmit, onCancel, isLoading }: CoachFormProps) {
  const [formData, setFormData] = useState({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    role: initialData?.role || 'COACH',
    section: initialData?.section || 'TOUS',
    remuneration: initialData?.remuneration || 0,
    actif: initialData?.actif ?? true,
    dateDebut: initialData?.dateDebut ? initialData.dateDebut.split('T')[0] : new Date().toISOString().split('T')[0],
    note: initialData?.note || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    let parsedValue: any = value;
    if (type === 'number') parsedValue = parseFloat(value) || 0;
    if (type === 'checkbox') parsedValue = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData, section: formData.section === 'TOUS' ? null : formData.section };
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Prénom *" name="firstName" value={formData.firstName} onChange={handleChange} required />
        <Input label="Nom *" name="lastName" value={formData.lastName} onChange={handleChange} required />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Courriel *" name="email" type="email" value={formData.email} onChange={handleChange} required />
        <Input label="Téléphone" name="phone" value={formData.phone} onChange={handleChange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Rôle *</label>
          <select 
            name="role" 
            value={formData.role} 
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
          >
            <option value="COACH">Coach</option>
            <option value="SECTION_MANAGER">Section Manager</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Section</label>
          <select 
            name="section" 
            value={formData.section} 
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
          >
            <option value="TOUS">Toutes sections</option>
            <option value="KARATE">Karaté</option>
            <option value="JUDO">Judo</option>
            <option value="U8">U8</option>
            <option value="TAEKWONDO">Taekwondo</option>
            <option value="KICKBOXING">Kickboxing</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input 
          label="Rémunération mensuelle ($) *" 
          name="remuneration" 
          type="number" 
          step="0.01"
          value={formData.remuneration} 
          onChange={handleChange} 
          required 
        />
        <Input 
          label="Date de début *" 
          name="dateDebut" 
          type="date" 
          value={formData.dateDebut} 
          onChange={handleChange} 
          required 
        />
      </div>

      <div className="flex items-center gap-2 mt-4">
        <input 
          type="checkbox" 
          name="actif" 
          id="actif"
          checked={formData.actif} 
          onChange={handleChange}
          className="w-5 h-5 rounded text-cshp-red focus:ring-cshp-red"
        />
        <label htmlFor="actif" className="text-sm font-medium text-cshp-black">Compte Actif</label>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Notes</label>
        <textarea 
          name="note"
          value={formData.note}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg p-3 bg-white min-h-[80px]"
          placeholder="Notes diverses..."
        />
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          {initialData ? 'Mettre à jour' : 'Créer le coach'}
        </Button>
      </div>
    </form>
  );
}
