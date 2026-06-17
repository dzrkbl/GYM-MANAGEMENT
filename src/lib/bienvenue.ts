import { KATAS_HEIAN } from './katas';

// Contenu de la documentation de bienvenue envoyée par courriel à un nouvel inscrit.
// Renvoie le HTML interne (le gabarit htmlCourriel ajoute le logo, l'en-tête et la signature).
export function contenuBienvenue(params: { nom: string; karate?: boolean; note?: string }): string {
  const { nom, karate, note } = params;

  const encadreNote = note
    ? `<p style="background:#f5f5f5;border-left:4px solid #c0392b;padding:10px 14px;border-radius:4px;">${note}</p>`
    : '';

  const sectionKarate = karate
    ? `
      <h3 style="color:#1a1a2e;margin-top:24px;">Programme de katas (Karaté)</h3>
      <p>En préparation aux passages de grade, voici les katas Heian à réviser à la maison.
      Cliquez pour visionner la vidéo :</p>
      <ul>
        ${KATAS_HEIAN.map((k) => `<li><a href="${k.videoUrl}">${k.nom}</a></li>`).join('')}
      </ul>`
    : '';

  return `
    <p>Bonjour,</p>
    <p>Bienvenue au Centre Sportif de Haute-Performance ! Nous sommes ravis d'accueillir
    <strong>${nom}</strong> parmi nos athlètes. Voici quelques informations pour bien démarrer.</p>
    ${encadreNote}

    <h3 style="color:#1a1a2e;margin-top:24px;">À savoir pour les entraînements</h3>
    <ul>
      <li><strong>Tenue :</strong> l'uniforme (kimono) est obligatoire après le cours d'essai, avec un t-shirt blanc en dessous. La tenue doit être propre à chaque entraînement.</li>
      <li><strong>Ponctualité :</strong> arrivez 5 minutes avant le début du cours. L'athlète ne quitte pas le centre avant l'arrivée du parent.</li>
      <li><strong>Sécurité et hygiène :</strong> cheveux attachés, ongles coupés, bijoux retirés. Prévoyez une bouteille d'eau ; aucune nourriture sur le tatami.</li>
      <li><strong>Sur le tatami :</strong> pour le bon déroulement des séances, la présence des parents sur le tatami n'est pas permise pendant les cours.</li>
    </ul>

    <h3 style="color:#1a1a2e;margin-top:24px;">Affiliation et assurance</h3>
    <p>L'affiliation à la fédération est obligatoire dès l'inscription : elle est requise pour
    accéder au tatami et procure une couverture d'assurance lors des entraînements, tournois et passages de grade.</p>

    <h3 style="color:#1a1a2e;margin-top:24px;">Paiements</h3>
    <ul>
      <li>La cotisation est fixée chaque saison (taxes incluses).</li>
      <li>Elle peut être réglée selon un échéancier convenu à l'inscription.</li>
      <li>Modes acceptés : comptant, virement Interac, chèque ou carte.</li>
      <li>Un reçu vous est transmis par courriel pour chaque paiement électronique.</li>
    </ul>

    <h3 style="color:#1a1a2e;margin-top:24px;">Communications</h3>
    <p>Nous communiquons principalement par courriel : rappels de paiement, reçus, convocations
    et résultats de passages de grade, avis de fermeture. Merci de garder une adresse courriel
    valide et de la consulter régulièrement.</p>

    <h3 style="color:#1a1a2e;margin-top:24px;">Règlement intérieur</h3>
    <p>Le règlement intérieur encadre la vie du club et la sécurité de tous. Il est accepté à
    l'inscription, affiché au dojo et disponible sur notre page Facebook ou sur demande auprès de l'administration.</p>
    ${sectionKarate}

    <p style="margin-top:24px;">Pour toute question, écrivez-nous à
    <a href="mailto:payements@centresportifhp.com">payements@centresportifhp.com</a>.
    Au plaisir de vous voir au dojo !</p>`;
}
