import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const passwordHash = await bcrypt.hash('motdepasse', 10);

  await prisma.user.upsert({
    where: { email: 'admin@cshp.ca' },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      email: 'admin@cshp.ca',
      passwordHash,
      role: 'ADMIN',
    },
  });
  
  await prisma.user.upsert({
    where: { email: 'manager@cshp.ca' },
    update: { passwordHash, role: 'SECTION_MANAGER', section: 'JUDO' },
    create: {
      email: 'manager@cshp.ca',
      passwordHash,
      role: 'SECTION_MANAGER',
      section: 'JUDO',
    },
  });

  console.log('Seed completed successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
