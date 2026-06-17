// Règlement intérieur du Centre Sportif de Haute-Performance.
// Source de vérité unique : affiché sur le formulaire d'inscription en ligne et
// accepté par le parent/athlète. Le numéro de version est stocké avec le membre
// au moment de l'acceptation, afin de savoir quelle version a été signée.
//
// IMPORTANT : si le texte change, incrémenter REGLEMENT_VERSION.

export const REGLEMENT_VERSION = '2026-06';

export interface ReglementArticle {
  numero: number;
  titre: string;
  corps: string;
}

export const REGLEMENT_ARTICLES: ReglementArticle[] = [
  {
    numero: 1,
    titre: 'Dispositions générales',
    corps:
      "Le présent règlement intérieur complète et précise les statuts du club. Il a force obligatoire à l'égard de tous les membres. Aucune de ses dispositions ne peut être contraire aux statuts ou en restreindre la portée.\n" +
      "Il concerne la pratique des arts martiaux affinitaires et des sports de combat. Il a été adopté en assemblée générale.\n" +
      "Il est porté à la connaissance des adhérents par voie d'affichage sur le panneau d'information situé dans le dojo, est téléchargeable sur la page Facebook du Centre Sportif de Haute-Performance, et peut être communiqué individuellement à tout adhérent qui en fait la demande auprès d'un membre de la direction.\n" +
      "L'administration, les entraîneurs et les membres peuvent s'y référer au besoin. L'objectif est de cohabiter dans un environnement sécuritaire et respectueux pour tous. Il sera donc porté à votre connaissance dès l'inscription.",
  },
  {
    numero: 2,
    titre: "Dossier d'inscription",
    corps:
      "Le dossier d'inscription comporte :\n" +
      "• Fiche d'inscription — dûment remplie par les parents ou l'athlète majeur, signée et remise à l'administration à l'inscription. Elle engage à respecter les statuts et le règlement intérieur du centre. Tout changement au statut de l'athlète doit être mentionné à l'administration pour une mise à jour.\n" +
      "• Affiliation — tous les participants doivent être affiliés (Fédérations de JUDO, KARATÉ et TAEKWONDO). L'athlète doit s'affilier dès son inscription, sans quoi l'accès au tatami lui sera refusé. L'affiliation procure aussi une couverture en cas d'accident lors des entraînements, tournois provinciaux, passages de grades, etc.\n" +
      "• Règlement intérieur — il doit être lu et signé par les parents et par les athlètes de 14 ans et plus.\n" +
      "• Certificat médical — les participants ayant une condition médicale doivent fournir un certificat médical d'aptitude à la pratique des arts martiaux, selon le cas.",
  },
  {
    numero: 3,
    titre: 'Adhésions et cotisations',
    corps:
      "Pour être membre actif du Centre Sportif de Haute-Performance, l'athlète devra remplir un formulaire d'adhésion précisant l'engagement de respecter les statuts et le règlement intérieur.\n" +
      "Tout membre actif devra à chaque saison régler sa cotisation pour la saison sportive en cours. L'absence de règlement des cotisations entraîne la perte de la qualité de membre du Centre, et donc de la discipline pratiquée.\n" +
      "En règle générale, aucun remboursement, même partiel, ne peut avoir lieu sauf cas exceptionnels (maladies graves, maternité, hospitalisation, décès) et avec accord préalable de la direction. En tout état de cause, les frais fixes ne seront jamais remboursés.\n" +
      "L'adhésion est soumise à l'approbation du comité directeur ; elle pourra être refusée sans nuire à la motivation du candidat.\n" +
      "Après un cours d'essai, les cotisations (montant fixé chaque année par le comité directeur) seront versées comme suit : 50 % du montant annuel à la première inscription, et les 50 % restants un mois plus tard.\n" +
      "N.B. : tous les modes de paiement sont acceptés (validation auprès du comptable du Centre).",
  },
  {
    numero: 4,
    titre: 'Absences et retard',
    corps:
      "En cas d'absence ou de retards récurrents, l'entraîneur doit aviser l'administration le plus tôt possible.\n" +
      "Une réunion entre l'administration et le staff technique sera diligentée afin d'étudier les faits et prendre la meilleure décision.",
  },
  {
    numero: 5,
    titre: 'Remboursement',
    corps:
      "L'absence aux cours ou l'arrêt en cours d'année ne dispense pas du paiement de la cotisation, sauf cas exceptionnel en accord avec l'administration.\n" +
      "Après une présence à plus de 3 entraînements, aucun remboursement ne sera réclamé. De plus, les paiements concernant l'affiliation ne peuvent être remboursés.\n" +
      "Le Centre ne peut être tenu pour responsable en cas de vol, de perte ou de dégradation constatés dans l'établissement. Il est donc vivement conseillé de ne pas venir à l'entraînement avec des objets de valeur (montre, portable, vêtements…).",
  },
  {
    numero: 6,
    titre: 'Assurance',
    corps:
      "L'affiliation provinciale et/ou fédérale inclut l'assurance des pratiquants sous réserve du certificat médical annuel de non-contre-indication à la pratique de l'art martial choisi et des disciplines affinitaires. Les membres sont tenus de s'assurer de leur responsabilité pour les trajets et activités non couverts par l'affiliation. Le club s'engage également à obtenir les assurances nécessaires à la couverture des responsabilités civiles.",
  },
  {
    numero: 7,
    titre: 'Responsabilité des parents',
    corps:
      "Les parents sont responsables de leurs enfants en dehors des heures de cours, c'est-à-dire avant leur admission dans le dojo et dès que le parent reprend possession de son enfant à la fin du cours.\n" +
      "Les athlètes mineurs rentrant seuls à la maison devront obligatoirement fournir une autorisation parentale.\n" +
      "Nous sommes responsables des athlètes seulement pendant les heures de cours ; votre ponctualité est nécessaire pour la sécurité de vos enfants. Avant de laisser vos enfants dans la salle, assurez-vous de la présence du ou des instructeurs, qui peuvent exceptionnellement être absents ou retardés.\n" +
      "Pour le bon déroulement des séances et la sécurité de tous, la présence des parents est interdite à l'intérieur du dojo lors des entraînements.\n" +
      "L'administration met son bureau à la disposition des parents et des athlètes adultes pour toute réclamation. L'échange dans le corridor est à éviter, afin de ne pas perturber les cours et de préserver la confidentialité.",
  },
  {
    numero: 8,
    titre: 'Responsabilité des entraîneurs',
    corps:
      "Les enseignants veillent au bon déroulement des séances et à la sécurité de tous. Ils assurent l'animation du cours, l'encadrement des athlètes, leurs entraînements, leur préparation et leur suivi pour les compétitions.\n" +
      "Pour le bon développement de nos athlètes, nous tenons à ce que nos entraîneurs soient formés et en continuel apprentissage. La formation continue est au centre de nos préoccupations.",
  },
  {
    numero: 9,
    titre: 'Passage de grade',
    corps:
      "Le passage de grade (ou Kyu) est un événement important pour les athlètes ; il est tenu deux à trois fois par année. Toutes les informations relatives aux passages de grade sont affichées en temps et lieu et communiquées aux athlètes et aux parents par courriel.\n" +
      "Exceptionnellement, un passage de grade peut être tenu hors des dates prédéfinies, sous présentation d'une justification valable.\n" +
      "Le grade visé est prédéterminé avec l'entraîneur et l'entraîneur adjoint lors des entraînements, selon le développement de l'athlète. Les gradations sont octroyées de façon progressive.\n" +
      "Le jury est composé des enseignants du club. Les grades sont décernés par l'entraîneur en chef et l'entraîneur adjoint, qui communiquent les résultats après délibérations.",
  },
  {
    numero: 10,
    titre: 'Comportement',
    corps:
      "Le salut doit être pratiqué à l'entrée et à la sortie du tatami, ainsi qu'avec chaque partenaire. Il a une signification profonde : entièrement disposé à accepter le combat, je me concentre sur la tâche à entreprendre et m'engage à respecter mon partenaire. Il doit être exécuté avec sincérité.\n" +
      "Le dojo est un lieu de respect ; ses membres adoptent un comportement reflétant ses valeurs universelles (politesse, amitié, respect, modestie, sincérité, honneur, contrôle de soi et courage). Le respect des entraîneurs, des partenaires et de l'administration est exigé de tous.\n" +
      "Toute attitude portant atteinte à l'intégrité morale ou physique des jeunes, préjudiciable à l'association, perturbatrice, agressive, irrespectueuse envers l'enseignant ou contestant ses décisions, sera passible d'exclusion sur décision du Conseil d'administration, selon la séquence suivante :\n" +
      "1) un courriel est envoyé aux parents pour porter les faits à leur connaissance ;\n" +
      "2) en cas de récidive, le parent et l'élève sont convoqués afin que les faits ne se reproduisent plus ;\n" +
      "3) à la troisième récidive, l'athlète est renvoyé sans qu'aucun remboursement ne soit réclamé.\n" +
      "Le Conseil d'administration peut, par résolution, suspendre, expulser ou émettre toute sanction qu'il juge appropriée envers un membre qui enfreint les règlements ou dont la conduite est jugée nuisible. La décision est motivée et signifiée au membre par courriel dans les trois jours suivant l'incident.",
  },
  {
    numero: 11,
    titre: 'Ponctualité',
    corps:
      "Les athlètes doivent arriver 5 minutes avant le début de leur cours. L'entraîneur se réserve le droit de refuser tout athlète arrivant en retard à l'entraînement. L'athlète ne peut quitter le centre avant l'arrivée des parents.",
  },
  {
    numero: 12,
    titre: 'Tenue / hygiène',
    corps:
      "L'uniforme est obligatoire pour tous. Le port d'un t-shirt blanc sous le kimono est également obligatoire. Par respect et pour la sécurité des partenaires, les athlètes doivent avoir une hygiène exemplaire et une tenue propre à chaque entraînement.\n" +
      "Pour la sécurité de tous : les cheveux doivent être attachés en tout temps ; les ongles des mains et des pieds doivent être coupés ; les bijoux doivent être enlevés avant le début du cours.",
  },
  {
    numero: 13,
    titre: 'Propreté des lieux',
    corps:
      "Le dojo est un lieu de partage ; athlètes, parents et visiteurs veillent à ce qu'il reste propre en tout temps :\n" +
      "• utiliser les poubelles pour les déchets ;\n" +
      "• ne pas manger ni boire sur le tatami ;\n" +
      "• ôter ses souliers avant d'entrer sur le tatami et les ranger à l'endroit prévu ;\n" +
      "• ranger le matériel après utilisation ;\n" +
      "• utiliser les vestiaires à bon escient et garder les lieux propres après usage.",
  },
  {
    numero: 14,
    titre: "Droit à l'image",
    corps:
      "Le Centre Sportif de Haute-Performance peut utiliser des photos et des vidéos pour promouvoir la pratique des arts martiaux en son sein. Les parents ou athlètes qui ne le souhaitent pas doivent le mentionner à l'administration.",
  },
  {
    numero: 15,
    titre: 'Communications',
    corps:
      "Le Centre Sportif de Haute-Performance communique principalement par courriel : rappels de paiement, reçus, convocations et résultats de passages de grade, avis de fermeture et toute autre information importante.\n" +
      "En s'inscrivant, le membre (ou son parent) s'engage à fournir une adresse courriel valide et à la consulter régulièrement, et à aviser l'administration de tout changement de coordonnées.",
  },
  {
    numero: 16,
    titre: 'Annulation et reprise de cours',
    corps:
      "En cas de fermeture exceptionnelle (intempéries, force majeure, jours fériés ou autre circonstance indépendante de la volonté du Centre), les cours concernés sont annulés et ne font pas l'objet d'une reprise.\n" +
      "Une telle annulation ponctuelle ne donne lieu à aucun remboursement ni crédit. Dans la mesure du possible, les annulations sont communiquées aux membres par courriel.",
  },
];
