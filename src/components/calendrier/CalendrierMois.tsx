import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useSections } from '../../hooks/useSections';
import { todayLocalISO } from '../../lib/format';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { ChevronLeft, ChevronRight, MapPin, Users, CalendarPlus, ExternalLink, ClipboardCheck, UserCheck } from 'lucide-react';

/**
 * Vue mois unifiée : les cours récurrents (semaine type) projetés sur les vraies
 * dates, et par-dessus les événements datés (compétitions, passages de grade,
 * formations, fermetures) du calendrier de saison.
 *
 * Toutes les dates circulent en « AAAA-MM-JJ » : les événements sont stockés à
 * midi UTC, donc découper la chaîne ISO donne le bon jour civil quel que soit
 * le fuseau du navigateur. Aucune conversion locale, aucun décalage possible.
 */

const CODES_JOUR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const ENTETES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const TYPES: Record<string, { label: string; puce: string; point: string }> = {
  COMPETITION:   { label: 'Compétition',    puce: 'bg-red-50 text-red-700 border-red-200',          point: 'bg-cshp-red' },
  PASSAGE_GRADE: { label: 'Passage de grade', puce: 'bg-indigo-50 text-indigo-700 border-indigo-200', point: 'bg-indigo-500' },
  FORMATION:     { label: 'Formation',      puce: 'bg-sky-50 text-sky-700 border-sky-200',          point: 'bg-sky-500' },
  FERMETURE:     { label: 'Fermeture',      puce: 'bg-slate-100 text-slate-600 border-slate-300',   point: 'bg-slate-500' },
  AUTRE:         { label: 'Autre',          puce: 'bg-amber-50 text-amber-700 border-amber-200',    point: 'bg-amber-500' },
};
const typeDe = (t: string) => TYPES[t] || TYPES.AUTRE;

// `iso` ne vaut QUE pour des dates-jour ancrées à midi UTC (le découpage de la
// chaîne rend alors le bon jour civil). Pour « maintenant » ou un vrai
// horodatage (pointeAt), c'est le jour LOCAL qui compte : après 20 h à
// Montréal, le jour UTC est déjà demain.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const jourDe = (valeur: string) => valeur.slice(0, 10);
const jourLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Liste des jours « AAAA-MM-JJ » couverts par un événement (bornes incluses). */
function joursCouverts(debut: string, fin: string | null): string[] {
  const d = new Date(`${jourDe(debut)}T12:00:00Z`);
  const f = new Date(`${jourDe(fin || debut)}T12:00:00Z`);
  const jours: string[] = [];
  for (let t = d.getTime(); t <= f.getTime() && jours.length < 400; t += 86_400_000) {
    jours.push(iso(new Date(t)));
  }
  return jours;
}

export function CalendrierMois() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getLabel } = useSections();

  // Jour LOCAL du navigateur (le soir, le jour UTC est déjà demain : pastille
  // « aujourd'hui » et mois d'ouverture étaient décalés après 20 h).
  const aujourdhui = todayLocalISO();
  const [annee, setAnnee] = useState(() => new Date().getFullYear());
  const [mois, setMois] = useState(() => new Date().getMonth()); // 0-11

  const [cours, setCours] = useState<any[]>([]);
  const [evenements, setEvenements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [afficherCours, setAfficherCours] = useState(true);
  const [ouvert, setOuvert] = useState<any>(null); // événement affiché en détail
  const [enCours, setEnCours] = useState(false);
  // Séance ouverte : un cours à une date précise, avec la liste des pointés.
  const [seance, setSeance] = useState<{ cours: any; jour: string } | null>(null);
  const [presences, setPresences] = useState<any[] | null>(null);

  useEffect(() => {
    if (!seance) { setPresences(null); return; }
    let annule = false;
    setPresences(null);
    apiFetch<any[]>(`/presences?courseId=${seance.cours.id}&date=${seance.jour}`)
      .then((r) => { if (!annule) setPresences(r); })
      .catch(() => { if (!annule) setPresences([]); });
    return () => { annule = true; };
  }, [seance]);

  // Grille : du lundi de la 1re semaine au dimanche de la dernière.
  const grille = useMemo(() => {
    const premier = new Date(Date.UTC(annee, mois, 1, 12));
    const decalage = (premier.getUTCDay() + 6) % 7; // lundi = 0
    const debut = new Date(premier.getTime() - decalage * 86_400_000);
    const cases: { jour: string; dansLeMois: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut.getTime() + i * 86_400_000);
      cases.push({ jour: iso(d), dansLeMois: d.getUTCMonth() === mois });
      if (i >= 34 && d.getUTCMonth() !== mois && (d.getUTCDay() + 6) % 7 === 6) break;
    }
    return cases;
  }, [annee, mois]);

  useEffect(() => {
    let annule = false;
    (async () => {
      setIsLoading(true);
      try {
        const [c, e] = await Promise.all([
          apiFetch<any[]>('/cours'),
          apiFetch<any[]>(`/calendrier?debut=${grille[0].jour}&fin=${grille[grille.length - 1].jour}`),
        ]);
        if (annule) return;
        setCours(c.filter((x: any) => x.actif));
        setEvenements(e);
        setError('');
      } catch (err: any) {
        if (!annule) setError(err?.message || 'Erreur lors du chargement du calendrier');
      } finally {
        if (!annule) setIsLoading(false);
      }
    })();
    return () => { annule = true; };
  }, [grille]);

  // Index jour -> événements, en dépliant les événements de plusieurs jours.
  const parJour = useMemo(() => {
    const index = new Map<string, any[]>();
    for (const e of evenements) {
      for (const j of joursCouverts(e.date, e.dateFin)) {
        if (!index.has(j)) index.set(j, []);
        index.get(j)!.push(e);
      }
    }
    return index;
  }, [evenements]);

  const coursDuJour = (jour: string) => {
    if (!afficherCours) return [];
    const code = CODES_JOUR[new Date(`${jour}T12:00:00Z`).getUTCDay()];
    return cours
      .filter((c) => c.jours.includes(code))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };
  // Une fermeture neutralise les cours du jour : c'est l'information utile.
  const estFerme = (jour: string) => (parJour.get(jour) || []).some((e) => e.type === 'FERMETURE');

  const changerMois = (delta: number) => {
    const d = new Date(Date.UTC(annee, mois + delta, 1, 12));
    setAnnee(d.getUTCFullYear());
    setMois(d.getUTCMonth());
  };
  const revenirAujourdhui = () => {
    // Année/mois LOCAUX : en soirée, getUTCMonth() sur « maintenant » renvoie
    // déjà le mois suivant le dernier jour du mois.
    const n = new Date();
    setAnnee(n.getFullYear());
    setMois(n.getMonth());
  };

  const changerStatut = async (evenement: any, statut: 'RETENU' | 'CALENDRIER') => {
    setEnCours(true);
    try {
      await apiFetch(`/evenements/${evenement.id}/statut`, { method: 'PATCH', body: JSON.stringify({ statut }) });
      setEvenements((prev) => prev.map((e) => (e.id === evenement.id ? { ...e, statut } : e)));
      setOuvert((o: any) => (o && o.id === evenement.id ? { ...o, statut } : o));
    } catch (err: any) {
      alert(err?.message || 'Changement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const peutRetenir = ['ADMIN', 'SECTION_MANAGER'].includes(user?.role || '');
  const journeesAvecContenu = grille.filter(
    (c) => c.dansLeMois && ((parJour.get(c.jour) || []).length > 0 || coursDuJour(c.jour).length > 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => changerMois(-1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50" aria-label="Mois précédent">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => changerMois(1)} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50" aria-label="Mois suivant">
            <ChevronRight size={18} />
          </button>
          <h2 className="text-lg font-bold text-cshp-black capitalize ml-2">{MOIS[mois]} {annee}</h2>
          <button onClick={revenirAujourdhui} className="ml-2 text-xs font-semibold text-cshp-red hover:underline">Aujourd'hui</button>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
          <input type="checkbox" checked={afficherCours} onChange={(e) => setAfficherCours(e.target.checked)} className="rounded text-cshp-red focus:ring-cshp-red" />
          Afficher les cours récurrents
        </label>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPES).map(([code, t]) => (
          <span key={code} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-full ${t.point}`} /> {t.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-gray-400" /> Calendrier de saison (non retenu)
        </span>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : (
        <>
          {/* Grille mensuelle (écrans larges) */}
          <Card className="hidden md:block p-0 overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
              {ENTETES.map((j) => (
                <div key={j} className="py-2 text-center text-[10px] uppercase font-extrabold text-gray-400 tracking-wider">{j}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grille.map(({ jour, dansLeMois }) => {
                const evts = parJour.get(jour) || [];
                const cs = estFerme(jour) ? [] : coursDuJour(jour);
                return (
                  <div
                    key={jour}
                    className={`min-h-[104px] border-b border-r border-gray-100 p-1.5 space-y-1 ${
                      dansLeMois ? 'bg-white' : 'bg-gray-50/60'
                    } ${estFerme(jour) ? 'bg-slate-100/80' : ''}`}
                  >
                    <div className={`text-xs font-bold ${
                      jour === aujourdhui
                        ? 'bg-cshp-red text-white rounded-full w-6 h-6 inline-flex items-center justify-center'
                        : dansLeMois ? 'text-gray-700' : 'text-gray-300'
                    }`}>
                      {Number(jour.slice(8, 10))}
                    </div>

                    {evts.map((e) => {
                      const t = typeDe(e.type);
                      return (
                        <button
                          key={e.id + jour}
                          onClick={() => setOuvert(e)}
                          className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded border truncate ${t.puce} ${
                            e.statut === 'CALENDRIER' ? 'border-dashed opacity-80' : 'font-semibold'
                          }`}
                          title={e.titre}
                        >
                          {e.titre}
                        </button>
                      );
                    })}

                    {cs.map((c) => (
                      <button
                        key={c.id + jour}
                        onClick={() => setSeance({ cours: c, jour })}
                        className="w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded text-gray-500 hover:bg-gray-100 truncate"
                        title={`${getLabel(c.section)} · ${c.startTime}-${c.endTime} — voir les présences`}
                      >
                        {c.startTime} {getLabel(c.section)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Agenda (téléphone) : seulement les journées qui ont quelque chose */}
          <div className="md:hidden space-y-3">
            {journeesAvecContenu.length === 0 ? (
              <Card className="p-6 text-center text-sm text-gray-500">Rien de prévu ce mois-ci.</Card>
            ) : journeesAvecContenu.map(({ jour }) => {
              const evts = parJour.get(jour) || [];
              const cs = estFerme(jour) ? [] : coursDuJour(jour);
              return (
                <Card key={jour} className={`p-3 ${jour === aujourdhui ? 'border-l-4 border-l-cshp-red' : ''}`}>
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">
                    {new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                  </div>
                  <div className="space-y-1.5">
                    {evts.map((e) => {
                      const t = typeDe(e.type);
                      return (
                        <button key={e.id} onClick={() => setOuvert(e)}
                          className={`w-full text-left text-xs px-2 py-1.5 rounded border ${t.puce} ${e.statut === 'CALENDRIER' ? 'border-dashed' : 'font-semibold'}`}>
                          {e.titre}
                        </button>
                      );
                    })}
                    {cs.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSeance({ cours: c, jour })}
                        className="w-full text-left text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100"
                      >
                        {c.startTime} à {c.endTime} · {getLabel(c.section)}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Présences d'une séance : qui était là, qui a pointé et quand */}
      <Modal
        isOpen={!!seance}
        onClose={() => setSeance(null)}
        title={seance ? `${getLabel(seance.cours.section)} — ${new Date(`${seance.jour}T12:00:00Z`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}` : ''}
        width="lg"
      >
        {seance && (
          <div className="space-y-4 text-sm">
            <p className="text-gray-500 text-xs">
              Cours de {seance.cours.startTime} à {seance.cours.endTime}
              {seance.cours.coach ? ` · ${seance.cours.coach.firstName ?? ''} ${seance.cours.coach.lastName ?? ''}`.trimEnd() : ''}
            </p>

            {presences === null ? (
              <div className="py-6 flex justify-center"><Spinner /></div>
            ) : presences.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-gray-600 font-medium">Aucun pointage enregistré pour cette séance.</p>
                <p className="text-xs text-gray-400">
                  Soit le cours n'a pas eu lieu, soit le pointage n'a pas été fait.
                </p>
                {seance.jour <= aujourdhui && (
                  <Button variant="outline" onClick={() => navigate('/pointer')}>
                    <ClipboardCheck size={16} className="mr-1.5" /> Aller au pointage
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <UserCheck size={17} /> {presences.length} athlète(s) présent(s)
                </div>
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                  {presences.map((p) => (
                    <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50">
                      <button
                        onClick={() => navigate(`/membres/${p.member.id}`)}
                        className="text-left font-medium text-cshp-black hover:text-cshp-red"
                      >
                        <span className="uppercase">{p.member.lastName}</span> {p.member.firstName}
                      </button>
                      {p.status !== 'PRESENT' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          {p.status === 'EXCUSED' ? 'Excusé' : 'Absent'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {/* Traçabilité : nulle pour les pointages antérieurs à cette fonction */}
                <p className="text-xs text-gray-400">
                  {presences[0]?.pointeParNom || presences[0]?.pointeAt ? (
                    <>
                      Pointé{presences[0].pointeParNom ? ` par ${presences[0].pointeParNom}` : ''}
                      {presences[0].pointeAt
                        ? ` le ${new Date(presences[0].pointeAt).toLocaleString('fr-CA')}`
                        : ''}
                      {/* Jour LOCAL de la saisie : un pointage fait le soir même
                          après 20 h est déjà « demain » en UTC — comparer le jour
                          UTC marquait faussement tardifs les cours de 19-20 h. */}
                      {presences[0].pointeAt && jourLocal(new Date(presences[0].pointeAt)) > seance.jour && (
                        <span className="text-amber-600 font-semibold"> · saisi après la date du cours</span>
                      )}
                    </>
                  ) : (
                    <>Auteur du pointage inconnu (saisi avant la mise en place de la traçabilité).</>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Détail d'un événement */}
      <Modal isOpen={!!ouvert} onClose={() => setOuvert(null)} title={ouvert?.titre || ''} width="lg">
        {ouvert && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 text-[11px] font-bold border rounded-full ${typeDe(ouvert.type).puce}`}>
                {typeDe(ouvert.type).label}
              </span>
              {ouvert.statut === 'CALENDRIER' ? (
                <span className="px-2 py-0.5 text-[11px] font-bold border border-dashed border-gray-400 text-gray-500 rounded-full">
                  Calendrier de saison
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full">
                  Retenu par le club
                </span>
              )}
              {ouvert.source && (
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 rounded-full">
                  {ouvert.source.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="space-y-1 text-gray-700">
              <div>
                <strong>Dates : </strong>
                {new Date(`${jourDe(ouvert.date)}T12:00:00Z`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                {ouvert.dateFin && jourDe(ouvert.dateFin) !== jourDe(ouvert.date) && (
                  <> au {new Date(`${jourDe(ouvert.dateFin)}T12:00:00Z`).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</>
                )}
                {ouvert.horaire && <> · {ouvert.horaire}</>}
              </div>
              {ouvert.lieu && <div className="flex items-start gap-1"><MapPin size={15} className="mt-0.5 shrink-0 text-gray-400" /> {ouvert.lieu}</div>}
              {ouvert.discipline && <div><strong>Discipline : </strong>{ouvert.discipline}</div>}
              {ouvert.fraisInscription ? <div><strong>Frais : </strong>{ouvert.fraisInscription.toFixed(2)} $</div> : null}
              {ouvert.nbInscriptions > 0 && (
                <div className="flex items-center gap-1"><Users size={15} className="text-gray-400" /> {ouvert.nbInscriptions} inscription(s)</div>
              )}
              {ouvert.note && <p className="text-gray-500 whitespace-pre-line pt-1">{ouvert.note}</p>}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {ouvert.statut === 'CALENDRIER' ? (
                peutRetenir && (
                  <Button onClick={() => changerStatut(ouvert, 'RETENU')} disabled={enCours}>
                    <CalendarPlus size={17} className="mr-1.5" />
                    {enCours ? 'Un instant…' : 'Intégrer au module Événements'}
                  </Button>
                )
              ) : (
                <>
                  <Button variant="outline" onClick={() => navigate('/admin/evenements')}>
                    <ExternalLink size={16} className="mr-1.5" /> Ouvrir dans Événements
                  </Button>
                  {peutRetenir && !ouvert.nbInscriptions && (
                    <Button variant="outline" onClick={() => changerStatut(ouvert, 'CALENDRIER')} disabled={enCours}>
                      Retirer du module
                    </Button>
                  )}
                </>
              )}
            </div>

            {ouvert.statut === 'CALENDRIER' && (
              <p className="text-xs text-gray-400">
                Tant qu'un événement reste au calendrier de saison, il est purement informatif :
                aucune inscription d'athlète n'est possible. L'intégrer active les inscriptions,
                les frais et la vérification d'admissibilité.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
