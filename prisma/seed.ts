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
  await prisma.course.deleteMany({
    where: {
      date: null
    }
  });
  console.log('Anciens cours récurrents supprimés de la base.');

  const recurrentCourses = [
    // Karaté Gr. 1 — Mardi et Jeudi
    { section: 'KARATE_GR1', dayOfWeek: 2, startTime: '17:00', endTime: '18:00' },
    { section: 'KARATE_GR1', dayOfWeek: 4, startTime: '17:00', endTime: '18:00' },
    // Karaté Gr. 2 — Mardi et Jeudi
    { section: 'KARATE_GR2', dayOfWeek: 2, startTime: '18:00', endTime: '19:00' },
    { section: 'KARATE_GR2', dayOfWeek: 4, startTime: '18:00', endTime: '19:00' },
    // Karaté Gr. 3 — Mardi et Jeudi (horaire à déterminer, créé avec placeholder)
    { section: 'KARATE_GR3', dayOfWeek: 2, startTime: '19:00', endTime: '20:00' },
    { section: 'KARATE_GR3', dayOfWeek: 4, startTime: '19:00', endTime: '20:00' },
    // Judo Gr. 1 — Lundi et Vendredi
    { section: 'JUDO_GR1', dayOfWeek: 1, startTime: '17:00', endTime: '18:00' },
    { section: 'JUDO_GR1', dayOfWeek: 5, startTime: '17:00', endTime: '18:00' },
    // Judo Gr. 2 — Lundi et Vendredi
    { section: 'JUDO_GR2', dayOfWeek: 1, startTime: '18:00', endTime: '19:00' },
    { section: 'JUDO_GR2', dayOfWeek: 5, startTime: '18:00', endTime: '19:00' },
    // Judo Gr. 3 — Lundi et Vendredi
    { section: 'JUDO_GR3', dayOfWeek: 1, startTime: '19:00', endTime: '19:30' },
    { section: 'JUDO_GR3', dayOfWeek: 5, startTime: '19:00', endTime: '19:30' },
    // Ninjas Gr. 1 — Mercredi et Samedi
    { section: 'NINJAS_GR1', dayOfWeek: 3, startTime: '17:00', endTime: '18:00' },
    { section: 'NINJAS_GR1', dayOfWeek: 6, startTime: '09:00', endTime: '10:00' },
    // Ninjas Gr. 2 — Mercredi et Samedi
    { section: 'NINJAS_GR2', dayOfWeek: 3, startTime: '18:00', endTime: '19:00' },
    { section: 'NINJAS_GR2', dayOfWeek: 6, startTime: '10:00', endTime: '11:00' },
    // Ninjas Gr. 3 — Mercredi et Samedi (horaire à déterminer)
    { section: 'NINJAS_GR3', dayOfWeek: 3, startTime: '19:00', endTime: '20:00' },
    { section: 'NINJAS_GR3', dayOfWeek: 6, startTime: '11:00', endTime: '12:00' },
  ];

  for (const c of recurrentCourses) {
    const existing = await prisma.course.findFirst({
      where: {
        section: c.section,
        dayOfWeek: c.dayOfWeek,
        startTime: c.startTime,
        date: null
      }
    });

    if (!existing) {
      await prisma.course.create({
        data: {
          section: c.section,
          dayOfWeek: c.dayOfWeek,
          startTime: c.startTime,
          endTime: c.endTime,
          date: null,
          actif: true
        }
      });
      console.log(`Cours récurrent de ${c.section} créé pour le jour ${c.dayOfWeek}`);
    }
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
