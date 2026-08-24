import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RefreshCw, Plus, Trash2, Rss, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Abonnements aux calendriers de saison des fédérations (fichiers .ics).
 * Les dates importées arrivent en statut CALENDRIER : visibles dans la vue
 * mois, sans inscription possible, jusqu'à ce que le club les retienne.
 */

interface Source {
  id: string;
  code: string;
  nom: string;
  url: string;
  discipline: string | null;
  actif: boolean;
  dernierSyncAt: string | null;
  dernierSyncMsg: string | null;
}

const VIDE = { code: '', nom: '', url: '', discipline: 'KARATE' as string };

export function SourcesCalendrier() {
  const [sources, setSources] = useState<Source[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState(VIDE);
  const [afficherForm, setAfficherForm] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = async () => {
    try {
      setSources(await apiFetch<Source[]>('/calendrier/sources'));
    } catch (e: any) {
      setErreur(e?.message || 'Chargement impossible');
    }
  };
  useEffect(() => { if (ouvert) charger(); }, [ouvert]);

  const ajouter = async () => {
    setErreur(''); setMessage('');
    setEnCours('ajout');
    try {
      await apiFetch('/calendrier/sources', { method: 'POST', body: JSON.stringify(form) });
      setForm(VIDE); setAfficherForm(false);
      await charger();
      setMessage('Calendrier ajouté. Lancez la synchronisation pour importer les dates.');
    } catch (e: any) {
      setErreur(e?.message || "Ajout impossible");
    } finally { setEnCours(null); }
  };

  const synchroniser = async (s: Source) => {
    setErreur(''); setMessage('');
    setEnCours(s.id);
    try {
      const r = await apiFetch<{ message: string }>(`/calendrier/sources/${s.id}/sync`, { method: 'POST' });
      setMessage(`${s.nom} : ${r.message}`);
      await charger();
    } catch (e: any) {
      setErreur(e?.message || 'Synchronisation impossible');
      await charger();
    } finally { setEnCours(null); }
  };

  const supprimer = async (s: Source) => {
    if (!confirm(`Retirer l'abonnement « ${s.nom} » ?\n\nLes dates déjà importées sont conservées.`)) return;
    try {
      await apiFetch(`/calendrier/sources/${s.id}`, { method: 'DELETE' });
      await charger();
    } catch (e: any) { setErreur(e?.message || 'Suppression impossible'); }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <button
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 text-left"
      >
        <span className="flex items-center gap-2 font-bold text-cshp-black text-sm">
          <Rss size={17} className="text-cshp-red" /> Calendriers de fédérations
          {sources.length > 0 && <span className="text-xs font-normal text-gray-400">({sources.length})</span>}
        </span>
        {ouvert ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>

      {ouvert && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            Collez le lien d'abonnement <strong>.ics</strong> d'une fédération (Karaté Québec, Judo Québec, CEKQ).
            Les dates importées apparaissent dans la vue <strong>Mois</strong> du calendrier, en pointillé :
            elles sont informatives jusqu'à ce que vous les intégriez au module Événements.
          </p>

          {erreur && <div className="p-2.5 bg-red-50 text-red-600 rounded-lg border border-red-100 text-xs">{erreur}</div>}
          {message && <div className="p-2.5 bg-green-50 text-green-700 rounded-lg border border-green-100 text-xs">{message}</div>}

          {sources.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Aucun calendrier abonné pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50/60">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-cshp-black">
                      {s.nom} <span className="text-xs font-normal text-gray-400">{s.code}{s.discipline ? ` · ${s.discipline}` : ''}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {s.dernierSyncAt
                        ? <>Dernière synchro : {new Date(s.dernierSyncAt).toLocaleString('fr-CA')} — {s.dernierSyncMsg}</>
                        : 'Jamais synchronisé'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" onClick={() => synchroniser(s)} disabled={enCours === s.id} className="!min-h-0 h-9 px-3 text-xs">
                      <RefreshCw size={14} className={`mr-1 ${enCours === s.id ? 'animate-spin' : ''}`} />
                      {enCours === s.id ? 'Synchro…' : 'Synchroniser'}
                    </Button>
                    <button onClick={() => supprimer(s)} className="p-2 text-gray-400 hover:text-red-500" title="Retirer l'abonnement">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {afficherForm ? (
            <div className="space-y-3 p-3 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Code (MAJUSCULES, sans espace)" placeholder="KARATE_QUEBEC"
                  value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
                <Input label="Nom affiché" placeholder="Karaté Québec — saison 2025/2026"
                  value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
              </div>
              <Input label="Lien d'abonnement .ics" placeholder="https://…/calendar.ics"
                value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value.trim() })} />
              <div>
                <label className="block mb-1 text-sm font-medium text-cshp-black">Discipline appliquée aux dates importées</label>
                <select
                  className="w-full min-h-[44px] border border-gray-300 rounded-lg px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-cshp-red"
                  value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}
                >
                  <option value="KARATE">Karaté</option>
                  <option value="JUDO">Judo</option>
                  <option value="NINJAS">Ninjas</option>
                  <option value="TOUS">Toutes</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={ajouter} disabled={enCours === 'ajout' || !form.code || !form.nom || !form.url}>
                  {enCours === 'ajout' ? 'Ajout…' : 'Ajouter le calendrier'}
                </Button>
                <Button variant="outline" onClick={() => { setAfficherForm(false); setForm(VIDE); }}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAfficherForm(true)} className="!min-h-0 h-9 px-3 text-xs">
              <Plus size={15} className="mr-1" /> Ajouter un calendrier
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
