import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  validateStatus: () => true, // Don't throw on error status codes
});

async function runTests() {
  console.log('--- STARTING API TESTS ---');

  let adminToken = '';
  let managerToken = '';

  // BLOC 1 - Auth
  console.log('\n--- BLOC 1: AUTH ---');
  let res = await api.post('/auth/login', { email: 'admin@cshp.ca', password: 'motdepasse' });
  console.log('Test 1.1 — Login valide:', res.data.success ? 'PASSED ✅' : 'FAILED ❌');
  adminToken = res.data.data?.token;

  res = await api.post('/auth/login', { email: 'faux@cshp.ca', password: 'mauvais' });
  console.log('Test 1.2 — Login invalide:', !res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.error || '');

  res = await api.get('/auth/me');
  console.log('Test 1.3 — Route protégée sans token:', res.status === 401 ? 'PASSED ✅' : `FAILED ❌ (status ${res.status})`);

  // Reset headers to use admin token
  api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
  
  // Login manager
  res = await api.post('/auth/login', { email: 'manager@cshp.ca', password: 'motdepasse' });
  managerToken = res.data.data?.token;

  // BLOC 2 - Membres
  console.log('\n--- BLOC 2: MEMBRES ---');
  let yusefId = '';
  let sofiaId = '';

  res = await api.post('/membres', {
    firstName: 'Youssef',
    lastName: 'Benali',
    dob: '2017-03-15',
    gender: 'M',
    phone: '514-555-0001',
    email: null,
    sections: ['JUDO', 'U8'],
    currentBelt: 'BLANCHE',
    status: 'ACTIF',
    parentName: 'Karim Benali',
    parentPhone: '514-555-0002'
  });
  console.log('Test 2.1 — Créer un membre mineur (Judo + U8):', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.error || res.data.issues || '');
  yusefId = res.data.data?.id;

  res = await api.post('/membres', {
    firstName: 'Sofia',
    lastName: 'Tremblay',
    dob: '1995-07-22',
    gender: 'F',
    phone: '438-555-0010',
    email: 'sofia@email.com',
    sections: ['KARATE'],
    currentBelt: 'VERTE',
    status: 'ACTIF'
  });
  console.log('Test 2.2 — Créer un membre adulte (Karaté):', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.error || res.data.issues || '');
  sofiaId = res.data.data?.id;

  // Test 2.3 — Soft delete (on will create a temp member and delete him)
  let tmpRes = await api.post('/membres', {
    firstName: 'To',
    lastName: 'Delete',
    sections: ['JUDO']
  });
  let tmpId = tmpRes.data.data?.id;
  res = await api.delete(`/membres/${tmpId}`);
  let checkRes = await api.get(`/membres/${tmpId}`);
  console.log('Test 2.3 — Soft delete:', (checkRes.data.data?.status === 'INACTIF') ? 'PASSED ✅' : 'FAILED ❌');

  // Test 2.4 — Filtre par section (scope SECTION_MANAGER)
  api.defaults.headers.common['Authorization'] = `Bearer ${managerToken}`;
  res = await api.get('/membres?section=JUDO');
  let onlyJudo = res.data.data?.every((m: any) => m.sections.some((s: any) => s.section === 'JUDO'));
  let hasSofia = res.data.data?.some((m: any) => m.firstName === 'Sofia');
  console.log('Test 2.4 — Filtre par section (Manager):', (onlyJudo && !hasSofia && res.data.success) ? 'PASSED ✅' : 'FAILED ❌');

  // Restore Admin Token
  api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;

  // BLOC 3 - Abonnements + Paiements
  console.log('\n--- BLOC 3: ABONNEMENTS & PAIEMENTS ---');
  res = await api.post('/abonnements', {
    memberId: sofiaId,
    section: 'KARATE',
    type: 'MENSUEL',
    amount: 65.83,
    startDate: '2026-06-01',
    endDate: '2026-06-30'
  });
  console.log('Test 3.1 — Créer abonnement mensuel:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', JSON.stringify(res.data));
  let subIdKarate = res.data.data?.id;

  res = await api.post('/paiements', {
    memberId: sofiaId,
    subscriptionId: subIdKarate,
    amount: 65.83,
    method: 'COMPTANT',
    status: 'PAYÉ',
    paidDate: '2026-06-01'
  });
  console.log('Test 3.2 — Enregistrer un paiement:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.error, JSON.stringify(res.data.issues));

  // create sub for judo
  res = await api.post('/abonnements', {
    memberId: yusefId,
    section: 'JUDO',
    type: 'MENSUEL',
    amount: 65.83,
    startDate: '2026-05-01',
    endDate: '2026-05-31'
  });
  let subIdJudo = res.data.data?.id;

  res = await api.post('/paiements', {
    memberId: yusefId,
    subscriptionId: subIdJudo,
    amount: 65.83,
    method: 'VIREMENT',
    status: 'EN_RETARD',
    dueDate: '2026-05-01'
  });
  console.log('Test 3.3 — Simuler un retard:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.error, JSON.stringify(res.data.issues));

  res = await api.get('/paiements/retards');
  let isRetardsValid = res.data.data?.records?.find((p: any) => p.member.firstName === 'Youssef');
  console.log('Test 3.3.1 — Afficher les retards:', isRetardsValid ? 'PASSED ✅' : 'FAILED ❌');


  // BLOC 4 - Edge Cases
  console.log('\n--- BLOC 4: CAS LIMITES ---');
  res = await api.post('/membres', { lastName: 'Oops' }); // No firstname
  console.log('Test 4.1 — Zod champ obligatoire manquant:', res.status === 400 ? 'PASSED ✅' : `FAILED ❌ (status ${res.status})`, res.data.error || '');

  res = await api.get('/membres/id-qui-nexiste-pas');
  console.log('Test 4.2 — Membre inexistant:', res.status === 404 ? 'PASSED ✅' : `FAILED ❌ (status ${res.status})`, res.data.error || '');

  api.defaults.headers.common['Authorization'] = 'Bearer tokenbidon123';
  res = await api.get('/auth/me');
  console.log('Test 4.3 — Token expiré ou falsifié:', res.status === 401 ? 'PASSED ✅' : `FAILED ❌ (status ${res.status})`, res.data.error || '');


  api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
  console.log('\n--- BLOC 5: PRÉSENCES (Phase 2) ---');

  // Create a template course
  res = await api.post('/cours', {
    section: 'KARATE',
    dayOfWeek: 2, // Tuesday
    startTime: '18:00',
    endTime: '19:30'
  });
  let courseTemplateId = res.data.data?.id;

  // Generate for week
  res = await api.post('/cours/generer-semaine?startDate=2026-06-02');
  console.log('Test 5.1 — Générer la semaine:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.data);

  res = await api.get('/cours?date=2026-06-02'); // This endpoint doesn't exist yet! We need to query courses directly without date or handle it. Wait, the pointage doesn't require knowing the db id for testing, I'll fetch raw from db or just use the courseTemplateId to point? 
  // Actually, wait, generating for week created a course instance. We need to fetch it to get its ID, or we can just point against the template ID? The requirements say:
  // "POST /api/presences/pointer { courseId, date, memberIds: [id1, id2, id3] }"
  // The courseId could be the template!

  res = await api.post('/presences/pointer', {
    courseId: courseTemplateId,
    date: '2026-06-02',
    memberIds: [sofiaId, yusefId]
  });
  console.log('Test 5.2 — Pointage normal:', (res.data.success && res.data.data.pointed === 2) ? 'PASSED ✅' : 'FAILED ❌', res.data);

  res = await api.post('/presences/pointer', {
    courseId: courseTemplateId,
    date: '2026-06-02',
    memberIds: [sofiaId, yusefId]
  });
  console.log('Test 5.3 — Anti-doublon:', (res.data.success && res.data.data.skipped === 2 && res.data.data.pointed === 0) ? 'PASSED ✅' : 'FAILED ❌', res.data);

  res = await api.get(`/presences/membre/${sofiaId}`);
  console.log('Test 5.4 — Historique membre:', (res.data.success && res.data.data.length > 0) ? 'PASSED ✅' : 'FAILED ❌');

  res = await api.get(`/presences/stats?section=KARATE&month=2026-06`);
  console.log('Test 5.5 — Stats section:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.data);

  console.log('\n--- BLOC 6: DASHBOARD (Phase 2) ---');

  res = await api.get('/dashboard/revenus?month=2026-06');
  // It should only count PAID revenues
  console.log('Test 6.1 — Revenus réels:', res.data.success ? 'PASSED ✅' : 'FAILED ❌', res.data.data);

  api.defaults.headers.common['Authorization'] = `Bearer ${managerToken}`;
  res = await api.get('/dashboard/resume');
  console.log('Test 6.2 — Accès restreint (Manager sur Dashboard):', res.status === 403 ? 'PASSED ✅' : 'FAILED ❌');

  api.defaults.headers.common['Authorization'] = `Bearer ${adminToken}`;
  res = await api.get('/dashboard/resume');
  console.log('Test 6.3 — Résumé complet (Admin):', res.data.success ? 'PASSED ✅' : 'FAILED ❌', JSON.stringify(res.data.data));

}

runTests().catch(console.error);
