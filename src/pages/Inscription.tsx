import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { REGLEMENT_ARTICLES, REGLEMENT_VERSION } from '../lib/reglement';
import { CheckCircle2 } from 'lucide-react';

interface SectionOption { code: string; label: string; }

const selectClass =
  'w-full min-h-[44px] border border-gray-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-2 focus:ring-cshp-red';

export function Inscription() {
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [form, setForm] = useState({
    firstName: '', lastName: '', dob: '', gender: '',
    phone: '', email: '',
    parentName: '', parentPhone: '', parentEmail: '',
    adresse: '', codePostal: '', ville: '',
    noteSante: '',
    urgenceNom: '', urgenceLien: '', urgenceTel: '',
    section: '',
    reglementSignataire: '',
    website: '', // honeypot
  });
  const [problemeSante, setProblemeSante] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<SectionOption[]>('/inscription/sections')
      .then((data) => { if (active) setSections(data); })
      .catch(() => { /* sections facultatives pour le formulaire */ });
    return () => { active = false; };
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepte) { setError('Vous devez lire et accepter le règlement intérieur.'); return; }
    if (!form.parentEmail && !form.email) { setError('Un courriel (parent ou athlète) est requis.'); return; }
    setError('');
    setIsLoading(true);
    try {
      await apiFetch('/inscription', {
        method: 'POST',
        body: JSON.stringify({ ...form, problemeSante, accepte: true, reglementVersion: REGLEMENT_VERSION }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'inscription");
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={48} />
          <h1 className="text-xl font-bold text-cshp-black mb-2">Inscription reçue !</h1>
          <p className="text-cshp-gray text-sm">
            Merci. Votre demande est en attente de validation et sera confirmée une fois le premier
            paiement complété. Vous recevrez un courriel de confirmation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Centre Sportif de Haute-Performance"
            className="h-20 mx-auto mb-3"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-2xl font-bold text-cshp-black">Centre Sportif de Haute-Performance</h1>
          <p className="text-cshp-gray mt-1">Formulaire d'inscription</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">Athlète</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Prénom *" value={form.firstName} onChange={set('firstName')} required />
            <Input label="Nom *" value={form.lastName} onChange={set('lastName')} required />
            <Input label="Date de naissance" type="date" value={form.dob} onChange={set('dob')} />
            <div>
              <label className="block mb-1 text-sm font-medium text-cshp-black">Genre</label>
              <select className={selectClass} value={form.gender} onChange={set('gender')}>
                <option value="">—</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <Input label="Téléphone (athlète)" value={form.phone} onChange={set('phone')} />
            <Input label="Courriel (athlète)" type="email" value={form.email} onChange={set('email')} />
            <div className="sm:col-span-2">
              <label className="block mb-1 text-sm font-medium text-cshp-black">Discipline / groupe</label>
              <select className={selectClass} value={form.section} onChange={set('section')}>
                <option value="">— Choisir —</option>
                {sections.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">Parent / tuteur (pour les mineurs)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom du parent" value={form.parentName} onChange={set('parentName')} />
            <Input label="Téléphone du parent" value={form.parentPhone} onChange={set('parentPhone')} />
            <div className="sm:col-span-2">
              <Input label="Courriel du parent" type="email" value={form.parentEmail} onChange={set('parentEmail')} />
            </div>
          </div>

          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">Adresse</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Input label="Adresse" value={form.adresse} onChange={set('adresse')} /></div>
            <Input label="Ville" value={form.ville} onChange={set('ville')} />
            <Input label="Code postal" value={form.codePostal} onChange={set('codePostal')} />
          </div>

          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">Contact d'urgence (1er répondant)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Nom et prénom" value={form.urgenceNom} onChange={set('urgenceNom')} />
            <Input label="Lien avec l'athlète" value={form.urgenceLien} onChange={set('urgenceLien')} />
            <Input label="Téléphone" value={form.urgenceTel} onChange={set('urgenceTel')} />
          </div>

          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">Santé</h2>
          <div>
            <label className="block mb-2 text-sm font-medium text-cshp-black">
              Un problème de santé à porter à notre connaissance ?
            </label>
            <div className="flex gap-6 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="sante" checked={!problemeSante} onChange={() => setProblemeSante(false)} /> Non
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="sante" checked={problemeSante} onChange={() => setProblemeSante(true)} /> Oui
              </label>
            </div>
            {problemeSante && (
              <textarea
                value={form.noteSante}
                onChange={(e) => setForm((p) => ({ ...p, noteSante: e.target.value }))}
                rows={2}
                placeholder="Veuillez préciser. Une autorisation médicale pour la pratique sportive pourra être demandée."
                className="mt-2 w-full border border-gray-300 rounded-lg p-3 bg-white text-sm"
              />
            )}
          </div>

          <h2 className="font-bold text-cshp-black border-b border-gray-100 pb-1">
            Règlement intérieur <span className="text-xs font-normal text-cshp-gray">(version {REGLEMENT_VERSION})</span>
          </h2>
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm space-y-3">
            {REGLEMENT_ARTICLES.map((a) => (
              <div key={a.numero}>
                <p className="font-semibold text-cshp-black">Article {a.numero} — {a.titre}</p>
                <p className="text-gray-700 whitespace-pre-line">{a.corps}</p>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm text-cshp-black">
            <input
              type="checkbox"
              checked={accepte}
              onChange={(e) => setAccepte(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded text-cshp-red focus:ring-cshp-red"
            />
            <span>J'ai lu et j'accepte le règlement intérieur du Centre Sportif de Haute-Performance.</span>
          </label>

          <Input
            label="Signature (nom complet du parent ou de l'athlète majeur) *"
            value={form.reglementSignataire}
            onChange={set('reglementSignataire')}
            placeholder="Ex. : Marie Tremblay"
            required
          />

          {/* Honeypot anti-spam : champ caché, ne pas remplir. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={set('website')}
            className="hidden"
            aria-hidden="true"
          />

          <Button type="submit" fullWidth isLoading={isLoading}>
            Soumettre l'inscription
          </Button>
          <p className="text-xs text-cshp-gray text-center">
            En soumettant, vous confirmez l'exactitude des renseignements fournis.
          </p>
        </form>
      </div>
    </div>
  );
}
