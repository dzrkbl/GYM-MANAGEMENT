import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export interface Section {
  id: string;
  code: string;
  label: string;
  sport: string;
  ordre: number;
  actif: boolean;
}

export function useSections() {
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<Section[]>('/sections')
      .then(data => {
        if (active) {
          setSections(data || []);
        }
      })
      .catch(err => {
        console.error('Erreur récurrente de récupération des sections:', err);
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const getLabel = (code: string) =>
    sections.find(s => s.code === code)?.label || code;

  const codes = sections.map(s => s.code);

  return { sections, codes, getLabel, isLoading };
}
