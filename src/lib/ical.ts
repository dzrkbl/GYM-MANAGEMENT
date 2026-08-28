/**
 * Lecteur iCalendar (RFC 5545) minimal, taillé pour les calendriers de saison
 * des fédérations (Karaté Québec, Judo Québec, CEKQ…).
 *
 * Écrit à la main plutôt qu'avec une dépendance : le besoin se limite aux
 * VEVENT et le format est stable depuis 1998. Les pièges réellement rencontrés
 * dans le fichier de Karaté Québec sont traités ci-dessous (attention : le
 * dépôt n'a PAS de suite de tests automatisée — vérifier à la main après toute
 * retouche, notamment le cas DTEND exclusif) :
 *  - pliage des lignes (une ligne qui commence par une espace continue la précédente) ;
 *  - échappements \, \; \n \\ dans les textes ;
 *  - trois formes de DTSTART : « ;TZID=America/New_York:AAAAMMJJTHHMMSS »,
 *    « ;VALUE=DATE:AAAAMMJJ » et « ;TZID=Z;VALUE=DATE:AAAAMMJJ » ;
 *  - DTEND EXCLUSIF pour les événements en journées entières (une compétition
 *    du 27 au 31 août est publiée avec DTEND au 1er septembre) ;
 *  - HTML dans le nom du calendrier (« <p>Calendrier Saison 2025/2026</p> »).
 *
 * Convention de dates : chaque événement est ramené au JOUR civil local, ancré
 * à midi UTC, comme partout ailleurs dans l'application (voir `dateAMidi`).
 * Cela évite tout décalage de fuseau à l'affichage.
 */

export interface EvenementIcal {
  uid: string;
  titre: string;
  /** Jour de début, ancré à midi UTC. */
  date: Date;
  /** Dernier jour INCLUS (égal à `date` pour un événement d'une journée). */
  dateFin: Date;
  lieu: string | null;
  description: string | null;
  /** « 09:00 à 13:00 » si l'événement porte une heure, sinon null. */
  horaire: string | null;
  organisateur: string | null;
}

export interface CalendrierIcal {
  nom: string | null;
  evenements: EvenementIcal[];
}

/** Déplie les lignes : une ligne commençant par une espace ou une tabulation continue la précédente. */
function deplier(texte: string): string[] {
  const lignes = texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const sorties: string[] = [];
  for (const ligne of lignes) {
    if ((ligne.startsWith(' ') || ligne.startsWith('\t')) && sorties.length > 0) {
      sorties[sorties.length - 1] += ligne.slice(1);
    } else {
      sorties.push(ligne);
    }
  }
  return sorties;
}

/** Retire les échappements iCal d'une valeur texte. */
function desechapper(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Certains générateurs mettent du HTML dans NAME / X-WR-CALNAME. */
function sansHtml(v: string): string {
  return v.replace(/<[^>]*>/g, '').trim();
}

interface Propriete { nom: string; params: Record<string, string>; valeur: string; }

function lirePropriete(ligne: string): Propriete | null {
  const sep = ligne.indexOf(':');
  if (sep === -1) return null;
  const gauche = ligne.slice(0, sep);
  const valeur = ligne.slice(sep + 1);
  const morceaux = gauche.split(';');
  const params: Record<string, string> = {};
  for (const p of morceaux.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { nom: morceaux[0].toUpperCase(), params, valeur };
}

const midiUTC = (a: number, m: number, j: number) =>
  new Date(Date.UTC(a, m - 1, j, 12, 0, 0));

/**
 * Convertit une valeur DTSTART/DTEND en jour civil local (ancré midi UTC).
 * `journeeEntiere` indique une valeur de type DATE (sans heure).
 */
function lireDate(prop: Propriete): { jour: Date; heure: string | null; journeeEntiere: boolean } | null {
  const v = prop.valeur.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, aa, mm, jj, hh, mi, , zoulou] = m;
  const journeeEntiere = prop.params.VALUE === 'DATE' || hh === undefined;

  // Heure exprimée en UTC (suffixe Z) : le jour civil local peut différer, on
  // convertit vers l'heure de Montréal avant de retenir le jour.
  if (!journeeEntiere && zoulou) {
    const instant = new Date(Date.UTC(+aa, +mm - 1, +jj, +hh, +mi, 0));
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(instant);
    const p = (t: string) => local.find((x) => x.type === t)!.value;
    return {
      jour: midiUTC(+p('year'), +p('month'), +p('day')),
      heure: `${p('hour')}:${p('minute')}`,
      journeeEntiere: false,
    };
  }

  // Sinon la valeur est déjà exprimée en heure locale (TZID) : le jour civil
  // est lu tel quel, aucune conversion nécessaire.
  return {
    jour: midiUTC(+aa, +mm, +jj),
    heure: journeeEntiere ? null : `${hh}:${mi}`,
    journeeEntiere,
  };
}

const veille = (d: Date) => new Date(d.getTime() - 86_400_000);

export function parseIcal(texte: string): CalendrierIcal {
  const lignes = deplier(texte);
  let nom: string | null = null;
  const evenements: EvenementIcal[] = [];

  let courant: Record<string, Propriete> | null = null;
  let dansTimezone = false;

  for (const ligne of lignes) {
    const prop = lirePropriete(ligne);
    if (!prop) continue;

    // Les blocs VTIMEZONE contiennent aussi des DTSTART : on les ignore.
    if (prop.nom === 'BEGIN' && prop.valeur.toUpperCase() === 'VTIMEZONE') { dansTimezone = true; continue; }
    if (prop.nom === 'END' && prop.valeur.toUpperCase() === 'VTIMEZONE') { dansTimezone = false; continue; }
    if (dansTimezone) continue;

    if (prop.nom === 'BEGIN' && prop.valeur.toUpperCase() === 'VEVENT') { courant = {}; continue; }
    if (prop.nom === 'END' && prop.valeur.toUpperCase() === 'VEVENT') {
      if (courant) {
        const evt = construire(courant);
        if (evt) evenements.push(evt);
      }
      courant = null;
      continue;
    }

    if (courant) {
      courant[prop.nom] = prop;
    } else if ((prop.nom === 'X-WR-CALNAME' || prop.nom === 'NAME') && !nom) {
      nom = sansHtml(desechapper(prop.valeur)) || null;
    }
  }

  return { nom, evenements };
}

function construire(props: Record<string, Propriete>): EvenementIcal | null {
  const debut = props.DTSTART ? lireDate(props.DTSTART) : null;
  const titre = props.SUMMARY ? desechapper(props.SUMMARY.valeur) : '';
  if (!debut || !titre) return null; // sans date ou sans titre, l'entrée est inutilisable

  const fin = props.DTEND ? lireDate(props.DTEND) : null;
  let dateFin = debut.jour;
  if (fin) {
    // DTEND est EXCLUSIF pour les journées entières : le dernier jour réel est
    // la veille. Pour un événement horaire, DTEND est le moment de fin, donc
    // le jour se prend tel quel.
    const candidat = fin.journeeEntiere ? veille(fin.jour) : fin.jour;
    if (candidat.getTime() >= debut.jour.getTime()) dateFin = candidat;
  }

  const horaire = debut.heure
    ? (fin?.heure && fin.heure !== debut.heure ? `${debut.heure} à ${fin.heure}` : debut.heure)
    : null;

  const description = props.DESCRIPTION ? desechapper(props.DESCRIPTION.valeur) : '';
  const lieu = props.LOCATION ? desechapper(props.LOCATION.valeur) : '';

  return {
    uid: props.UID ? props.UID.valeur.trim() : `${titre}|${debut.jour.toISOString().slice(0, 10)}`,
    titre,
    date: debut.jour,
    dateFin,
    lieu: lieu || null,
    description: description || null,
    horaire,
    organisateur: props.ORGANIZER?.params.CN ? desechapper(props.ORGANIZER.params.CN) : null,
  };
}

/**
 * Devine le type d'un événement d'après son intitulé. Toujours corrigeable à la
 * main : c'est une aide à la saisie, pas une vérité.
 */
export function deviner(titre: string): 'COMPETITION' | 'FORMATION' | 'PASSAGE_GRADE' | 'AUTRE' {
  const t = titre.toLowerCase();
  if (/(formation|clinique|stage|séminaire|seminaire|pnce|arbitrage)/.test(t)) return 'FORMATION';
  if (/(passage|grade|ceinture|dan\b|examen)/.test(t)) return 'PASSAGE_GRADE';
  if (/(championnat|coupe|sélection|selection|open|tournoi|league|série|serie|jeux|k1|circuit|invitation)/.test(t)) return 'COMPETITION';
  return 'AUTRE';
}
