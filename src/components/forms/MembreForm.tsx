import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface MembreFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

const SECTIONS_LIST = ["KARATE", "JUDO", "U8", "TAEKWONDO", "KICKBOXING"];

const CEINTURES: Record<string, string[]> = {
  KARATE: ["Blanche", "Blanche-Jaune", "Jaune", "Jaune-Orange", "Orange", "Orange-Verte", "Verte", "Verte-Bleue", "Bleue", "Bleue-Marron", "Marron 1", "Marron 2", "Marron 3", "Noire"],
  JUDO: ["Blanche", "Blanche-Jaune", "Jaune", "Jaune-Orange", "Orange", "Orange-Verte", "Verte", "Verte-Bleue", "Bleue", "Bleue-Marron", "Marron 1", "Marron 2", "Marron 3", "Noire"],
  U8: ["Blanche", "Blanche-Jaune", "Jaune", "Jaune-Orange", "Orange"],
  TAEKWONDO: ["Blanche", "Blanche-Jaune", "Jaune", "Jaune-Verte", "Verte", "Verte-Bleue", "Bleue", "Bleue-Rouge", "Rouge 1", "Rouge 2", "Rouge 3", "Noire"],
  KICKBOXING: ["Débutant", "Intermédiaire", "Avancé"]
};

export function MembreForm({ initialData, onSubmit, onCancel, isLoading }: MembreFormProps) {
  const [formData, setFormData] = useState({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    dob: initialData?.dateOfBirth ? initialData.dateOfBirth.split('T')[0] : '',
    gender: initialData?.gender || 'M',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    status: initialData?.status || 'ACTIF',
    notes: initialData?.notes || '',
    parentName: initialData?.parentName || '',
    parentPhone: initialData?.parentPhone || ''
  });

  const [selectedSections, setSelectedSections] = useState<Record<string, string>>(() => {
    const defaultSecs: Record<string, string> = {};
    if (initialData?.sections) {
      initialData.sections.forEach((s: any) => {
        defaultSecs[s.section] = s.belt || "Blanche";
      });
    }
    return defaultSecs;
  });

  const age = useMemo(() => {
    if (!formData.dob) return null;
    const birthDate = new Date(formData.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }, [formData.dob]);

  const estMineur = age !== null && age < 18;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSectionToggle = (section: string) => {
    setSelectedSections(prev => {
      const next = { ...prev };
      if (next[section]) {
        delete next[section];
      } else {
        next[section] = CEINTURES[section]?.[0] || 'Blanche';
      }
      return next;
    });
  };

  const handleBeltChange = (section: string, belt: string) => {
    setSelectedSections(prev => ({ ...prev, [section]: belt }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sectionsArray = Object.entries(selectedSections).map(([section, belt]) => ({
      section,
      belt
    }));

    if (sectionsArray.length === 0) {
      alert('Veuillez sélectionner au moins une section.');
      return;
    }

    const payload: any = {
      ...formData,
      sections: sectionsArray
    };

    if (!estMineur) {
      payload.parentName = null;
      payload.parentPhone = null;
    }

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Prénom *" name="firstName" value={formData.firstName} onChange={handleChange} required />
        <Input label="Nom *" name="lastName" value={formData.lastName} onChange={handleChange} required />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Input 
            label="Date de naissance *" 
            name="dob" 
            type="date" 
            value={formData.dob} 
            onChange={handleChange} 
            required 
          />
          {age !== null && (
            <p className="text-xs text-cshp-gray mt-1">Âge : {age} ans {estMineur && '- MINEUR'}</p>
          )}
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-cshp-black">Genre</label>
          <select 
            name="gender" 
            value={formData.gender} 
            onChange={handleChange}
            className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red"
          >
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Téléphone *" name="phone" value={formData.phone} onChange={handleChange} required />
        <Input label="Courriel" name="email" type="email" value={formData.email} onChange={handleChange} />
      </div>

      <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 space-y-3">
        <label className="block text-sm font-medium text-cshp-black">Sections *</label>
        <div className="flex flex-wrap gap-2">
          {SECTIONS_LIST.map(sec => (
            <button
              type="button"
              key={sec}
              onClick={() => handleSectionToggle(sec)}
              className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                selectedSections[sec] 
                  ? 'bg-cshp-red text-white border-cshp-red' 
                  : 'bg-white text-cshp-gray border-gray-300 hover:bg-gray-100'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        {Object.keys(selectedSections).length > 0 && (
          <div className="pt-3 space-y-3 border-t border-gray-200 mt-3">
            {Object.keys(selectedSections).map(sec => (
              <div key={sec} className="flex gap-4 items-center">
                <span className="w-24 text-sm font-medium text-cshp-black">{sec}</span>
                <select
                  value={selectedSections[sec]}
                  onChange={(e) => handleBeltChange(sec, e.target.value)}
                  className="flex-1 min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white text-sm"
                >
                  {(CEINTURES[sec] || CEINTURES['KARATE']).map(belt => (
                    <option key={belt} value={belt}>{belt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Statut</label>
        <select 
          name="status" 
          value={formData.status} 
          onChange={handleChange}
          className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white"
        >
          <option value="ACTIF">Actif</option>
          <option value="INACTIF">Inactif</option>
          <option value="EN_ATTENTE">En attente</option>
        </select>
      </div>

      {estMineur && (
        <div className="border border-yellow-200 p-4 rounded-lg bg-yellow-50 space-y-4">
          <h4 className="text-sm font-bold text-yellow-800">Informations parentales requises (Mineur)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nom du parent *" name="parentName" value={formData.parentName} onChange={handleChange} required />
            <Input label="Téléphone du parent *" name="parentPhone" value={formData.parentPhone} onChange={handleChange} required />
          </div>
        </div>
      )}

      <div>
        <label className="block mb-1 text-sm font-medium text-cshp-black">Notes</label>
        <textarea 
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg p-3 bg-white min-h-[80px]"
          placeholder="Conditions médicales, notes diverses..."
        />
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Annuler
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          {initialData ? 'Mettre à jour' : 'Ajouter le membre'}
        </Button>
      </div>
    </form>
  );
}
