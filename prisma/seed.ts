import { PrismaClient } from '@prisma/client';
import { seedInitialData } from '../src/lib/seedData';

const prisma = new PrismaClient();

seedInitialData(prisma)
  .then(() => console.log('Seed terminé avec succès.'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
