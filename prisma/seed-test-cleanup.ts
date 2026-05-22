import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Suppression de toutes les données de test...');

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

  console.log('✅ Données de test supprimées. DB propre.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
