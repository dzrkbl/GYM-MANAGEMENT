import { prisma } from '../../../../lib/prisma';
import { sendEmail } from '../../../../lib/mailer';

export async function GET(request: Request) {
  // Sécurité : vérifier le token cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const aujourd_hui = new Date();
  const dans7Jours = new Date();
  dans7Jours.setDate(aujourd_hui.getDate() + 7);

  // Arrondir à la journée (minuit)
  dans7Jours.setHours(0, 0, 0, 0);
  const dans7JoursFin = new Date(dans7Jours);
  dans7JoursFin.setHours(23, 59, 59, 999);

  // Trouver tous les paiements dus dans 7 jours, non payés, sans rappel envoyé
  const paiements = await prisma.payment.findMany({
    where: {
      dueDate: {
        gte: dans7Jours,
        lte: dans7JoursFin,
      },
      status: 'PENDING',
      reminderSentAt: null,
    },
    include: {
      member: true,
    },
  });

  const resultats = [];

  for (const paiement of paiements) {
    const membre = paiement.member;
    const destinataire = membre.parentEmail || membre.email;

    if (!destinataire) {
      resultats.push({ membreId: membre.id, statut: 'IGNORÉ — pas de courriel' });
      continue;
    }

    const nomComplet = `${membre.firstName} ${membre.lastName}`;
    const montant = paiement.amount.toFixed(2);
    const dateEcheance = paiement.dueDate.toLocaleDateString('fr-CA');

    await sendEmail({
      to: destinataire,
      subject: `Rappel de paiement — CSHP`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a2e;">Centre Sportif de Haute-Performance</h2>
          <p>Bonjour,</p>
          <p>Ceci est un rappel amical concernant le paiement pour <strong>${nomComplet}</strong>.</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Montant dû :</strong> ${montant} $</p>
            <p><strong>Date d'échéance :</strong> ${dateEcheance}</p>
          </div>
          <p>Pour tout question, contactez-nous à payements@centresportifhp.com</p>
          <p>Merci,<br><strong>L'équipe CSHP</strong></p>
        </div>
      `,
    });

    // Marquer le rappel comme envoyé
    await prisma.payment.update({
      where: { id: paiement.id },
      data: { reminderSentAt: new Date() },
    });

    resultats.push({ membreId: membre.id, nom: nomComplet, statut: 'ENVOYÉ ✅' });
  }

  return Response.json({
    success: true,
    traités: resultats.length,
    détails: resultats,
  });
}
