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

app.get('/api/seed-karate', async (req, res) => {
  try {
    // 1. Get or create Examiner
    let adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } }) || await prisma.user.findFirst();
    if (!adminUser) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('Admin2026!', 10);
      adminUser = await prisma.user.create({
        data: {
          email: 'ilyes@cshp.ca',
          passwordHash,
          role: 'ADMIN',
          firstName: 'Ilyes',
          lastName: 'Abdoun',
          actif: true
        }
      });
    }
    const examinatorId = adminUser.id;

    // Stat tracking objects
    let stats = {
      members: { inserted: 0, skipped: 0, errors: 0 },
      memberSections: { inserted: 0, skipped: 0, errors: 0 },
      grades: { inserted: 0, skipped: 0, errors: 0 },
      payments: { inserted: 0, skipped: 0, errors: 0 }
    };

    const MEMBERS_CSV = `Massil,Abbout,2018-08-20,M,,lynda.younsi3@gmail.com,,438 506-1592,mohammed_abbout_2023@outlook.com,ACTIF,KARATE_GR1,ANNUEL,790.00,false,Axil Abbout,,,790.00,2025-12-14,2026-12-14,Blanche,,,
Axil,Abbout,2018-08-20,M,,lynda.younsi3@gmail.com,,438 938-4232,mohammed_abbout_2023@outlook.com,ACTIF,KARATE_GR1,ANNUEL,790.00,true,Massil Abbout,,,711.00,2025-12-14,2026-12-14,Blanche,,,
Hanaa,Abbout,,F,,lynda.younsi3@gmail.com,,438 506-1592,mohammed_abbout_2023@outlook.com,ACTIF,KARATE_GR1,ANNUEL,790.00,true,Massil Abbout,,,711.00,2025-12-14,2026-12-14,Blanche-Jaune,,,
Haroun,Affes,2016-02-29,M,,,,514 592-8819,ala.affes.ing@gmail.com,ACTIF,KARATE_GR2,TRIMESTRIEL,250.00,false,,,,250.00,2026-03-09,2026-06-09,Verte,,,
Amine,Ahras,2011-06-08,M,,,,514 573-2256,k_djazz@yahoo.fr,ACTIF,KARATE_GR2,ANNUEL,790.00,false,Lyna Ahras,,,790.00,2025-09-01,2026-09-01,Bleue,,,
Lyna,Ahras,2014-09-16,F,,,,514 573-2256,k_djazz@yahoo.fr,ACTIF,KARATE_GR2,ANNUEL,740.00,true,Amine Ahras,10,Ancien tarif annuel — rabais famille 10%,666.00,2025-09-01,2026-09-01,Verte-Bleue,,,
Helena,Ait Alioua,2017-01-17,F,,,,438 935-1708,info.amer@yahoo.fr,ACTIF,KARATE_GR2,TRIMESTRIEL,250.00,true,,,,225.00,2026-04-21,2026-07-21,Blanche,,,
Myriam,Aliane,2015-06-19,F,,,,438 377-1847,melbour24@hotmail.com,ACTIF,KARATE_GR1,ANNUEL,790.00,false,Amine Youcef Aliane,,,790.00,2025-09-18,2026-09-18,Jaune,Famille Aliane: 790+711+711=2212. Tout payé.,,
Amine Youcef,Aliane,2018-08-17,M,,,,438 377-1847,melbour24@hotmail.com,ACTIF,KARATE_GR1,ANNUEL,790.00,true,Myriam Aliane,,,711.00,2025-09-20,2026-09-20,Blanche,,,
Anis Younes,Aliane,2018-08-17,M,,,,438 377-1847,melbour24@hotmail.com,ACTIF,KARATE_GR1,ANNUEL,790.00,true,Myriam Aliane,,,711.00,2025-09-20,2026-09-20,Blanche,,,
Yanni,Ammar,2011-06-29,M,,,,438 931-0219,alli.ammar015@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2025-06-04,2026-06-04,Jaune-Orange,,,
Amayas,Aourtilane,2012-09-09,M,,,,438 223-8864,mirinamayas@gmail.com,ACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,790.00,2025-08-04,2026-08-04,Verte-Bleue,TROP-PERÇU: payé 889$ vs dû 790$,,
Maya,Belkherchi,2013-07-24,F,,,,438 877-6131,anianassim10@gmail.com,INACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2025-05-09,2026-05-09,Jaune-Orange,,,
Mehdi,Belloues,2014-04-13,M,,,,438 936-7084,timerkidoute@yahoo.fr,INACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2025-08-05,2026-08-05,Verte,,,
Amayas,Berkani,2017-04-17,M,,,,438-229-1022,nissa.hanouche@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2026-01-17,2027-01-17,Jaune,,,
Dina-Hanine,Bouchenafa,2012-03-09,F,,nfetayahe@yahoo.ca,,438 995-3107,Bouchenafakamil@gmail.com,ACTIF,KARATE_GR2,ANNUEL,790.00,false,Taha-Manil Bouchenafa,,,790.00,2026-02-03,2027-02-03,Bleue,,,
Taha-Manil,Bouchenafa,2013-12-29,M,,nfetayahe@yahoo.ca,,438 995-3107,bouchenafakamil@gmail.com,ACTIF,KARATE_GR2,ANNUEL,790.00,true,Dina-Hanine Bouchenafa,,,710.00,2026-02-03,2027-02-03,Orange,,,
Mayssa,Bouhara,2014-10-20,F,,,,438 526-3062,mira.ait@yahoo.com,INACTIF,KARATE_GR2,ANNUEL,790.00,false,Anya Bouhara,,,790.00,2025-09-24,2026-09-24,Jaune,TROP-PERÇU: payé 1000$ vs dû 790$,,
Anya,Bouhara,2012-08-24,F,,,,438 526-3062,mira.ait@yahoo.com,INACTIF,KARATE_GR2,ANNUEL,790.00,true,Mayssa Bouhara,,,711.00,2025-09-24,2026-09-24,Jaune,,,
Yasmine,Bouibaoune,2011-01-01,F,,yasminebbne@gmail.com,,514 971-3422,charmanteaya@hotmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-07-14,2026-07-14,Jaune-Orange,,,
Kanko,Camara,2013-10-23,F,,,,438 227-8745,nsdiallo92@gmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,true,Hadja Foulematou Camara,6.71,Forfait famille 3 enfants,737.00,2026-03-12,2027-03-12,Blanche,3 enfants: 2 karaté + 1 U8 = 737$ x 3 = 2211$,,
Hadja Foulematou,Camara,2017-03-22,F,,,,439 227-8745,nsdiallo92@gmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,false,Kanko Camara,6.71,Forfait famille 3 enfants,737.00,2026-03-12,2027-03-12,Blanche,,,
Mayline,Chergui,2018-01-04,F,,,,438 365-5788,miliana.boukou@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2026-04-08,2027-04-08,Blanche,,,
Rosa-Lya Maeli,Delienne,2015-06-07,F,,,,438-523-9442,yannickpawluck@gmail.com,EN_ATTENTE,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2025-05-08,2026-05-08,Blanche-Jaune,,,
Ilyan,Didani,2018-07-16,M,,,,514-781-9337,samira.benkhelfallah@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,Manil Didani,,,790.00,2025-10-16,2026-10-16,Blanche,,,
Manil,Didani,2016-03-01,M,,,,514-781-9337,samira.benkhelfallah@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,Ilyan Didani,,,711.00,2025-10-16,2026-10-16,Blanche,TROP-PERÇU: payé 790$ vs dû 711$ — surpaiement de 79$,,
Lyna,Djaballah,2015-01-10,F,,,,514 376-7703,djaballah.mourad@uqam.ca,ACTIF,KARATE_GR2,TRIMESTRIEL,250.00,false,,,,250.00,2026-01-08,2026-04-08,Verte,TROP-PERÇU: payé 490$ vs dû 250$,,
Aylan,Djaout,2018-03-30,M,,,,514 661-0600,hanouche_lynda@yahoo.fr,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,Yasten Djaout,,,790.00,2026-01-27,2027-01-27,Jaune,,,
Yasten,Djaout,2017-03-09,M,,,,514 381-8434,hanouche_lynda@yahoo.fr,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,true,Aylan Djaout,,,711.00,2026-01-27,2027-01-27,Jaune,,,
Mirass,Douihech,2016-05-28,M,,,,514 497-1214,achrafou_dw16@yahoo.ca,INACTIF,KARATE_GR1,ANNUEL,790.00,false,Hamza Douihech,,,790.00,2025-08-27,2026-08-27,Verte,,,
Hamza,Douihech,2018-02-09,M,,,,514 497-1214,achrafou_dw16@yahoo.ca,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,true,Mirass Douihech,,,711.00,2025-08-27,2026-08-27,Blanche-Jaune,,,
Isra,Dridi,2011-02-01,F,,,,438 401-8260,latif.dridi@yahoo.ca,INACTIF,KARATE_GR2,ANNUEL,790.00,false,Asma Dridi,6.33,Ancien tarif annuel,740.00,2025-10-23,2026-10-23,Orange-Verte,,,
Asma,Dridi,2013-09-28,F,,zaouisana@yahoo.ca,,438 401-8260,latif.dridi@yahoo.ca,INACTIF,KARATE_GR2,ANNUEL,790.00,false,Isra Dridi,,,666.00,2026-04-08,2027-04-08,Verte,,,
Hicham,Drif,2017-10-05,M,,,,514 295-7707,alg.cana@gmx.fr,INACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,790.00,2025-09-06,2026-09-06,Orange-Verte,,,
Mia,El Kabriti,2018-06-20,F,,,,514 893-4246,reda.elkabriti@outlook.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-09-10,2026-09-10,Blanche,,,
Saad,El Maghraoui,2018-09-09,M,,,,514 294-0701,m.anass1400@yahoo.ca,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-08-31,2026-08-31,Blanche,,,
Qusay,El Ouzeri,2019-09-26,M,,,,514 625-3409,elouzeri.mohamed@gmail.com,ACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-11-01,2026-11-01,Blanche,,,
Cylia,Ferhat,2012-07-16,F,,yanferfr@yahoo.fr,,514 255-2771,sgemeaux2001@yahoo.fr,ACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2025-12-19,2026-12-19,Bleue,,,
Adam,Ferradji,2016-05-04,M,,,,438 349 8564,mehdiferradji@yahoo.ca,EN_ATTENTE,KARATE_GR1,TRIMESTRIEL,250.00,false,,,,240.00,2026-03-03,2026-06-03,Blanche,,,
Dalia,Gallouze,2016-07-19,F,,,,438-387-4363,gallouze.abdenour@yahoo.fr,INACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2025-11-09,2026-11-09,Jaune,,,
Adam,Gzooni,2017-05-31,M,,,,513 402-4682,labbenwalaa@hotmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-09-09,2026-09-09,Blanche,,,
Marc-Lorens,Jean,2013-06-27,M,,,,514 478-2002,geffrardjean@yahoo.ca,ACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2026-05-07,2027-05-07,Blanche,,,
Saya,Kalboussi,2018-12-30,F,,,,514 804-9402,lassaad.kalboussi@yahoo.ca,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2025-09-02,2026-09-02,Blanche,TROP-PERÇU: payé 750$ vs dû 740$,,
Darys,Kedadouche,2017-12-24,F,,riadkedadouche@gmail.com,,514 701-2290,samiha.benhaddad.cemtl@ssss.gouv.qc.ca,INACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,740.00,2025-09-01,2026-09-01,Jaune,,,
Yani,Kerkar,2015-08-02,M,,boualemkerkar@yahoo.com,,514 774-1968,kahina80@outlook.com,ACTIF,KARATE_GR2,ANNUEL,790.00,false,Maksen Kerkar,,,790.00,2026-02-07,2027-02-07,Verte-Bleue,,,
Maksen,Kerkar,2017-05-22,M,,boualemkerkar@yahoo.com,,514 774-1968,kahina80@outlook.com,INACTIF,KARATE_GR1,ANNUEL,790.00,true,Yani Kerkar,,,711.00,2026-02-07,2027-02-07,Jaune,,,
Dania,Khodja,2017-11-05,F,,,,438 455-3300,khodja_omar@hotmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-09-03,2026-09-03,Blanche,,,
Anas,Kouidri,2014-05-06,M,,,,514 963-1307,kosmane@yahoo.fr,INACTIF,KARATE_GR2,ANNUEL,790.00,false,Nayla Kouidri,,,740.00,2026-04-14,2027-04-14,Verte,,,
Nayla,Kouidri,2016-03-22,F,,,,515 963-1307,kosmane@yahoo.fr,INACTIF,KARATE_GR1,ANNUEL,790.00,true,Anas Kouidri,,,666.00,2025-09-25,2026-09-25,Jaune,,,
Shahd,Loukil,2013-12-28,F,,,,514 774 5950,dr.ellouzemariam@gmail.com,ACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,790.00,2025-09-09,2026-09-09,Verte-Bleue,,,
Yasser,Meraini,2013-09-02,M,,,,514 255-0618,alimeraini@yahoo.fr,ACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2026-12-12,2027-12-12,Bleue,,,
Sofia,Missaoui,2015-10-01,F,,,,514 746-2929,hatem_missaoui@hotmail.fr,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-08-28,2026-08-28,Jaune-Orange,,,
Mohamed Adem,Moulai Ali,2018-07-17,M,,,,514 351-9590,moulaiali2001@yahoo.fr,ACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2026-01-18,2027-01-18,Blanche,,,
Faris,Msabeh,2015-10-02,M,,,,514 561-1819,musabehaa@yahoo.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,Qusai Msabeh,,,740.00,2025-06-04,2026-06-04,Blanche,,,
Qusai,Msabeh,2015-10-02,M,,,,514 561-1819,musabehaa@yahoo.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,Faris Msabeh,,,666.00,2025-06-04,2026-06-04,Blanche,,,
Alexandre,Nacib,2016-09-27,M,,aitlynda1@gmail.com,,438 763-1978,samirnacib@gmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,false,Alice Nacib,,,740.00,2025-12-12,2026-12-12,Verte,,,
Alice,Nacib,2015-07-21,F,,aitlynda1@gmail.com,,514 894-5560,samirnacib@gmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,true,Alexandre Nacib,,,666.00,2025-12-20,2026-12-20,Verte,,,
Chiraz,Nehal,2010-12-07,F,,,,514 702-1983,kerbouadallel@gmail.com,INACTIF,KARATE_GR2,TRIMESTRIEL,250.00,false,,,,250.00,2026-03-26,2026-06-26,Orange,,,
Jaysen Karl,Pierre Saint,,M,,,,514 358-2663,annethergine@hotmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-10-07,2026-10-07,Blanche,,,
Philippe,Potlog,2017-11-11,M,,,,514-467-3482,apotlog@icloud.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-10-03,2026-10-03,Blanche,,,
Léa,Rachedi,2013-01-29,F,,,,,514 586-3027,fadialgani@gmail.com,ACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2026-02-07,2027-02-07,Bleue,,,
Alice,Rahmani,2017-04-29,F,,,,514 559-2399,haddou.katia@yahoo.com,INACTIF,KARATE_GR1,TRIMESTRIEL,250.00,false,,,,250.00,2026-04-29,2026-07-29,Jaune,RETRAIT 10$ pour prochain paiement 29-04-2026,,
Rafael,Ribeiro,2018-01-12,M,,,,514 688-1460,paolaasencio.e@gmail.com,INACTIF,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-09-28,2026-09-28,Blanche,,,
Robert,Rosca,2019-03-26,M,,,,438 990-1388,sasha.ro@gmail.com,EN_ATTENTE,KARATE_GR1,ANNUEL,790.00,false,,,,790.00,2025-09-15,2026-09-15,Blanche,,,
Youcef,Roubach,2014-07-07,M,,,,438 878-2303,ihadadene06@gmail.com,INACTIF,KARATE_GR1,TRIMESTRIEL,250.00,false,,,,250.00,2026-01-29,2026-04-29,Blanche,,,
Eyas Hsen,Yousfi,2012-06-12,M,,,,514 358-3027,ali.yousfi@yahoo.ca,INACTIF,KARATE_GR2,ANNUEL,790.00,false,,,,740.00,2026-01-21,2027-01-21,Jaune-Orange,,,
Barae,Zouaoua,2014-06-27,F,,,,438 233-2947,zouaouacher@hotmail.fr,INACTIF,KARATE_GR1,ANNUEL,790.00,false,Assil Zouaoua,,,790.00,2025-12-07,2026-12-07,Orange,,,
Assil,Zouaoua,2016-09-09,M,,,,438 233-2947,zouaouacher@hotmail.fr,INACTIF,KARATE_GR1,ANNUEL,790.00,true,Barae Zouaoua,,,711.00,2025-12-07,2026-12-07,Jaune,,,
Ethan Vince Jared,Zerbo,2018-03-05,M,,,,514 757-9612,kanellemzamga@gmail.com,ACTIF,KARATE_GR1,TRIMESTRIEL,250.00,false,,,,250.00,2026-07-09,2026-10-09,Blanche,,,`;

    const SECTIONS_CSV = `Massil Abbout,KARATE,Blanche,2025-12-14
Axil Abbout,KARATE,Blanche,2025-12-14
Hanaa Abbout,KARATE,Blanche-Jaune,2025-12-14
Haroun Affes,KARATE,Verte,2026-03-09
Amine Ahras,KARATE,Bleue,2025-09-01
Lyna Ahras,KARATE,Verte-Bleue,2025-09-01
Helena Ait Alioua,KARATE,Blanche,2026-04-21
Myriam Aliane,KARATE,Jaune,2025-09-18
Amine Youcef Aliane,KARATE,Blanche,2025-09-20
Anis Younes Aliane,KARATE,Blanche,2025-09-20
Yanni Ammar,KARATE,Jaune-Orange,2025-06-04
Amayas Aourtilane,KARATE,Verte-Bleue,2025-08-04
Maya Belkherchi,KARATE,Jaune-Orange,2025-05-09
Mehdi Belloues,KARATE,Verte,2025-08-05
Amayas Berkani,KARATE,Jaune,2026-01-17
Dina-Hanine Bouchenafa,KARATE,Bleue,2026-02-03
Taha-Manil Bouchenafa,KARATE,Orange,2026-02-03
Mayssa Bouhara,KARATE,Jaune,2025-09-24
Anya Bouhara,KARATE,Jaune,2025-09-24
Yasmine Bouibaoune,KARATE,Jaune-Orange,2025-07-14
Kanko Camara,KARATE,Blanche,2026-03-12
Hadja Foulematou Camara,KARATE,Blanche,2026-03-12
Mayline Chergui,KARATE,Blanche,2026-04-08
Rosa-Lya Maeli Delienne,KARATE,Blanche-Jaune,2025-05-08
Ilyan Didani,KARATE,Blanche,2025-10-16
Manil Didani,KARATE,Blanche,2025-10-16
Lyna Djaballah,KARATE,Verte,2026-01-08
Aylan Djaout,KARATE,Jaune,2026-01-27
Yasten Djaout,KARATE,Jaune,2026-01-27
Mirass Douihech,KARATE,Verte,2025-08-27
Hamza Douihech,KARATE,Blanche-Jaune,2025-08-27
Isra Dridi,KARATE,Orange-Verte,2025-10-23
Asma Dridi,KARATE,Verte,2026-04-08
Hicham Drif,KARATE,Orange-Verte,2025-09-06
Mia El Kabriti,KARATE,Blanche,2025-09-10
Saad El Maghraoui,KARATE,Blanche,2025-08-31
Qusay El Ouzeri,KARATE,Blanche,2025-11-01
Cylia Ferhat,KARATE,Bleue,2025-12-19
Adam Ferradji,KARATE,Blanche,2026-03-03
Dalia Gallouze,KARATE,Jaune,2025-11-09
Adam Gzooni,KARATE,Blanche,2025-09-09
Marc-Lorens Jean,KARATE,Blanche,2026-05-07
Saya Kalboussi,KARATE,Blanche,2025-09-02
Darys Kedadouche,KARATE,Jaune,2025-09-01
Yani Kerkar,KARATE,Verte-Bleue,2026-02-07
Maksen Kerkar,KARATE,Jaune,2026-02-07
Dania Khodja,KARATE,Blanche,2025-09-03
Anas Kouidri,KARATE,Verte,2026-04-14
Nayla Kouidri,KARATE,Jaune,2025-09-25
Shahd Loukil,KARATE,Verte-Bleue,2025-09-09
Yasser Meraini,KARATE,Bleue,2026-12-12
Sofia Missaoui,KARATE,Jaune-Orange,2025-08-28
Mohamed Adem Moulai Ali,KARATE,Blanche,2026-01-18
Faris Msabeh,KARATE,Blanche,2025-06-04
Qusai Msabeh,KARATE,Blanche,2025-06-04
Alexandre Nacib,KARATE,Verte,2025-12-12
Alice Nacib,KARATE,Verte,2025-12-20
Chiraz Nehal,KARATE,Orange,2026-03-26
Jaysen Karl Pierre Saint,KARATE,Blanche,2025-10-07
Philippe Potlog,KARATE,Blanche,2025-10-03
Léa Rachedi,KARATE,Bleue,2026-02-07
Alice Rahmani,KARATE,Jaune,2026-04-29
Rafael Ribeiro,KARATE,Blanche,2025-09-28
Robert Rosca,KARATE,Blanche,2025-09-15
Youcef Roubach,KARATE,Blanche,2026-01-29
Eyas Hsen Yousfi,KARATE,Jaune-Orange,2026-01-21
Barae Zouaoua,KARATE,Orange,2025-12-07
Assil Zouaoua,KARATE,Jaune,2025-12-07
Ethan Vince Jared Zerbo,KARATE,Blanche,2026-07-09`;

    const GRADES_CSV = `Massil Abbout,KARATE,,Blanche,,,Ceinture initiale
Axil Abbout,KARATE,,Blanche,,,Ceinture initiale
Hanaa Abbout,KARATE,,Blanche-Jaune,,,Ceinture initiale
Haroun Affes,KARATE,,Verte,,,Ceinture initiale
Amine Ahras,KARATE,,Bleue,,,Ceinture initiale
Lyna Ahras,KARATE,,Verte-Bleue,,,Ceinture initiale
Helena Ait Alioua,KARATE,,Blanche,,,Ceinture initiale
Myriam Aliane,KARATE,,Jaune,,,Ceinture initiale
Amine Youcef Aliane,KARATE,,Blanche,,,Ceinture initiale
Anis Younes Aliane,KARATE,,Blanche,,,Ceinture initiale
Yanni Ammar,KARATE,,Jaune-Orange,,,Ceinture initiale
Amayas Aourtilane,KARATE,,Verte-Bleue,,,Ceinture initiale
Maya Belkherchi,KARATE,,Jaune-Orange,,,Ceinture initiale
Mehdi Belloues,KARATE,,Verte,,,Ceinture initiale
Amayas Berkani,KARATE,,Jaune,,,Ceinture initiale
Dina-Hanine Bouchenafa,KARATE,,Bleue,,,Ceinture initiale
Taha-Manil Bouchenafa,KARATE,,Orange,,,Ceinture initiale
Mayssa Bouhara,KARATE,,Jaune,,,Ceinture initiale
Anya Bouhara,KARATE,,Jaune,,,Ceinture initiale
Yasmine Bouibaoune,KARATE,,Jaune-Orange,,,Ceinture initiale
Kanko Camara,KARATE,,Blanche,,,Ceinture initiale
Hadja Foulematou Camara,KARATE,,Blanche,,,Ceinture initiale
Mayline Chergui,KARATE,,Blanche,,,Ceinture initiale
Rosa-Lya Maeli Delienne,KARATE,,Blanche-Jaune,,,Ceinture initiale
Ilyan Didani,KARATE,,Blanche,,,Ceinture initiale
Manil Didani,KARATE,,Blanche,,,Ceinture initiale
Lyna Djaballah,KARATE,,Verte,,,Ceinture initiale
Aylan Djaout,KARATE,,Jaune,,,Ceinture initiale
Yasten Djaout,KARATE,,Jaune,,,Ceinture initiale
Mirass Douihech,KARATE,,Verte,,,Ceinture initiale
Hamza Douihech,KARATE,,Blanche-Jaune,,,Ceinture initiale
Isra Dridi,KARATE,,Orange-Verte,,,Ceinture initiale
Asma Dridi,KARATE,,Verte,,,Ceinture initiale
Hicham Drif,KARATE,,Orange-Verte,,,Ceinture initiale
Mia El Kabriti,KARATE,,Blanche,,,Ceinture initiale
Saad El Maghraoui,KARATE,,Blanche,,,Ceinture initiale
Qusay El Ouzeri,KARATE,,Blanche,,,Ceinture initiale
Cylia Ferhat,KARATE,,Bleue,,,Ceinture initiale
Adam Ferradji,KARATE,,Blanche,,,Ceinture initiale
Dalia Gallouze,KARATE,,Jaune,,,Ceinture initiale
Adam Gzooni,KARATE,,Blanche,,,Ceinture initiale
Marc-Lorens Jean,KARATE,,Blanche,,,Ceinture initiale
Saya Kalboussi,KARATE,,Blanche,,,Ceinture initiale
Darys Kedadouche,KARATE,,Jaune,,,Ceinture initiale
Yani Kerkar,KARATE,,Verte-Bleue,,,Ceinture initiale
Maksen Kerkar,KARATE,,Jaune,,,Ceinture initiale
Dania Khodja,KARATE,,Blanche,,,Ceinture initiale
Anas Kouidri,KARATE,,Verte,,,Ceinture initiale
Nayla Kouidri,KARATE,,Jaune,,,Ceinture initiale
Shahd Loukil,KARATE,,Verte-Bleue,,,Ceinture initiale
Yasser Meraini,KARATE,,Bleue,,,Ceinture initiale
Sofia Missaoui,KARATE,,Jaune-Orange,,,Ceinture initiale
Mohamed Adem Moulai Ali,KARATE,,Blanche,,,Ceinture initiale
Faris Msabeh,KARATE,,Blanche,,,Ceinture initiale
Qusai Msabeh,KARATE,,Blanche,,,Ceinture initiale
Alexandre Nacib,KARATE,,Verte,,,Ceinture initiale
Alice Nacib,KARATE,,Verte,,,Ceinture initiale
Chiraz Nehal,KARATE,,Orange,,,Ceinture initiale
Jaysen Karl Pierre Saint,KARATE,,Blanche,,,Ceinture initiale
Philippe Potlog,KARATE,,Blanche,,,Ceinture initiale
Léa Rachedi,KARATE,,Bleue,,,Ceinture initiale
Alice Rahmani,KARATE,,Jaune,,,Ceinture initiale
Rafael Ribeiro,KARATE,,Blanche,,,Ceinture initiale
Robert Rosca,KARATE,,Blanche,,,Ceinture initiale
Youcef Roubach,KARATE,,Blanche,,,Ceinture initiale
Eyas Hsen Yousfi,KARATE,,Jaune-Orange,,,Ceinture initiale
Barae Zouaoua,KARATE,,Orange,,,Ceinture initiale
Assil Zouaoua,KARATE,,Jaune,,,Ceinture initiale
Ethan Vince Jared Zerbo,KARATE,,Blanche,,,Ceinture initiale`;

    const VERSEMENTS_CSV = `Massil Abbout,1,553.00,2025-11-13,2025-11-13,,Versement famille 1/4 (NOV) — payé
Massil Abbout,2,553.00,2025-12-13,2025-12-13,,Versement famille 2/4 (DEC) — payé
Massil Abbout,3,553.50,2026-01-13,2026-01-13,,Versement famille 3/4 (JAN) — payé
Massil Abbout,4,552.50,2026-04-01,,,Versement famille 4/4 — SOLDE EN RETARD
Haroun Affes,1,250.00,2026-03-09,2026-03-09,,
Amine Ahras,1,370.00,2025-04-28,2025-04-28,,
Amine Ahras,2,333.00,2025-05-29,2025-05-29,,
Amine Ahras,3,87.00,2025-05-29,2025-05-29,,Solde confirmed payé (790/790)
Lyna Ahras,1,333.00,2025-09-01,2025-09-01,,
Lyna Ahras,2,333.00,2025-10-10,2025-10-10,,
Helena Ait Alioua,1,225.00,2026-04-21,2026-04-21,,
Myriam Aliane,1,790.00,2025-09-18,2025-09-18,,Famille Aliane — tout payé
Amine Youcef Aliane,1,711.00,2025-09-20,2025-09-20,,Famille Aliane — tout payé
Anis Younes Aliane,1,711.00,2025-09-20,2025-09-20,,Famille Aliane — tout payé
Yanni Ammar,1,370.00,2025-06-04,2025-06-04,,
Yanni Ammar,2,370.00,2026-03-24,2026-03-24,,
Amayas Aourtilane,1,395.00,2025-09-12,2025-09-12,,
Amayas Aourtilane,2,247.00,2025-10-24,2025-10-24,,
Amayas Aourtilane,3,247.00,2025-11-24,2025-11-24,,
Maya Belkherchi,1,740.00,2025-05-09,2025-05-09,,
Mehdi Belloues,1,740.00,2025-08-05,2025-08-05,,
Amayas Berkani,1,740.00,2026-01-17,2026-01-17,,
Dina-Hanine Bouchenafa,1,575.00,2026-02-03,2026-02-03,,
Dina-Hanine Bouchenafa,2,215.00,2026-05-30,,,Solde (790-575) — dû 2026-05-30
Taha-Manil Bouchenafa,1,375.00,2026-02-03,2026-02-03,,
Taha-Manil Bouchenafa,2,335.00,2026-05-30,,,Solde (710-375) — dû 2026-05-30
Mayssa Bouhara,1,790.00,2025-09-24,2025-09-24,,TROP-PERÇU: 1000$ reçu — 210$ appliqués sur Anya Bouhara
Anya Bouhara,1,500.00,2025-09-24,2025-09-24,,
Anya Bouhara,2,211.00,2025-09-24,2025-09-24,,211$ couvert par surplus paiement Mayssa Bouhara
Yasmine Bouibaoune,1,790.00,2025-07-14,2025-07-14,,
Kanko Camara,1,737.00,2026-03-12,2026-03-12,,Forfait famille 3 enfants — payé
Kanko Camara,2,737.00,2026-04-18,,,Forfait famille 3 enfants — à venir
Kanko Camara,3,737.00,2026-05-16,,,Forfait famille 3 enfants — à venir
Hadja Foulematou Camara,1,737.00,2026-03-12,2026-03-12,,Forfait famille 3 enfants
Mayline Chergui,1,370.00,2026-04-08,2026-04-08,,
Mayline Chergui,2,370.00,2026-05-08,,,Solde restant (740-370)
Rosa-Lya Maeli Delienne,1,370.00,2025-05-08,2025-05-08,,
Rosa-Lya Maeli Delienne,2,370.00,2025-06-08,2025-06-08,,
Ilyan Didani,1,790.00,2025-10-16,2025-10-16,,
Manil Didani,1,790.00,2025-10-16,2025-10-16,,TROP-PERÇU: 790$ perçu vs 711$ dû — surpaiement 79$
Lyna Djaballah,1,240.00,2026-01-08,2026-01-08,,
Lyna Djaballah,2,250.00,2026-04-08,2026-04-08,,TROP-PERÇU: 490$ perçu vs 250$ dû
Aylan Djaout,1,790.00,2026-01-27,2026-01-27,,
Yasten Djaout,1,711.00,2026-01-27,2026-01-27,,
Mirass Douihech,1,246.00,2025-08-27,2025-08-27,,Confirmé payé par Ilyes
Mirass Douihech,2,246.00,2025-09-27,2025-09-27,,Confirmé payé par Ilyes
Mirass Douihech,3,246.00,2025-10-27,2025-10-27,,Confirmé payé par Ilyes
Hamza Douihech,1,222.00,2025-08-27,2025-08-27,,Confirmé payé par Ilyes
Hamza Douihech,2,222.00,2025-09-27,2025-09-27,,Confirmé payé par Ilyes
Hamza Douihech,3,222.00,2025-09-27,2025-09-27,,Confirmé payé par Ilyes
Isra Dridi,1,370.00,2025-10-23,2025-10-23,,
Isra Dridi,2,170.00,2025-11-25,2025-11-25,,
Isra Dridi,3,200.00,2025-12-25,2025-12-25,,
Asma Dridi,1,333.00,2026-04-08,2026-04-08,,
Asma Dridi,2,333.00,2026-08-05,2026-08-05,,
Hicham Drif,1,395.00,2025-09-06,2025-09-06,,
Hicham Drif,2,395.00,2025-10-06,,,Solde restant (790-395) — date à préciser
Mia El Kabriti,1,250.00,2025-09-10,2025-09-10,,
Mia El Kabriti,2,250.00,2025-10-10,2025-10-10,,
Mia El Kabriti,3,250.00,2025-11-16,2025-11-16,,
Saad El Maghraoui,1,250.00,2025-08-31,2025-08-31,,
Saad El Maghraoui,2,250.00,2025-11-20,2025-11-20,,
Saad El Maghraoui,3,250.00,2026-01-06,2026-01-06,,
Saad El Maghraoui,4,40.00,2026-01-06,2026-01-06,,Solde 40$ (790/790)
Qusay El Ouzeri,1,405.00,2025-11-01,2025-11-01,,
Qusay El Ouzeri,2,385.00,2026-06-01,2026-06-01,,
Cylia Ferhat,1,370.00,2025-12-19,2025-12-19,,
Cylia Ferhat,2,370.00,2026-01-19,2026-01-19,,
Adam Ferradji,1,240.00,2026-03-03,2026-03-03,,
Dalia Gallouze,1,740.00,2025-12-27,2025-12-27,,
Adam Gzooni,1,790.00,2025-09-09,2025-09-09,,
Marc-Lorens Jean,1,395.00,2026-05-07,2026-05-07,,
Marc-Lorens Jean,2,395.00,2026-06-07,,,Solde restant (790-395)
Saya Kalboussi,1,375.00,2025-06-02,2025-06-02,,
Saya Kalboussi,2,375.00,2025-10-16,2025-10-16,,TROP-PERÇU: 750$ perçu vs 740$ dû — surpaiement 10$
Darys Kedadouche,1,400.00,2024-11-11,2024-11-11,,
Darys Kedadouche,2,340.00,2026-09-01,,,Solde au renouvellement
Yani Kerkar,1,790.00,2026-02-07,2026-02-07,,
Maksen Kerkar,1,711.00,2026-02-07,2026-02-07,,
Dania Khodja,1,395.00,2025-09-03,2025-09-03,,
Dania Khodja,2,395.00,2025-10-03,2025-10-03,,
Anas Kouidri,1,370.00,2026-04-14,2026-04-14,,
Anas Kouidri,2,370.00,2026-05-13,,,Solde restant (740-370)
Nayla Kouidri,1,333.00,2025-09-25,2025-09-25,,
Nayla Kouidri,2,333.00,2025-10-26,2025-10-26,,
Shahd Loukil,1,790.00,2025-09-09,2025-09-09,,
Yasser Meraini,1,400.00,2026-12-12,2026-12-12,,
Yasser Meraini,2,340.00,2027-01-15,2027-01-15,,
Sofia Missaoui,1,370.00,2025-08-20,2025-08-20,,
Sofia Missaoui,2,370.00,2025-09-29,2025-09-29,,
Sofia Missaoui,3,50.00,2025-09-29,2025-09-29,,Solde 50$ (790/790)
Mohamed Adem Moulai Ali,1,395.00,2026-01-18,2026-01-18,,
Mohamed Adem Moulai Ali,2,395.00,2026-02-18,,,Solde restant (790-395)
Faris Msabeh,1,370.00,2025-06-04,2025-06-04,,
Faris Msabeh,2,370.00,2025-10-23,2025-10-23,,
Qusai Msabeh,1,222.00,2025-06-04,2025-06-04,,
Qusai Msabeh,2,222.00,2025-10-23,2025-10-23,,
Qusai Msabeh,3,222.00,2025-10-23,2025-10-23,,Solde 222$ (666/666)
Alexandre Nacib,1,650.00,2025-12-12,2025-12-12,,
Alexandre Nacib,2,90.00,2026-01-12,2026-01-12,,
Alice Nacib,1,330.00,2025-12-20,2025-12-20,,
Alice Nacib,2,330.00,2026-01-20,2026-01-20,,
Alice Nacib,3,6.00,2026-01-20,2026-01-20,,Solde 6$ (666/666) — arrondi
Chiraz Nehal,1,250.00,2026-03-26,2026-03-26,,
Jaysen Karl Pierre Saint,1,395.00,2025-10-07,2025-10-07,,
Jaysen Karl Pierre Saint,2,395.00,2025-11-06,2025-11-06,,
Philippe Potlog,1,790.00,2025-10-03,2025-10-03,,Confirmé payé par Ilyes
Léa Rachedi,1,740.00,2026-02-07,2026-02-07,,
Alice Rahmani,1,250.00,2026-04-29,2026-04-29,,RETRAIT 10$ pour prochain paiement
Rafael Ribeiro,1,395.00,2025-09-28,2025-09-28,,
Rafael Ribeiro,2,395.00,2025-10-28,2025-10-28,,
Robert Rosca,1,790.00,2025-09-15,2025-09-15,,
Youcef Roubach,1,250.00,2026-01-29,2026-01-29,,
Eyas Hsen Yousfi,1,740.00,2026-01-23,2026-01-23,,
Barae Zouaoua,1,500.00,2026-01-15,2026-01-15,,
Barae Zouaoua,2,290.00,2026-02-15,2026-02-15,,Solde (790-500)
Assil Zouaoua,1,711.00,2025-12-07,2025-12-07,,
Ethan Vince Jared Zerbo,1,250.00,2026-07-09,2026-07-09,,`;

    // --- IMPORT MEMBERS ---
    const memberLines = MEMBERS_CSV.trim().split('\n');
    const memberIdMap = new Map<string, string>();

    for (const line of memberLines) {
      if (!line) continue;
      const parts = line.split(',');
      const firstName = parts[0]?.trim();
      const lastName = parts[1]?.trim();
      if (!firstName || !lastName) continue;

      const keyName = `${firstName} ${lastName}`;
      const existing = await prisma.member.findFirst({
        where: { firstName, lastName }
      });

      if (existing) {
        memberIdMap.set(keyName, existing.id);
        stats.members.skipped++;
        continue;
      }

      try {
        const dateOfBirth = parts[2]?.trim() ? new Date(parts[2].trim()) : null;
        const gender = parts[3]?.trim() || null;
        const phone = parts[4]?.trim() || null;
        const email = parts[5]?.trim() || null;
        const parentName = parts[6]?.trim() || null;
        const parentPhone = parts[7]?.trim() || null;
        const parentEmail = parts[8]?.trim() || null;
        const status = parts[9]?.trim() || 'ACTIF';
        const groupe = parts[10]?.trim() || null;
        const planStr = parts[11]?.trim();
        const plan = (planStr === 'ANNUEL' || planStr === 'TRIMESTRIEL' || planStr === 'MENSUEL') ? planStr : null;
        const prixBase = parts[12]?.trim() ? parseFloat(parts[12].trim()) : null;
        const rabaisFamille = parts[13]?.trim() === 'true';
        const membreFamilleId = parts[14]?.trim() || null;
        const rabaisCustomPct = parts[15]?.trim() ? parseFloat(parts[15].trim()) : null;
        const raisonRabaisCustom = parts[16]?.trim() || null;
        const montantFinal = parts[17]?.trim() ? parseFloat(parts[17].trim()) : null;
        const dateInscription = parts[18]?.trim() ? new Date(parts[18].trim()) : null;
        const finContrat = parts[19]?.trim() ? new Date(parts[19].trim()) : null;
        const currentBelt = parts[20]?.trim() || 'BLANCHE';
        const notes = parts[21]?.trim() || null;
        const referePar = parts[22]?.trim() || null;
        const rabaisReferentPct = parts[23]?.trim() ? parseFloat(parts[23].trim()) : null;

        const created = await prisma.member.create({
          data: {
            firstName,
            lastName,
            dateOfBirth,
            gender,
            phone,
            email,
            parentName,
            parentPhone,
            parentEmail,
            status,
            groupe,
            plan,
            prixBase,
            rabaisFamille,
            membreFamilleId,
            rabaisCustomPct,
            raisonRabaisCustom,
            montantFinal,
            dateInscription,
            finContrat,
            currentBelt: currentBelt.toUpperCase(),
            notes,
            referePar,
            rabaisReferentPct
          }
        });

        memberIdMap.set(keyName, created.id);
        stats.members.inserted++;
      } catch (err) {
        console.error('Error member:', keyName, err);
        stats.members.errors++;
      }
    }

    // --- IMPORT MEMBER SECTIONS ---
    const sectionLines = SECTIONS_CSV.trim().split('\n');
    for (const line of sectionLines) {
      if (!line) continue;
      const parts = line.split(',');
      const fullName = parts[0]?.trim();
      const section = parts[1]?.trim();
      const belt = parts[2]?.trim();
      const enrollmentDate = parts[3]?.trim() ? new Date(parts[3].trim()) : new Date();

      if (!fullName || !section) continue;
      const memberId = memberIdMap.get(fullName);
      if (!memberId) {
        stats.memberSections.skipped++;
        continue;
      }

      const existing = await prisma.memberSection.findUnique({
        where: { memberId_section: { memberId, section } }
      });

      if (existing) {
        stats.memberSections.skipped++;
        continue;
      }

      try {
        await prisma.memberSection.create({
          data: {
            memberId,
            section,
            belt,
            enrollmentDate
          }
        });
        stats.memberSections.inserted++;
      } catch (err) {
        console.error('Error section:', fullName, err);
        stats.memberSections.errors++;
      }
    }

    // --- IMPORT GRADES ---
    const gradeLines = GRADES_CSV.trim().split('\n');
    for (const line of gradeLines) {
      if (!line) continue;
      const parts = line.split(',');
      const fullName = parts[0]?.trim();
      const section = parts[1]?.trim();
      const ceinturePrecedente = parts[2]?.trim() || '';
      const ceintureMontante = parts[3]?.trim();
      const note = parts[6]?.trim() || null;

      if (!fullName || !section || !ceintureMontante) continue;
      const memberId = memberIdMap.get(fullName);
      if (!memberId) {
        stats.grades.skipped++;
        continue;
      }

      let gradeDate = new Date();
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      if (member && member.dateInscription) {
        gradeDate = member.dateInscription;
      }

      const existing = await prisma.grade.findFirst({
        where: { memberId, section, ceintureMontante }
      });

      if (existing) {
        stats.grades.skipped++;
        continue;
      }

      try {
        await prisma.grade.create({
          data: {
            memberId,
            section,
            ceinturePrecedente,
            ceintureMontante,
            date: gradeDate,
            examinateurId: examinatorId,
            note
          }
        });
        stats.grades.inserted++;
      } catch (err) {
        console.error('Error grade:', fullName, err);
        stats.grades.errors++;
      }
    }

    // --- IMPORT VERSEMENTS ---
    const versementLines = VERSEMENTS_CSV.trim().split('\n');
    for (const line of versementLines) {
      if (!line) continue;
      const parts = line.split(',');
      const fullName = parts[0]?.trim();
      const numeroVersement = parts[1]?.trim() ? parseInt(parts[1].trim(), 10) : 1;
      const montant = parts[2]?.trim() ? parseFloat(parts[2].trim()) : 0;
      const datePrevue = parts[3]?.trim() ? new Date(parts[3].trim()) : new Date();
      const datePaiement = parts[4]?.trim() ? new Date(parts[4].trim()) : null;
      const note = parts[6]?.trim() || null;

      if (!fullName) continue;
      const memberId = memberIdMap.get(fullName);
      if (!memberId) {
        stats.payments.skipped++;
        continue;
      }

      const existing = await prisma.paymentVersement.findFirst({
        where: { membreId: memberId, numeroVersement, montant, datePrevue }
      });

      if (existing) {
        stats.payments.skipped++;
        continue;
      }

      try {
        await prisma.paymentVersement.create({
          data: {
            membreId: memberId,
            numeroVersement,
            montant,
            datePrevue,
            datePaiement,
            note
          }
        });

        await prisma.payment.create({
          data: {
            memberId,
            amount: montant,
            dueDate: datePrevue,
            paidDate: datePaiement,
            status: datePaiement ? 'PAID' : 'PENDING',
            reminderSentAt: new Date()
          }
        });

        stats.payments.inserted++;
      } catch (err) {
        console.error('Error versement:', fullName, err);
        stats.payments.errors++;
      }
    }

    res.json({
      success: true,
      message: 'Données Karaté importées avec succès.',
      stats
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
