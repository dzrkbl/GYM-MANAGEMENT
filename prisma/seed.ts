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

  // 2. Cours récurrents de base (Karaté, Judo, U8)
  const recurrentCourses = [
    // Karaté
    { section: 'KARATE', dayOfWeek: 1, startTime: '17:00', endTime: '20:30' },
    { section: 'KARATE', dayOfWeek: 3, startTime: '17:00', endTime: '20:30' },
    { section: 'KARATE', dayOfWeek: 5, startTime: '17:00', endTime: '20:30' },
    // Judo
    { section: 'JUDO', dayOfWeek: 1, startTime: '17:00', endTime: '20:30' },
    { section: 'JUDO', dayOfWeek: 3, startTime: '17:00', endTime: '20:30' },
    { section: 'JUDO', dayOfWeek: 5, startTime: '17:00', endTime: '20:30' },
    { section: 'JUDO', dayOfWeek: 6, startTime: '09:00', endTime: '11:30' },
    // NINJAS
    { section: 'NINJAS_GR1', dayOfWeek: 6, startTime: '09:00', endTime: '10:30' },
    { section: 'NINJAS_GR2', dayOfWeek: 6, startTime: '09:00', endTime: '10:30' }
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
