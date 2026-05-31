/**
 * Sincroniza resultados del Mundial 2026 desde football-data.org → Firebase Firestore
 * Se ejecuta cada 10 minutos via GitHub Actions
 */

const admin = require('firebase-admin');
const TEAM_MAP = require('./teamMap');
const MATCH_ID_MAP = require('./matchIds');

// Importamos fetch de forma compatible con Node 18+
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// --- Firebase Admin ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// --- Constantes ---
const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches?season=2026';
const API_TOKEN = process.env.FOOTBALL_API_TOKEN;

function mapTeam(name) {
  return TEAM_MAP[name] ?? name;
}

function apiStatusToOurs(status) {
  if (status === 'FINISHED') return 'finished';
  if (status === 'IN_PLAY' || status === 'PAUSED' || status === 'HALFTIME') return 'live';
  return 'upcoming';
}

function calculatePoints(pred, homeScore, awayScore) {
  if (pred.homeScore === homeScore && pred.awayScore === awayScore) return 5;
  const predResult = pred.homeScore > pred.awayScore ? 'home' : pred.homeScore < pred.awayScore ? 'away' : 'draw';
  const actual = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
  return predResult === actual ? 2 : 0;
}

async function updatePredictionPoints(matchId, homeScore, awayScore) {
  if (!matchId || homeScore === null || awayScore === null) return;
  const snap = await db.collection('predictions').where('matchId', '==', matchId).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => {
    const pred = d.data();
    const points = calculatePoints(pred, homeScore, awayScore);
    batch.update(d.ref, { points });
  });
  await batch.commit();
  console.log(`  → ${snap.size} predicciones actualizadas para ${matchId}`);
}

async function sync() {
  console.log(`[${new Date().toISOString()}] Iniciando sincronización...`);

  const res = await fetch(API_URL, {
    headers: { 'X-Auth-Token': API_TOKEN },
  });

  // Respetamos los headers de rate limiting que recomienda la API
  const remaining = res.headers.get('X-Requests-Available-Minute');
  console.log(`Llamadas restantes este minuto: ${remaining ?? 'N/A'}`);

  if (!res.ok) {
    console.error(`Error API: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json();
  const matches = data.matches ?? [];

  const active = matches.filter(
    (m) => m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'HALFTIME'
  );

  console.log(`Partidos activos/finalizados: ${active.length}`);

  const batch = db.batch();

  for (const match of active) {
    const homeTeam = mapTeam(match.homeTeam.name);
    const awayTeam = mapTeam(match.awayTeam.name);
    const status = apiStatusToOurs(match.status);

    const homeScore = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null;

    const docId = `${homeTeam}__${awayTeam}`.replace(/\s/g, '_');
    const ref = db.collection('matchResults').doc(docId);

    batch.set(ref, {
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      status,
      apiMatchId: match.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`  ✓ ${homeTeam} ${homeScore ?? '?'} – ${awayScore ?? '?'} ${awayTeam} [${status}]`);
  }

  await batch.commit();

  // Recalcular puntos de predicciones para partidos finalizados
  const finished = active.filter((m) => m.status === 'FINISHED');
  for (const match of finished) {
    const homeTeam = mapTeam(match.homeTeam.name);
    const awayTeam = mapTeam(match.awayTeam.name);
    const homeScore = match.score?.fullTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? null;
    const docKey = `${homeTeam}__${awayTeam}`.replace(/\s/g, '_');
    const matchId = MATCH_ID_MAP[docKey];
    await updatePredictionPoints(matchId, homeScore, awayScore);
  }

  console.log('Sincronización completada.');
}

sync().catch((err) => {
  console.error('Error en sync:', err);
  process.exit(1);
});
