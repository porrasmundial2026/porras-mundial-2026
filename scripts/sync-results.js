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

const unmappedTeams = new Set();
function mapTeam(name) {
  if (!(name in TEAM_MAP)) unmappedTeams.add(name);
  return TEAM_MAP[name] ?? name;
}

// Clave canónica independiente del orden local/visitante
function pairKey(a, b) {
  return [a, b].sort().join('__').replace(/\s/g, '_');
}

// Hash sencillo de un array de strings (para detectar si las horas cambiaron)
function hashStrings(arr) {
  const s = arr.join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
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

    // El marcador que puntúa es el de 90/120 min (ignorando la tanda).
    // OJO: en partidos de penaltis, la API mete en `fullTime` la suma de
    // tiempo reglamentario + penaltis (ej. 1-1 que acaba 5-3 → fullTime 6-4).
    // El resultado real está en regularTime + extraTime; los penaltis aparte.
    const s = match.score ?? {};
    let homeScore, awayScore, penaltyHome = null, penaltyAway = null;
    if (s.duration === 'PENALTY_SHOOTOUT') {
      homeScore = (s.regularTime?.home ?? 0) + (s.extraTime?.home ?? 0);
      awayScore = (s.regularTime?.away ?? 0) + (s.extraTime?.away ?? 0);
      penaltyHome = s.penalties?.home ?? null;
      penaltyAway = s.penalties?.away ?? null;
    } else {
      homeScore = s.fullTime?.home ?? s.halfTime?.home ?? null;
      awayScore = s.fullTime?.away ?? s.halfTime?.away ?? null;
    }

    // Solo en empate decidido por penaltis: quién ganó la tanda ('home'/'away').
    // Es el MISMO campo que escribe el admin y que lee la app para el bracket.
    const penaltyWinner = s.duration === 'PENALTY_SHOOTOUT'
      ? (s.winner === 'HOME_TEAM' ? 'home' : s.winner === 'AWAY_TEAM' ? 'away' : null)
      : null;

    // No escribimos un resultado sin marcador (evita "FIN" sin resultado).
    if (homeScore === null || awayScore === null) {
      console.log(`  · ${homeTeam} - ${awayTeam}: sin marcador todavía, se omite`);
      continue;
    }

    const ref = db.collection('matchResults').doc(pairKey(homeTeam, awayTeam));

    // Si el admin ya metió este resultado a mano, NO lo tocamos.
    const existing = await ref.get();
    if (existing.exists && existing.data().editedByAdmin === true) {
      console.log(`  · ${homeTeam} - ${awayTeam}: editado por admin, se respeta`);
      continue;
    }

    batch.set(ref, {
      homeTeam,
      awayTeam,
      homeScore,
      awayScore,
      status,
      penaltyWinner,                // 'home' | 'away' | null → quién pasa en la tanda
      penaltyHome,                  // marcador de la tanda (null si no hubo)
      penaltyAway,
      apiMatchId: match.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const pens = penaltyHome !== null ? ` (pen ${penaltyHome}-${penaltyAway})` : '';
    console.log(`  ✓ ${homeTeam} ${homeScore ?? '?'} – ${awayScore ?? '?'} ${awayTeam}${pens} [${status}]`);
  }

  await batch.commit();

  // Guardar la hora de inicio real de TODOS los partidos (incluidos los no jugados).
  // Las horas son fijas: solo reescribimos si han cambiado respecto a la última
  // vuelta. Regrabarlas cada vez agotaba la cuota diaria de Firestore.
  const withTime = matches.filter((m) => m.homeTeam?.name && m.awayTeam?.name && m.utcDate);
  const scheduleHash = hashStrings(
    withTime
      .map((m) => `${pairKey(mapTeam(m.homeTeam.name), mapTeam(m.awayTeam.name))}=${m.utcDate}`)
      .sort()
  );
  const cfgRef = db.collection('config').doc('robot');
  const cfgSnap = await cfgRef.get();
  const storedHash = cfgSnap.exists ? cfgSnap.data().scheduleHash : null;

  if (storedHash === scheduleHash) {
    console.log('Horas de inicio sin cambios: no se reescriben.');
  } else {
    const timeBatch = db.batch();
    let timeCount = 0;
    for (const match of withTime) {
      const homeTeam = mapTeam(match.homeTeam.name);
      const awayTeam = mapTeam(match.awayTeam.name);
      timeBatch.set(db.collection('matchResults').doc(pairKey(homeTeam, awayTeam)), {
        homeTeam,
        awayTeam,
        scheduledAt: match.utcDate, // ISO string con la hora real
      }, { merge: true });
      timeCount++;

      // Colección 'matches' por matchId con la hora como Timestamp:
      // sirve para que las REGLAS de Firestore cierren la predicción en el servidor.
      const matchId = MATCH_ID_MAP[pairKey(homeTeam, awayTeam)];
      if (matchId) {
        timeBatch.set(db.collection('matches').doc(matchId), {
          scheduledAt: admin.firestore.Timestamp.fromDate(new Date(match.utcDate)),
        }, { merge: true });
      }
    }
    timeBatch.set(cfgRef, { scheduleHash }, { merge: true });
    await timeBatch.commit();
    console.log(`Horas de inicio actualizadas: ${timeCount}`);
  }

  if (unmappedTeams.size > 0) {
    console.log('⚠️ EQUIPOS SIN MAPEAR (revisar teamMap.js):', JSON.stringify([...unmappedTeams]));
  } else {
    console.log('✓ Todos los equipos mapeados correctamente');
  }

  // Los puntos se calculan en tiempo real en la app (ranking, perfil, tarjetas)
  // a partir del resultado, no se guardan dentro de las predicciones.

  console.log('Sincronización completada.');
}

sync().catch((err) => {
  console.error('Error en sync:', err);
  process.exit(1);
});
