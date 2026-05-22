import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

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
  });
}

startServer();
