// Programme de katas — KARATÉ uniquement.
// Katas à apprendre selon le grade à passer (en préparation au passage de grade).
// Pour ajouter une vidéo, renseigner `videoUrl` sur le kata correspondant.

export interface Kata {
  nom: string;
  videoUrl?: string;
}

export interface NiveauKata {
  ceinture: string; // libellé tel que communiqué aux parents
  kyu: string;
  katas: Kata[];
}

const HEIAN_SHODAN: Kata = { nom: 'HEIAN SHODAN', videoUrl: '' };
const HEIAN_NIDAN: Kata = { nom: 'HEIAN NIDAN', videoUrl: '' };
const HEIAN_SANDAN: Kata = { nom: 'HEIAN SANDAN', videoUrl: '' };
const HEIAN_YONDAN: Kata = { nom: 'HEIAN YONDAN', videoUrl: '' };
const HEIAN_GODAN: Kata = { nom: 'HEIAN GODAN', videoUrl: '' };

export const KATAS_KARATE: NiveauKata[] = [
  { ceinture: 'Jaune ou demi-jaune', kyu: '8e Kyu', katas: [HEIAN_SHODAN] },
  { ceinture: 'Orange ou demi-orange', kyu: '7e Kyu', katas: [HEIAN_SHODAN, HEIAN_NIDAN] },
  { ceinture: 'Verte ou demi-verte', kyu: '6e Kyu', katas: [HEIAN_SHODAN, HEIAN_NIDAN, HEIAN_SANDAN] },
  { ceinture: 'Bleue', kyu: '5e Kyu', katas: [HEIAN_SHODAN, HEIAN_NIDAN, HEIAN_SANDAN, HEIAN_YONDAN] },
  { ceinture: 'Mauve', kyu: '4e Kyu', katas: [HEIAN_SHODAN, HEIAN_NIDAN, HEIAN_SANDAN, HEIAN_YONDAN, HEIAN_GODAN] },
];

// Vrai si la section/le code correspond au Karaté (ex: KARATE, KARATE_GR1…).
export function estKarate(section?: string | null): boolean {
  return !!section && section.toUpperCase().startsWith('KARATE');
}
