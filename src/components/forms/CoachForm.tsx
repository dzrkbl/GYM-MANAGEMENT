import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useSections } from '../../hooks/useSections';

interface CoachFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function CoachForm({ initialData, onSubmit, onCancel, isLoading }: CoachFormProps) {
  const { sections, isLoading: sectionsLoading } = useSections();

  const [formData, setFormData] = useState({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    role: initialData?.role || 'COACH',
    password: '',
    remuneration: initialData?.remuneration || 0,
    actif: initialData?.actif ?? true,
    dateDebut: initialData?.dateDebut ? initialData.dateDebut.split('T')[0] : new Date().toISOString().split('T')[0],
    note: initialData?.note || ''
  });

  const [selectedSections, setSelectedSections] = useState<string[]>(() => {
    if (!initialData?.section) return [];
    if (initialData.section === 'TOUS') return [];
    return initialData.section.split(',').map((s: string) => s.trim()).filter(Boolean);
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    let parsedValue: any = value;
    if (type === 'number') parsedValue = parseFloat(value) || 0;
    if (type === 'checkbox') parsedValue = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({ ...prev, [name]: parsedValue }));
  };

  const handleSectionToggle = (sectionCode: string) => {
    setSelectedSections(prev => {
      if (prev.includes(sectionCode)) {
        return prev.filter(s => s !== sectionCode);
      } else {
        return [...prev, sectionCode];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sectionVal = selectedSections.length > 0 ? selectedSections.join(',') : null;
    const payload: any = { ...formData, section: sectionVal };
    // Mot de passe optionnel : si laissé vide, on ne l'envoie pas (création = mot de passe temporaire généré ; édition = inchangé).
    if (!payload.password) delete payload.password;
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

      <div>
        <Input
          label={initialData ? 'Nouveau mot de passe' : 'Mot de passe'}
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          placeholder={initialData ? 'Laisser vide pour ne pas changer' : 'Laisser vide pour générer un mot de passe temporaire'}
        />
        <p className="text-xs text-cshp-gray mt-1">
          {initialData
            ? 'Laissez vide pour conserver le mot de passe actuel.'
            : 'Minimum 8 caractères. Si vide, un mot de passe temporaire sera généré et affiché une seule fois.'}
        </p>
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
          <label className="block mb-1 text-sm font-medium text-cshp-black">Sections (Multi-sélection) *</label>
          <div className="flex flex-wrap gap-2 border border-gray-300 p-3 rounded-lg bg-white min-h-[44px]">
            {sectionsLoading ? (
              <span className="text-sm text-gray-500">Chargement...</span>
            ) : sections.length === 0 ? (
              <span className="text-sm text-gray-500">Aucune section</span>
            ) : (
              sections.map(s => {
                const isSelected = selectedSections.includes(s.code);
                const displayLabel = s.code === 'U8' ? 'Ninjas' : s.label;
                return (
                  <button
                    type="button"
                    key={s.code}
                    onClick={() => handleSectionToggle(s.code)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      isSelected
                        ? 'bg-cshp-red text-white border-cshp-red'
                        : 'bg-white text-cshp-gray border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {displayLabel}
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-cshp-gray mt-1">Sélectionnez une ou plusieurs sections.</p>
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
