import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';

// Routers
import authRouter from './src/routes/auth';
import membersRouter from './src/routes/members';
import paymentsRouter from './src/routes/payments';
import coursesRouter from './src/routes/courses';
import attendancesRouter from './src/routes/attendances';
import dashboardRouter from './src/routes/dashboard';
import gradesRouter from './src/routes/grades';
import coachsRouter from './src/routes/coachs';
import rapportsRouter from './src/routes/rapports';
import versementsRouter from './src/routes/versements';
import sectionsRouter from './src/routes/sections';
import masseSalarialeRouter from './src/routes/masseSalariale';
import coachSalaireRouter from './src/routes/coachSalaire';
import depensesRouter from './src/routes/depenses';
import depenseConfigsRouter from './src/routes/depenseConfigs';
import importRouter from './src/routes/import';
import inscriptionRouter from './src/routes/inscription';

import { runAllReminders } from './src/lib/reminders';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Main API Endpoints
app.use('/api/auth', authRouter);
app.use('/api/membres', membersRouter);
app.use('/api/paiements', paymentsRouter);
app.use('/api/cours', coursesRouter);
app.use('/api/presences', attendancesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/coachs', coachsRouter);
app.use('/api/rapports', rapportsRouter);
app.use('/api/versements', versementsRouter);
app.use('/api/sections', sectionsRouter);
app.use('/api/masse-salariale', masseSalarialeRouter);
app.use('/api/coach-salaire', coachSalaireRouter);
app.use('/api/depenses', depensesRouter);
app.use('/api/depense-configs', depenseConfigsRouter);
app.use('/api/import', importRouter);
app.use('/api/inscription', inscriptionRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CSHP API is running!' });
});

// Cron : relances automatiques (déclenché par un service externe avec le Bearer CRON_SECRET).
// Couvre : rappels de paiement (J-7, jour J, retard), renouvellements (J-30) et absences.
app.get('/api/cron/reminders', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const resultats = await runAllReminders();
    res.json({ success: true, resultats });
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
