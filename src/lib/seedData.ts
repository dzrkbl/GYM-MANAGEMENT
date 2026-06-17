import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Données initiales du club (idempotent : sûr à ré-exécuter).
export async function seedInitialData(prisma: PrismaClient): Promise<void> {
  // 1. Compte admin (mot de passe configurable via env pour la production).
  const adminEmail = process.env.ADMIN_EMAIL || 'ilyes@cshp.ca';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin2026!';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', firstName: 'Ilyes', lastName: 'Abdoun', actif: true },
    });
    console.log(`Compte admin créé : ${adminEmail}`);
  }

  // 2. Sections (upsert).
  const sectionsData = [
    { code: 'KARATE_GR1', label: 'Karaté Gr. 1', sport: 'KARATE', ordre: 1 },
    { code: 'KARATE_GR2', label: 'Karaté Gr. 2', sport: 'KARATE', ordre: 2 },
    { code: 'KARATE_GR3', label: 'Karaté Gr. 3', sport: 'KARATE', ordre: 3 },
    { code: 'JUDO_GR1', label: 'Judo Gr. 1', sport: 'JUDO', ordre: 4 },
    { code: 'JUDO_GR2', label: 'Judo Gr. 2', sport: 'JUDO', ordre: 5 },
    { code: 'JUDO_GR3', label: 'Judo Gr. 3', sport: 'JUDO', ordre: 6 },
    { code: 'NINJAS_GR1', label: 'Ninjas Gr. 1', sport: 'NINJAS', ordre: 7 },
    { code: 'NINJAS_GR2', label: 'Ninjas Gr. 2', sport: 'NINJAS', ordre: 8 },
    { code: 'NINJAS_GR3', label: 'Ninjas Gr. 3', sport: 'NINJAS', ordre: 9 },
  ];
  for (const s of sectionsData) {
    await prisma.section.upsert({ where: { code: s.code }, update: { label: s.label, sport: s.sport, ordre: s.ordre }, create: s });
  }

  // 3. Cours récurrents de base (seulement si aucun cours — ne pas écraser les ajustements).
  if ((await prisma.course.count()) === 0) {
    const recurrentCourses = [
      { section: 'KARATE_GR1', jours: ['MAR', 'JEU'], startTime: '17:00', endTime: '18:00' },
      { section: 'KARATE_GR2', jours: ['MAR', 'JEU'], startTime: '18:00', endTime: '19:00' },
      { section: 'KARATE_GR3', jours: ['MAR', 'JEU'], startTime: '19:00', endTime: '20:00' },
      { section: 'JUDO_GR1', jours: ['LUN', 'VEN'], startTime: '17:00', endTime: '18:00' },
      { section: 'JUDO_GR2', jours: ['LUN', 'VEN'], startTime: '18:00', endTime: '19:00' },
      { section: 'JUDO_GR3', jours: ['LUN', 'VEN'], startTime: '19:00', endTime: '19:30' },
      { section: 'NINJAS_GR1', jours: ['MER'], startTime: '17:00', endTime: '18:00' },
      { section: 'NINJAS_GR1', jours: ['SAM'], startTime: '09:00', endTime: '10:00' },
      { section: 'NINJAS_GR2', jours: ['MER'], startTime: '18:00', endTime: '19:00' },
      { section: 'NINJAS_GR2', jours: ['SAM'], startTime: '10:00', endTime: '11:00' },
      { section: 'NINJAS_GR3', jours: ['MER'], startTime: '19:00', endTime: '20:00' },
      { section: 'NINJAS_GR3', jours: ['SAM'], startTime: '11:00', endTime: '12:00' },
    ];
    for (const c of recurrentCourses) {
      await prisma.course.create({ data: { section: c.section, jours: c.jours, startTime: c.startTime, endTime: c.endTime, actif: true } });
    }
  }

  // 4. Config du loyer (hausse auto 2 %/an).
  await prisma.depenseConfig.upsert({
    where: { code: 'LOYER' },
    update: {},
    create: { code: 'LOYER', label: 'Loyer (taxes incluses)', montantBase: 5589, anneeBase: 2024, tauxHaussePct: 2 },
  });

  // 5. Charges fixes (créées si absentes).
  const anneeRef = 2026;
  const chargesFixes = [
    { label: 'Location automobile', montant: 608, categorie: 'FIXE' },
    { label: 'Cellulaires', montant: 254, categorie: 'FIXE' },
    { label: 'Assurance auto', montant: 160, categorie: 'FIXE' },
    { label: 'Assurance gym', montant: 222, categorie: 'FIXE' },
    { label: 'Hydro-Québec', montant: 250, categorie: 'VARIABLE' },
  ];
  for (const charge of chargesFixes) {
    const existe = await prisma.depense.findFirst({ where: { label: charge.label, annee: anneeRef, mois: null } });
    if (!existe) {
      await prisma.depense.create({ data: { label: charge.label, montant: charge.montant, mois: null, annee: anneeRef, categorie: charge.categorie as any } });
    }
  }
}

// Amorçage automatique au démarrage : ne seed QUE si la base est vide (aucun utilisateur).
// Sûr et idempotent — ne touche jamais à des données existantes.
export async function bootstrapIfEmpty(prisma: PrismaClient): Promise<boolean> {
  const userCount = await prisma.user.count();
  if (userCount > 0) return false;
  await seedInitialData(prisma);
  return true;
}
