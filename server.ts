import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';

// Routers
import authRouter from './src/routes/auth';
import membersRouter from './src/routes/members';
import subscriptionsRouter from './src/routes/subscriptions';
import paymentsRouter from './src/routes/payments';
import coursesRouter from './src/routes/courses';
import attendancesRouter from './src/routes/attendances';
import dashboardRouter from './src/routes/dashboard';
import gradesRouter from './src/routes/grades';
import coachsRouter from './src/routes/coachs';
import rapportsRouter from './src/routes/rapports';
import planningRouter from './src/routes/planning';
import versementsRouter from './src/routes/versements';
import sectionsRouter from './src/routes/sections';
import masseSalarialeRouter from './src/routes/masseSalariale';
import coachSalaireRouter from './src/routes/coachSalaire';
import depensesRouter from './src/routes/depenses';
import depenseConfigsRouter from './src/routes/depenseConfigs';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Main API Endpoints 
app.use('/api/auth', authRouter);
app.use('/api/membres', membersRouter);
app.use('/api/abonnements', subscriptionsRouter);
app.use('/api/paiements', paymentsRouter);
app.use('/api/cours', coursesRouter);
app.use('/api/presences', attendancesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/coachs', coachsRouter);
app.use('/api/rapports', rapportsRouter);
app.use('/api/planning', planningRouter);
app.use('/api/versements', versementsRouter);
app.use('/api/sections', sectionsRouter);
app.use('/api/masse-salariale', masseSalarialeRouter);
app.use('/api/coach-salaire', coachSalaireRouter);
app.use('/api/depenses', depensesRouter);
app.use('/api/depense-configs', depenseConfigsRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CSHP API is running!' });
});

import { prisma } from './src/lib/prisma';
app.get('/api/debug-coaches', async (req, res) => {
  try {
    const coaches = await prisma.coachSalaire.findMany();
    res.json(coaches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reset-db', async (req, res) => {
  try {
    // 1. Delete PaymentVersement
    const deletedPaymentVersements = await prisma.paymentVersement.deleteMany();
    
    // 2. Delete Grade
    const deletedGrades = await prisma.grade.deleteMany();
    
    // 3. Delete MemberSection
    const deletedMemberSections = await prisma.memberSection.deleteMany();
    
    // 4. Delete Payment
    const deletedPayments = await prisma.payment.deleteMany();
    
    // 5. Delete Subscription
    const deletedSubscriptions = await prisma.subscription.deleteMany();
    
    // 6. Delete Attendance
    const deletedAttendances = await prisma.attendance.deleteMany();
    
    // 7. Delete Member
    const deletedMembers = await prisma.member.deleteMany();

    res.json({
      success: true,
      message: 'Base de données réinitialisée avec succès.',
      deleted: {
        PaymentVersement: deletedPaymentVersements.count,
        Grade: deletedGrades.count,
        MemberSection: deletedMemberSections.count,
         Payment: deletedPayments.count,
        Subscription: deletedSubscriptions.count,
        Attendance: deletedAttendances.count,
        Member: deletedMembers.count
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

import { sendEmail } from './src/lib/mailer';
app.get('/api/email-test', async (req, res) => {
  try {
    await sendEmail({
      to: 'centrehp@outlook.com',
      subject: 'Test CSHP — Courriel de rappel',
      html: `
        <h2>✅ Test réussi</h2>
        <p>Le système d'envoi de courriels CSHP fonctionne correctement.</p>
        <p>Expéditeur : payements@centresportifhp.com</p>
      `,
    });
    res.json({ success: true, message: 'Courriel envoyé ✅' });
  } catch (error) {
    res.status(500).json({ success: false, error: String(error) });
  }
});

app.get('/api/test-email', async (req, res) => {
  try {
    await sendEmail({
      to: 'payements@centresportifhp.com',
      subject: 'Test SMTP CSHP ✅',
      html: '<p>Le système de courriel fonctionne correctement.</p>',
    });
    res.json({ success: true, message: 'Courriel envoyé ✅' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/cron/reminders', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const aujourd_hui = new Date();
    const dans7Jours = new Date();
    dans7Jours.setDate(aujourd_hui.getDate() + 7);

    // Arrondir à la journée (minuit)
    dans7Jours.setHours(0, 0, 0, 0);
    const dans7JoursFin = new Date(dans7Jours);
    dans7JoursFin.setHours(23, 59, 59, 999);

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

      await prisma.payment.update({
        where: { id: paiement.id },
        data: { reminderSentAt: new Date() },
      });

      resultats.push({ membreId: membre.id, nom: nomComplet, statut: 'ENVOYÉ ✅' });
    }

    res.json({
      success: true,
      traités: resultats.length,
      détails: resultats,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// For Vite and front-end integration (standard setup)
import { createServer as createViteServer } from 'vite';

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);

    // Run database migrations in the background so they don't block port-binding/health checks
    if (process.env.DATABASE_URL) {
      console.log('⏳ Running database migrations in the background...');
      exec('npx prisma migrate deploy', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Migration error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.warn(`⚠️ Migration stderr: ${stderr}`);
        }
        console.log(`✅ Migrations completed successfully:\n${stdout}`);
      });
    }
  });
}

startServer();
