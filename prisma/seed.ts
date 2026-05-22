import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Début du seed...');

  // 1. Compte admin
  const adminEmail = 'ilyes@cshp.ca';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin2026!', 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        firstName: 'Ilyes',
        lastName: 'Abdoun',
        actif: true
      }
    });
    console.log('Compte admin créé : ilyes@cshp.ca');
  } else {
    console.log('Le compte admin existe déjà.');
  }

  // 2. Cours récurrents de base (Karaté, Judo, Ninjas)
  // Supprimer les anciens cours récurrents d'abord
  await prisma.course.deleteMany();
  console.log('Anciens cours récurrents supprimés de la base.');

  const recurrentCourses = [
    // Karaté Gr. 1 — Mardi et Jeudi
    { section: 'KARATE_GR1', jours: ['MAR', 'JEU'], startTime: '17:00', endTime: '18:00' },
    // Karaté Gr. 2 — Mardi et Jeudi
    { section: 'KARATE_GR2', jours: ['MAR', 'JEU'], startTime: '18:00', endTime: '19:00' },
    // Karaté Gr. 3 — Mardi et Jeudi
    { section: 'KARATE_GR3', jours: ['MAR', 'JEU'], startTime: '19:00', endTime: '20:00' },
    // Judo Gr. 1 — Lundi et Vendredi
    { section: 'JUDO_GR1', jours: ['LUN', 'VEN'], startTime: '17:00', endTime: '18:00' },
    // Judo Gr. 2 — Lundi et Vendredi
    { section: 'JUDO_GR2', jours: ['LUN', 'VEN'], startTime: '18:00', endTime: '19:00' },
    // Judo Gr. 3 — Lundi et Vendredi
    { section: 'JUDO_GR3', jours: ['LUN', 'VEN'], startTime: '19:00', endTime: '19:30' },
    // Ninjas Gr. 1 — Mercredi et Samedi (horaires différents, donc créneaux séparés)
    { section: 'NINJAS_GR1', jours: ['MER'], startTime: '17:00', endTime: '18:00' },
    { section: 'NINJAS_GR1', jours: ['SAM'], startTime: '09:00', endTime: '10:00' },
    // Ninjas Gr. 2 — Mercredi et Samedi
    { section: 'NINJAS_GR2', jours: ['MER'], startTime: '18:00', endTime: '19:00' },
    { section: 'NINJAS_GR2', jours: ['SAM'], startTime: '10:00', endTime: '11:00' },
    // Ninjas Gr. 3 — Mercredi et Samedi
    { section: 'NINJAS_GR3', jours: ['MER'], startTime: '19:00', endTime: '20:00' },
    { section: 'NINJAS_GR3', jours: ['SAM'], startTime: '11:00', endTime: '12:00' },
  ];

  for (const c of recurrentCourses) {
    await prisma.course.create({
      data: {
        section: c.section,
        jours: c.jours,
        startTime: c.startTime,
        endTime: c.endTime,
        actif: true
      }
    });
    console.log(`Cours récurrent de ${c.section} créé pour les jours [${c.jours.join(', ')}]`);
  }

  // Seeding sections 
  const sectionsData = [
    { code: 'KARATE_GR1', label: 'Karaté Gr. 1', sport: 'KARATE', ordre: 1 },
    { code: 'KARATE_GR2', label: 'Karaté Gr. 2', sport: 'KARATE', ordre: 2 },
    { code: 'KARATE_GR3', label: 'Karaté Gr. 3', sport: 'KARATE', ordre: 3 },
    { code: 'JUDO_GR1',   label: 'Judo Gr. 1',   sport: 'JUDO',   ordre: 4 },
    { code: 'JUDO_GR2',   label: 'Judo Gr. 2',   sport: 'JUDO',   ordre: 5 },
    { code: 'JUDO_GR3',   label: 'Judo Gr. 3',   sport: 'JUDO',   ordre: 6 },
    { code: 'NINJAS_GR1', label: 'Ninjas Gr. 1', sport: 'NINJAS', ordre: 7 },
    { code: 'NINJAS_GR2', label: 'Ninjas Gr. 2', sport: 'NINJAS', ordre: 8 },
    { code: 'NINJAS_GR3', label: 'Ninjas Gr. 3', sport: 'NINJAS', ordre: 9 },
  ];

  for (const s of sectionsData) {
    await prisma.section.upsert({
      where: { code: s.code },
      update: { label: s.label, sport: s.sport, ordre: s.ordre },
      create: s
    });
  }

  console.log('Seed terminé avec succès.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
