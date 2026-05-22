import { PrismaClient, Plan, MethodePaiement } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Nettoyage des données de test précédentes...');

  // Supprimer dans l'ordre des cles etrangeres (FK)
  await prisma.paymentVersement.deleteMany({
    where: { member: { email: { endsWith: '@cshp-test.com' } } }
  });
  await prisma.memberSection.deleteMany({
    where: { member: { email: { endsWith: '@cshp-test.com' } } }
  });
  await prisma.member.deleteMany({
    where: { email: { endsWith: '@cshp-test.com' } }
  });
  await prisma.coachSalaire.deleteMany({
    where: { nom: { startsWith: 'TEST' } }
  });

  console.log('✅ Nettoyage terminé');

  // ÉTAPE 1 — VÉRIFICATION / CRÉATION DES CODES SECTIONS
  console.log('🔍 Vérification des sections...');
  const sectionsExistantes = await prisma.section.findMany();
  console.log('SECTIONS EN DB INITIALES:', JSON.stringify(sectionsExistantes.map(s => s.code), null, 2));

  const sectionsACreer = [
    { code: 'KARATE_GR1', label: 'Karaté Gr.1', sport: 'KARATE', ordre: 1 },
    { code: 'KARATE_GR2', label: 'Karaté Gr.2', sport: 'KARATE', ordre: 2 },
    { code: 'KARATE_GR3', label: 'Karaté Gr.3', sport: 'KARATE', ordre: 3 },
    { code: 'JUDO_GR1',   label: 'Judo Gr.1',   sport: 'JUDO',   ordre: 4 },
    { code: 'JUDO_GR2',   label: 'Judo Gr.2',   sport: 'JUDO',   ordre: 5 },
    { code: 'JUDO_GR3',   label: 'Judo Gr.3',   sport: 'JUDO',   ordre: 6 },
    { code: 'NINJAS_GR1', label: 'Ninjas Gr.1', sport: 'NINJAS', ordre: 7 },
  ];

  for (const s of sectionsACreer) {
    const existe = sectionsExistantes.find(dbSec => dbSec.code === s.code);
    if (!existe) {
      console.log(`➕ Création de la section manquante: ${s.code}`);
      await prisma.section.create({
        data: {
          code: s.code,
          label: s.label,
          sport: s.sport,
          ordre: s.ordre,
          actif: true
        }
      });
    }
  }

  const sectionsFinales = await prisma.section.findMany();
  console.log('SECTIONS EN DB FINALISÉES:', JSON.stringify(sectionsFinales.map(s => s.code), null, 2));

  // ÉTAPE 2 — SEED DES COACHS JUDO
  console.log('👥 Création des 2 coachs judo de test...');
  await prisma.coachSalaire.createMany({
    data: [
      { nom: 'TEST Coach Judo Senior', montant: 600, actif: true },
      { nom: 'TEST Coach Judo Junior', montant: 200, actif: true },
    ]
  });

  // ÉTAPE 3 — SEED DES MEMBRES + VERSEMENTS
  console.log('🏋️ Création des 45 membres de test...');

  const membres = [
    {
      nom: 'Mansouri', prenom: 'Idir',
      email: 'test.mansouri.idir@cshp-test.com',
      telephone: '514-TEST-001',
      dateNaissance: new Date('2013-04-12'),
      poids: 41.2, grade: 'V', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Mansouri', prenom: 'Lina',
      email: 'test.mansouri.lina@cshp-test.com',
      telephone: '514-TEST-002',
      dateNaissance: new Date('2015-09-03'),
      poids: 34.5, grade: 'B', tailleCeinture: '2',
      sectionCode: 'KARATE_GR1',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 711, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Hamdani', prenom: 'Rayan',
      email: 'test.hamdani.rayan@cshp-test.com',
      telephone: '514-TEST-003',
      dateNaissance: new Date('2011-07-22'),
      poids: 58.3, grade: 'Bleu', tailleCeinture: '5',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-03-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Hamdani', prenom: 'Sara',
      email: 'test.hamdani.sara@cshp-test.com',
      telephone: '514-TEST-004',
      dateNaissance: new Date('2014-02-14'),
      poids: 43.0, grade: 'J', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 355.50, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' },
        { numero: 2, montant: 355.50, datePrevue: new Date('2026-01-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Benali', prenom: 'Kamil',
      email: 'test.benali.kamil@cshp-test.com',
      telephone: '514-TEST-005',
      dateNaissance: new Date('2016-11-30'),
      poids: 32.1, grade: 'B', tailleCeinture: '1',
      sectionCode: 'KARATE_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Meziane', prenom: 'Younes',
      email: 'test.meziane.younes@cshp-test.com',
      telephone: '514-TEST-006',
      dateNaissance: new Date('2010-05-18'),
      poids: 67.4, grade: 'J-O', tailleCeinture: '4',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-10-01'),
      finContrat: new Date('2026-10-01'),
      versements: [
        { numero: 1, montant: 263.33, datePrevue: new Date('2025-10-01'), datePaiement: new Date('2025-10-01'), methode: 'CASH' },
        { numero: 2, montant: 263.33, datePrevue: new Date('2026-01-01'), datePaiement: new Date('2026-01-05'), methode: 'CASH' },
        { numero: 3, montant: 263.34, datePrevue: new Date('2026-07-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Meziane', prenom: 'Amira',
      email: 'test.meziane.amira@cshp-test.com',
      telephone: '514-TEST-007',
      dateNaissance: new Date('2012-08-07'),
      poids: 48.9, grade: 'V-B', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-03'), methode: 'VIREMENT' }
      ]
    },
    {
      nom: 'Cherifi', prenom: 'Adam',
      email: 'test.cherifi.adam@cshp-test.com',
      telephone: '514-TEST-008',
      dateNaissance: new Date('2017-03-25'),
      poids: 28.0, grade: 'B', tailleCeinture: '2',
      sectionCode: 'KARATE_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: true,
      prixBase: 250, montantFinal: 225,
      dateInscription: new Date('2026-01-15'),
      finContrat: new Date('2026-04-15'),
      versements: [
        { numero: 1, montant: 225, datePrevue: new Date('2026-01-15'), datePaiement: new Date('2026-01-15'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Cherifi', prenom: 'Nour',
      email: 'test.cherifi.nour@cshp-test.com',
      telephone: '514-TEST-009',
      dateNaissance: new Date('2019-01-10'),
      poids: 22.5, grade: 'B', tailleCeinture: '1',
      sectionCode: 'KARATE_GR1',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2026-01-15'),
      finContrat: new Date('2027-01-15'),
      versements: [
        { numero: 1, montant: 237, datePrevue: new Date('2026-01-15'), datePaiement: new Date('2026-01-15'), methode: 'CASH' },
        { numero: 2, montant: 237, datePrevue: new Date('2026-05-15'), datePaiement: null, methode: null },
        { numero: 3, montant: 237, datePrevue: new Date('2026-09-15'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Ouali', prenom: 'Tarek',
      email: 'test.ouali.tarek@cshp-test.com',
      telephone: '514-TEST-010',
      dateNaissance: new Date('2009-12-01'),
      poids: 72.0, grade: 'O', tailleCeinture: '5',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Benmoussa', prenom: 'Sonia',
      email: 'test.benmoussa.sonia@cshp-test.com',
      telephone: '514-TEST-011',
      dateNaissance: new Date('2015-07-19'),
      poids: 36.8, grade: 'J', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-01-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Lahlou', prenom: 'Nassim',
      email: 'test.lahlou.nassim@cshp-test.com',
      telephone: '514-TEST-012',
      dateNaissance: new Date('2013-10-05'),
      poids: 44.7, grade: 'V', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-11-01'),
      finContrat: new Date('2026-11-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-11-01'), datePaiement: new Date('2025-11-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Lahlou', prenom: 'Inès',
      email: 'test.lahlou.ines@cshp-test.com',
      telephone: '514-TEST-013',
      dateNaissance: new Date('2016-06-22'),
      poids: 30.2, grade: 'B-J', tailleCeinture: '2',
      sectionCode: 'KARATE_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: true,
      prixBase: 250, montantFinal: 225,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 225, datePrevue: new Date('2026-02-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Ferradj', prenom: 'Malik',
      email: 'test.ferradj.malik@cshp-test.com',
      telephone: '514-TEST-014',
      dateNaissance: new Date('2011-03-14'),
      poids: 55.1, grade: 'Bleu', tailleCeinture: '5',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-10-01'),
      finContrat: new Date('2026-10-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-10-01'), datePaiement: new Date('2025-10-01'), methode: 'CASH' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-04-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Aissaoui', prenom: 'Cyrine',
      email: 'test.aissaoui.cyrine@cshp-test.com',
      telephone: '514-TEST-015',
      dateNaissance: new Date('2018-09-28'),
      poids: 24.3, grade: 'B', tailleCeinture: '1',
      sectionCode: 'KARATE_GR1',
      plan: 'MENSUEL', rabaisFamille: false,
      prixBase: 80, montantFinal: 80,
      dateInscription: new Date('2026-05-01'),
      finContrat: new Date('2026-06-01'),
      versements: [
        { numero: 1, montant: 80, datePrevue: new Date('2026-05-01'), datePaiement: new Date('2026-05-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Chibani', prenom: 'Haroun',
      email: 'test.chibani.haroun@cshp-test.com',
      telephone: '514-TEST-016',
      dateNaissance: new Date('2014-04-04'),
      poids: 47.6, grade: 'V', tailleCeinture: '3',
      sectionCode: 'KARATE_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 263.33, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' },
        { numero: 2, montant: 263.33, datePrevue: new Date('2025-12-01'), datePaiement: new Date('2025-12-03'), methode: 'CASH' },
        { numero: 3, montant: 263.34, datePrevue: new Date('2026-06-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Guerroudj', prenom: 'Lylia',
      email: 'test.guerroudj.lylia@cshp-test.com',
      telephone: '514-TEST-017',
      dateNaissance: new Date('2012-01-31'),
      poids: 50.4, grade: 'J-O', tailleCeinture: '4',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' }
      ]
    },
    {
      nom: 'Touati', prenom: 'Bilal',
      email: 'test.touati.bilal@cshp-test.com',
      telephone: '514-TEST-018',
      dateNaissance: new Date('2010-08-15'),
      poids: 63.9, grade: 'O', tailleCeinture: '4',
      sectionCode: 'KARATE_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-01-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Saadi', prenom: 'Mehdi',
      email: 'test.saadi.mehdi@cshp-test.com',
      telephone: '514-TEST-019',
      dateNaissance: new Date('2012-06-10'),
      poids: 52.0, grade: 'J', tailleCeinture: '3',
      sectionCode: 'JUDO_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Saadi', prenom: 'Leila',
      email: 'test.saadi.leila@cshp-test.com',
      telephone: '514-TEST-020',
      dateNaissance: new Date('2015-02-22'),
      poids: 38.5, grade: 'B', tailleCeinture: '2',
      sectionCode: 'JUDO_GR1',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 711, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Boudaoud', prenom: 'Yanis',
      email: 'test.boudaoud.yanis@cshp-test.com',
      telephone: '514-TEST-021',
      dateNaissance: new Date('2010-11-17'),
      poids: 68.2, grade: 'V', tailleCeinture: '4',
      sectionCode: 'JUDO_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-03-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Touami', prenom: 'Ines',
      email: 'test.touami.ines@cshp-test.com',
      telephone: '514-TEST-022',
      dateNaissance: new Date('2013-08-09'),
      poids: 44.1, grade: 'B-J', tailleCeinture: '2',
      sectionCode: 'JUDO_GR2',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Touami', prenom: 'Riad',
      email: 'test.touami.riad@cshp-test.com',
      telephone: '514-TEST-023',
      dateNaissance: new Date('2016-04-30'),
      poids: 31.7, grade: 'B', tailleCeinture: '1',
      sectionCode: 'JUDO_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: true,
      prixBase: 250, montantFinal: 225,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 225, datePrevue: new Date('2026-02-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Kaced', prenom: 'Sofiane',
      email: 'test.kaced.sofiane@cshp-test.com',
      telephone: '514-TEST-024',
      dateNaissance: new Date('2011-09-05'),
      poids: 59.8, grade: 'V', tailleCeinture: '3',
      sectionCode: 'JUDO_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-10-01'),
      finContrat: new Date('2026-10-01'),
      versements: [
        { numero: 1, montant: 263.33, datePrevue: new Date('2025-10-01'), datePaiement: new Date('2025-10-01'), methode: 'CASH' },
        { numero: 2, montant: 263.33, datePrevue: new Date('2026-01-01'), datePaiement: new Date('2026-01-08'), methode: 'CASH' },
        { numero: 3, montant: 263.34, datePrevue: new Date('2026-07-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Brahimi', prenom: 'Nadia',
      email: 'test.brahimi.nadia@cshp-test.com',
      telephone: '514-TEST-025',
      dateNaissance: new Date('2014-07-14'),
      poids: 42.3, grade: 'J', tailleCeinture: '3',
      sectionCode: 'JUDO_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-05'), methode: 'VIREMENT' }
      ]
    },
    {
      nom: 'Brahimi', prenom: 'Karim',
      email: 'test.brahimi.karim@cshp-test.com',
      telephone: '514-TEST-026',
      dateNaissance: new Date('2017-12-01'),
      poids: 27.4, grade: 'B', tailleCeinture: '1',
      sectionCode: 'JUDO_GR1',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 711, datePrevue: new Date('2025-09-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Mekki', prenom: 'Anis',
      email: 'test.mekki.anis@cshp-test.com',
      telephone: '514-TEST-027',
      dateNaissance: new Date('2009-03-19'),
      poids: 74.5, grade: 'O', tailleCeinture: '5',
      sectionCode: 'JUDO_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Belkacem', prenom: 'Yasmine',
      email: 'test.belkacem.yasmine@cshp-test.com',
      telephone: '514-TEST-028',
      dateNaissance: new Date('2013-05-27'),
      poids: 46.0, grade: 'B-J', tailleCeinture: '2',
      sectionCode: 'JUDO_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-01-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Zerrouki', prenom: 'Fares',
      email: 'test.zerrouki.fares@cshp-test.com',
      telephone: '514-TEST-029',
      dateNaissance: new Date('2015-10-08'),
      poids: 35.9, grade: 'B', tailleCeinture: '2',
      sectionCode: 'JUDO_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-03-01'),
      finContrat: new Date('2026-06-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-03-01'), datePaiement: new Date('2026-03-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Amrouche', prenom: 'Hana',
      email: 'test.amrouche.hana@cshp-test.com',
      telephone: '514-TEST-030',
      dateNaissance: new Date('2012-03-16'),
      poids: 49.2, grade: 'J', tailleCeinture: '3',
      sectionCode: 'JUDO_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2026-01-01'),
      finContrat: new Date('2027-01-01'),
      versements: [
        { numero: 1, montant: 263.33, datePrevue: new Date('2026-01-01'), datePaiement: new Date('2026-01-04'), methode: 'CASH' },
        { numero: 2, montant: 263.33, datePrevue: new Date('2026-05-01'), datePaiement: null, methode: null },
        { numero: 3, montant: 263.34, datePrevue: new Date('2026-09-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Guendouz', prenom: 'Sami',
      email: 'test.guendouz.sami@cshp-test.com',
      telephone: '514-TEST-031',
      dateNaissance: new Date('2011-01-25'),
      poids: 57.3, grade: 'V', tailleCeinture: '4',
      sectionCode: 'JUDO_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'VIREMENT' }
      ]
    },
    {
      nom: 'Idir', prenom: 'Malak',
      email: 'test.idir.malak@cshp-test.com',
      telephone: '514-TEST-032',
      dateNaissance: new Date('2016-08-12'),
      poids: 29.8, grade: 'B', tailleCeinture: '1',
      sectionCode: 'JUDO_GR1',
      plan: 'MENSUEL', rabaisFamille: false,
      prixBase: 75, montantFinal: 75,
      dateInscription: new Date('2026-05-01'),
      finContrat: new Date('2026-06-01'),
      versements: [
        { numero: 1, montant: 75, datePrevue: new Date('2026-05-01'), datePaiement: new Date('2026-05-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Hammouche', prenom: 'Ryad',
      email: 'test.hammouche.ryad@cshp-test.com',
      telephone: '514-TEST-033',
      dateNaissance: new Date('2010-06-03'),
      poids: 65.1, grade: 'V', tailleCeinture: '4',
      sectionCode: 'JUDO_GR3',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 395, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' },
        { numero: 2, montant: 395, datePrevue: new Date('2026-01-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Daho', prenom: 'Naïla',
      email: 'test.daho.naila@cshp-test.com',
      telephone: '514-TEST-034',
      dateNaissance: new Date('2014-11-20'),
      poids: 41.7, grade: 'J', tailleCeinture: '3',
      sectionCode: 'JUDO_GR2',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-11-01'),
      finContrat: new Date('2026-11-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-11-01'), datePaiement: new Date('2025-11-01'), methode: 'VIREMENT' }
      ]
    },
    {
      nom: 'Larbi', prenom: 'Walid',
      email: 'test.larbi.walid@cshp-test.com',
      telephone: '514-TEST-035',
      dateNaissance: new Date('2013-02-08'),
      poids: 48.6, grade: 'B-J', tailleCeinture: '2',
      sectionCode: 'JUDO_GR2',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-05-01'),
      finContrat: new Date('2026-08-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-05-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Rezki', prenom: 'Sara',
      email: 'test.rezki.sara@cshp-test.com',
      telephone: '514-TEST-036',
      dateNaissance: new Date('2019-07-14'),
      poids: 20.1, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Rezki', prenom: 'Amir',
      email: 'test.rezki.amir@cshp-test.com',
      telephone: '514-TEST-037',
      dateNaissance: new Date('2020-03-22'),
      poids: 18.4, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: true,
      prixBase: 250, montantFinal: 225,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 225, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Slimani', prenom: 'Lina',
      email: 'test.slimani.lina@cshp-test.com',
      telephone: '514-TEST-038',
      dateNaissance: new Date('2019-11-09'),
      poids: 21.0, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-09-01'),
      finContrat: new Date('2026-09-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-09-01'), datePaiement: new Date('2025-09-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Slimani', prenom: 'Ryad',
      email: 'test.slimani.ryad@cshp-test.com',
      telephone: '514-TEST-039',
      dateNaissance: new Date('2021-01-15'),
      poids: 17.2, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'ANNUEL', rabaisFamille: true,
      prixBase: 790, montantFinal: 711,
      dateInscription: new Date('2026-03-01'),
      finContrat: new Date('2027-03-01'),
      versements: [
        { numero: 1, montant: 711, datePrevue: new Date('2026-03-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Bouazza', prenom: 'Yasmine',
      email: 'test.bouazza.yasmine@cshp-test.com',
      telephone: '514-TEST-040',
      dateNaissance: new Date('2020-06-30'),
      poids: 19.3, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-02-01'), datePaiement: new Date('2026-02-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Djebbar', prenom: 'Ilian',
      email: 'test.djebbar.ilian@cshp-test.com',
      telephone: '514-TEST-041',
      dateNaissance: new Date('2019-04-18'),
      poids: 22.8, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-02-01'),
      finContrat: new Date('2026-05-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-02-01'), datePaiement: null, methode: null }
      ]
    },
    {
      nom: 'Hamici', prenom: 'Nour',
      email: 'test.hamici.nour@cshp-test.com',
      telephone: '514-TEST-042',
      dateNaissance: new Date('2020-09-05'),
      poids: 16.9, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'MENSUEL', rabaisFamille: false,
      prixBase: 70, montantFinal: 70,
      dateInscription: new Date('2026-05-01'),
      finContrat: new Date('2026-06-01'),
      versements: [
        { numero: 1, montant: 70, datePrevue: new Date('2026-05-01'), datePaiement: new Date('2026-05-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Ziani', prenom: 'Adem',
      email: 'test.ziani.adem@cshp-test.com',
      telephone: '514-TEST-043',
      dateNaissance: new Date('2019-02-27'),
      poids: 23.5, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: false,
      prixBase: 250, montantFinal: 250,
      dateInscription: new Date('2026-03-01'),
      finContrat: new Date('2026-06-01'),
      versements: [
        { numero: 1, montant: 250, datePrevue: new Date('2026-03-01'), datePaiement: new Date('2026-03-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Achour', prenom: 'Rania',
      email: 'test.achour.rania@cshp-test.com',
      telephone: '514-TEST-044',
      dateNaissance: new Date('2020-08-11'),
      poids: 17.8, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'ANNUEL', rabaisFamille: false,
      prixBase: 790, montantFinal: 790,
      dateInscription: new Date('2025-10-01'),
      finContrat: new Date('2026-10-01'),
      versements: [
        { numero: 1, montant: 790, datePrevue: new Date('2025-10-01'), datePaiement: new Date('2025-10-01'), methode: 'CASH' }
      ]
    },
    {
      nom: 'Benaouda', prenom: 'Tayeb',
      email: 'test.benaouda.tayeb@cshp-test.com',
      telephone: '514-TEST-045',
      dateNaissance: new Date('2019-12-03'),
      poids: 20.6, grade: 'B', tailleCeinture: '0',
      sectionCode: 'NINJAS_GR1',
      plan: 'TRIMESTRIEL', rabaisFamille: true,
      prixBase: 250, montantFinal: 225,
      dateInscription: new Date('2026-05-01'),
      finContrat: new Date('2026-08-01'),
      versements: [
        { numero: 1, montant: 225, datePrevue: new Date('2026-06-01'), datePaiement: null, methode: null }
      ]
    }
  ];

  for (const m of membres) {
    const member = await prisma.member.create({
      data: {
        lastName: m.nom,
        firstName: m.prenom,
        email: m.email,
        phone: m.telephone,
        dateOfBirth: m.dateNaissance,
        poids: m.poids,
        currentBelt: m.grade,
        groupe: m.sectionCode,
        plan: m.plan as Plan,
        rabaisFamille: m.rabaisFamille,
        prixBase: m.prixBase,
        montantFinal: m.montantFinal,
        dateInscription: m.dateInscription,
        finContrat: m.finContrat,
        status: 'ACTIF',
        sections: {
          create: [
            { section: m.sectionCode, belt: m.grade || "Blanche" }
          ]
        },
        versements: {
          create: m.versements.map((v) => ({
            numeroVersement: v.numero,
            montant: v.montant,
            datePrevue: v.datePrevue,
            datePaiement: v.datePaiement ?? null,
            methodePaiement: (v.methode as MethodePaiement) ?? null,
          }))
        }
      }
    });

    console.log(`👤 Membre créé: ${member.firstName} ${member.lastName} (${member.email})`);
  }

  console.log('✅ 45 membres créés avec leurs versements');
  console.log('');
  console.log('📊 TOTAUX RECHERCHÉS POUR VALIDATION :');
  console.log('   Série de tests de validation insérée avec succès !');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
