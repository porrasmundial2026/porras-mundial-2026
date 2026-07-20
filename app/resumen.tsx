import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Animated, Dimensions, ScrollView, Platform } from 'react-native';
import { Redirect, router } from 'expo-router';
import { query, where, getDocs, doc, getDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useGroups } from '../hooks/useGroup';
import { useMatchResults, useMatchResultsReady } from '../hooks/useMatchResults';
import { isFinalFinished } from '../lib/tournament';
import { buildRanking, calculatePoints } from '../lib/scoring';
import { Flag } from '../components/Flag';
import { Group, Match, Prediction, RankingEntry, UserProfile } from '../types';
import { PHASE_LABELS, GROUPS } from '../constants/matches';
import { T } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Altura acotada para las listas dentro de las slides (igual que el maxHeight
// del modal del ranking, que es el patrón que funciona en web y móvil).
const LIST_MAX_H = Math.max(260, SCREEN_H - 260);

// Los 48 equipos participantes en el Mundial (para la slide final de agradecimiento)
const ALL_WC_TEAMS = Object.values(GROUPS).flatMap((g) => g.teams);

// Semilla estable por nombre (para chistes/motes que no cambian en cada render)
function seedOf(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }

const JOKES = [
  '{name} predijo con el corazón… y el corazón no sabe de fútbol 💔',
  'Dicen que {name} vio todos los partidos. Los resultados dicen que no ⚽🙈',
  'La bola de cristal de {name} necesita una revisión técnica 🔮🔧',
  '{name} apostaba con tanta fe que hasta el árbitro se emocionó 😇',
  'Lo de {name} no es mala suerte, es… un estilo de vida 🃏',
  '{name}: experto en decir "lo tenía clarísimo" DESPUÉS del partido 🧠',
  'Si {name} fuera seleccionador, aún estaríamos en la fase de grupos 😅',
  '{name} juega la porra como yo el ajedrez: con mucha confianza y poco criterio ♟️',
  'Cada predicción de {name} es una aventura. Un thriller. A veces, terror 🎬',
  '{name} tiene un plan infalible… que falla infaliblemente 📉',
  'Aplausos para {name}, que convierte el fútbol en una lotería 🎰',
  '{name} demostró que predecir es un arte. Uno muy abstracto 🎨',
];

const MOTE_EMOJI: Record<string, string> = {
  'El goleador': '🎯', 'El cerrojo': '🔒', 'El empate-fácil': '🤝',
  'La oveja': '🐑', 'El rebelde': '😎', 'El equilibrado': '⚖️',
};

function fmtLead(h: number) { return h >= 48 ? `${Math.round(h / 24)} días antes` : `${Math.round(h)} h antes`; }

// ---- Pequeño componente de aparición suave ----
function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity: op, transform: [{ translateY: ty }] }]}>{children}</Animated.View>;
}

interface Member { userId: string; displayName: string; photoURL: string | null }

export default function ResumenScreen() {
  const { user } = useAuth();
  const liveMatches = useMatchResults();
  const { groups: myGroups } = useGroups();
  const finalDone = useMemo(() => isFinalFinished(liveMatches), [liveMatches]);
  // Solo true cuando ha llegado la respuesta REAL de Firestore (no en el
  // primer montaje con el estado por defecto). Evita el redirect prematuro.
  const dataReady = useMatchResultsReady();

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(SCREEN_W);
  const listRef = useRef<FlatList>(null);

  // Cada usuario ve solo el resumen de SUS propios grupos
  useEffect(() => {
    if (myGroups.length > 0 && !selectedGroup) setSelectedGroup(myGroups[0]);
  }, [myGroups]);

  useEffect(() => {
    if (!selectedGroup) return;
    setLoading(true);
    (async () => {
      const memberDocs = await Promise.all(selectedGroup.members.map((uid) => getDoc(doc(db, 'users', uid))));
      setMembers(memberDocs.filter((d) => d.exists()).map((d) => ({ userId: d.id, displayName: (d.data() as UserProfile).displayName, photoURL: (d.data() as UserProfile).photoURL ?? null })));
      const snap = await getDocs(query(collection(db, 'predictions'), where('userId', 'in', selectedGroup.members)));
      setPredictions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Prediction)));
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [selectedGroup]);

  const finished = useMemo(
    () => liveMatches.filter((m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null),
    [liveMatches]
  );

  const ranking = useMemo(() => buildRanking(members, predictions, finished), [members, predictions, finished]);

  const stats = useMemo(() => {
    if (members.length === 0) return null;
    const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '?';
    const resultMap = new Map(finished.map((m) => [m.id, m]));

    // Nostradamus: más exactos
    const nostra = [...ranking].sort((a, b) => b.exactHits - a.exactHits)[0];

    // El pupas: más fallos (0 pts en partidos jugados que predijo)
    const zeros = members.map((mem) => {
      let z = 0;
      for (const p of predictions.filter((x) => x.userId === mem.userId)) {
        const m = resultMap.get(p.matchId);
        if (m && calculatePoints(p, m) === 0) z++;
      }
      return { name: mem.displayName, z };
    }).sort((a, b) => b.z - a.z)[0];

    // Mejor jornada (mejor puntuación de una persona en un solo día)
    const dayKey = (m: Match) => { const d = new Date(m.scheduledAt); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    let best = { name: '', pts: -1, day: '' };
    const days = new Map<string, Match[]>();
    for (const m of finished) { const k = dayKey(m); if (!days.has(k)) days.set(k, []); days.get(k)!.push(m); }
    for (const mem of members) {
      for (const [k, ms] of days) {
        let pts = 0;
        for (const m of ms) {
          const p = predictions.find((x) => x.userId === mem.userId && x.matchId === m.id);
          if (p) pts += calculatePoints(p, m);
        }
        if (pts > best.pts) best = { name: mem.displayName, pts, day: k };
      }
    }
    const bestDayLabel = best.day
      ? (() => { const [y, mo, d] = best.day.split('-').map(Number); return new Date(y, mo, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); })()
      : '';

    // Rey de grupos vs Rey de eliminatoria
    const groupFin = finished.filter((m) => m.phase === 'group');
    const koFin = finished.filter((m) => m.phase !== 'group');
    const kingGroup = buildRanking(members, predictions, groupFin)[0];
    const kingKo = koFin.length > 0 ? buildRanking(members, predictions, koFin)[0] : null;

    // El francotirador: mejor % de puntos por predicción hecha (mínimo 3 predicciones)
    const sniper = members.map((mem) => {
      const preds = predictions.filter((p) => p.userId === mem.userId && resultMap.has(p.matchId));
      const pts = preds.reduce((s, p) => s + calculatePoints(p, resultMap.get(p.matchId)!), 0);
      return { name: mem.displayName, ratio: preds.length ? pts / preds.length : 0, n: preds.length };
    }).filter((s) => s.n >= 3).sort((a, b) => b.ratio - a.ratio)[0];

    // Sangre fría: mejor puntuación en partidos de eliminatoria
    const coldBlood = koFin.length > 0 ? buildRanking(members, predictions, koFin).filter((r) => r.totalPoints > 0)[0] : null;

    // El más fiel: predijo el 100% de los partidos ya disponibles (rellenados o jugados)
    const availableMatches = liveMatches.filter((m) => m.homeTeam !== 'Por definir' && m.awayTeam !== 'Por definir');
    const faithful = members
      .map((mem) => ({ name: mem.displayName, n: predictions.filter((p) => p.userId === mem.userId).length }))
      .filter((s) => s.n >= availableMatches.length && availableMatches.length > 0)
      .sort((a, b) => b.n - a.n)[0];

    // Goles del torneo + goles predichos por cada uno
    const totalGoals = finished.reduce((s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const goalsList = members.map((mem) => {
      let g = 0;
      for (const p of predictions.filter((x) => x.userId === mem.userId)) {
        if (resultMap.has(p.matchId)) g += p.homeScore + p.awayScore;
      }
      return { name: mem.displayName, diff: Math.abs(g - totalGoals), g };
    }).sort((a, b) => a.diff - b.diff);
    const closest = goalsList[0];

    // Partido más loco (más goles)
    const wildest = [...finished].sort((a, b) => ((b.homeScore ?? 0) + (b.awayScore ?? 0)) - ((a.homeScore ?? 0) + (a.awayScore ?? 0)))[0];

    // ---- Estadísticas por país (agregadas de todo el torneo) ----
    const teamStats = new Map<string, { gf: number; ga: number; played: number; wins: number }>();
    const touch = (t: string) => { if (!teamStats.has(t)) teamStats.set(t, { gf: 0, ga: 0, played: 0, wins: 0 }); return teamStats.get(t)!; };
    let biggestWin: { home: string; away: string; hs: number; as: number; margin: number } | null = null;
    for (const m of finished) {
      const hs = m.homeScore ?? 0, as = m.awayScore ?? 0;
      const h = touch(m.homeTeam), a = touch(m.awayTeam);
      h.gf += hs; h.ga += as; h.played++;
      a.gf += as; a.ga += hs; a.played++;
      if (hs > as) h.wins++; else if (as > hs) a.wins++;
      const margin = Math.abs(hs - as);
      if (!biggestWin || margin > biggestWin.margin) {
        biggestWin = hs >= as
          ? { home: m.homeTeam, away: m.awayTeam, hs, as, margin }
          : { home: m.awayTeam, away: m.homeTeam, hs: as, as: hs, margin };
      }
    }
    const teamsPlayed = [...teamStats.entries()].filter(([, s]) => s.played >= 2);
    const topScorerTeam = [...teamStats.entries()].sort((a, b) => b[1].gf - a[1].gf)[0];
    const bestDefense = teamsPlayed.sort((a, b) => (a[1].ga / a[1].played) - (b[1].ga / b[1].played))[0];
    const leakiest = teamsPlayed.sort((a, b) => (b[1].ga / b[1].played) - (a[1].ga / a[1].played))[0];
    const mostWins = [...teamStats.entries()].sort((a, b) => b[1].wins - a[1].wins)[0];

    // Campeón del Mundial (final finalizada)
    const finalMatch = liveMatches.find((m) => m.phase === 'final' && m.status === 'finished');
    let champion: string | null = null;
    if (finalMatch && finalMatch.homeScore != null && finalMatch.awayScore != null) {
      if (finalMatch.homeScore > finalMatch.awayScore) champion = finalMatch.homeTeam;
      else if (finalMatch.awayScore > finalMatch.homeScore) champion = finalMatch.awayTeam;
      else if (finalMatch.penaltyWinner) champion = finalMatch.penaltyWinner === 'home' ? finalMatch.homeTeam : finalMatch.awayTeam;
    }

    // ---- Predicciones por partido (moda, conformista/rebelde, sorpresa) ----
    const predsByMatch = new Map<string, Prediction[]>();
    for (const p of predictions) {
      if (!resultMap.has(p.matchId)) continue;
      if (!predsByMatch.has(p.matchId)) predsByMatch.set(p.matchId, []);
      predsByMatch.get(p.matchId)!.push(p);
    }
    const modeByMatch = new Map<string, string>();
    for (const [mid, ps] of predsByMatch) {
      const counts = new Map<string, number>();
      for (const p of ps) { const k = `${p.homeScore}-${p.awayScore}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      let bestK = '', bestC = -1;
      for (const [k, c] of counts) if (c > bestC) { bestC = c; bestK = k; }
      modeByMatch.set(mid, bestK);
    }

    const labelOf = (k: string) => {
      if (!k) return '';
      const [y, mo, d] = k.split('-').map(Number);
      const l = new Date(y, mo, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      return l.charAt(0).toUpperCase() + l.slice(1);
    };

    // ---- Ficha por jugador (métricas; el mote se asigna después, sin repetir) ----
    const perPlayer = members.map((mem) => {
      const myPreds = predictions.filter((p) => p.userId === mem.userId && resultMap.has(p.matchId));
      const dayPts = new Map<string, number>();
      let zeros = 0;
      for (const p of myPreds) { const m = resultMap.get(p.matchId)!; const pts = calculatePoints(p, m); const k = dayKey(m); dayPts.set(k, (dayPts.get(k) ?? 0) + pts); if (pts === 0) zeros++; }
      let bestD = { k: '', pts: -1 }, worstD = { k: '', pts: Infinity };
      for (const [k, pts] of dayPts) { if (pts > bestD.pts) bestD = { k, pts }; if (pts < worstD.pts) worstD = { k, pts }; }

      let goals = 0, draws = 0, conform = 0, tot = 0;
      for (const p of myPreds) {
        goals += p.homeScore + p.awayScore;
        if (p.homeScore === p.awayScore) draws++;
        if (modeByMatch.get(p.matchId) === `${p.homeScore}-${p.awayScore}`) conform++;
        tot++;
      }
      const entry = ranking.find((r) => r.userId === mem.userId);
      return {
        userId: mem.userId,
        name: mem.displayName,
        points: entry?.totalPoints ?? 0,
        exactHits: entry?.exactHits ?? 0,
        resultHits: entry?.resultHits ?? 0,
        pos: ranking.findIndex((r) => r.userId === mem.userId) + 1,
        bestDay: { label: labelOf(bestD.k), pts: bestD.pts < 0 ? 0 : bestD.pts },
        worstDay: { label: labelOf(worstD.k), pts: worstD.pts === Infinity ? 0 : worstD.pts },
        avgGoals: tot ? goals / tot : 0,
        drawRatio: tot ? draws / tot : 0,
        conformRatio: tot ? conform / tot : 0,
        goalsSum: goals,
        zeros,
        tot,
        mote: 'El jugador',
        emoji: '👤',
        motivo: '',
        joke: pick(JOKES, seedOf(mem.displayName)).replace('{name}', mem.displayName),
      };
    });

    // Motes ÚNICOS y con sentido: cada premio se da a quien MÁS destaca en esa
    // métrica respecto al grupo (valor normalizado), no por orden fijo. Cada
    // mote lleva su motivo con el dato real que lo justifica.
    type P = typeof perPlayer[number];
    const pct = (r: number) => Math.round(r * 100);
    const awards: { mote: string; emoji: string; m: (p: P) => number; reason: (p: P) => string }[] = [
      { mote: 'El goleador', emoji: '🎯', m: (p) => p.avgGoals, reason: (p) => `predice ${p.avgGoals.toFixed(1)} goles de media por partido, el que más goles ve` },
      { mote: 'El cerrojo', emoji: '🔒', m: (p) => -p.avgGoals, reason: (p) => `solo ${p.avgGoals.toFixed(1)} goles de media por partido, el más prudente del grupo` },
      { mote: 'El del pelotazo', emoji: '🔮', m: (p) => p.exactHits, reason: (p) => `${p.exactHits} marcadores exactos clavados, nadie afinó más` },
      { mote: 'El empate-fácil', emoji: '🤝', m: (p) => p.drawRatio, reason: (p) => `el ${pct(p.drawRatio)}% de sus predicciones fueron empates` },
      { mote: 'La oveja', emoji: '🐑', m: (p) => p.conformRatio, reason: (p) => `coincidió con la predicción más repetida del grupo en el ${pct(p.conformRatio)}% de los partidos` },
      { mote: 'El rebelde', emoji: '😎', m: (p) => -p.conformRatio, reason: (p) => `solo coincidió con la mayoría del grupo en el ${pct(p.conformRatio)}% de los partidos` },
      { mote: 'El seguro', emoji: '🍀', m: (p) => p.resultHits, reason: (p) => `acertó el ganador en ${p.resultHits} partidos, el que más resultados vio venir` },
      { mote: 'El generoso', emoji: '🎁', m: (p) => p.zeros, reason: (p) => `${p.zeros} predicciones falladas de pleno, todo un detalle con los rivales` },
      { mote: 'El alérgico al empate', emoji: '🙅', m: (p) => -p.drawRatio, reason: (p) => `solo el ${pct(p.drawRatio)}% de sus predicciones fueron empates: aquí se viene a ganar` },
      { mote: 'El artillero', emoji: '💣', m: (p) => p.goalsSum, reason: (p) => `sumó ${p.goalsSum} goles entre todas sus predicciones` },
    ];

    // Normalizamos cada métrica (z-score) y asignamos primero las parejas
    // jugador-premio más llamativas, para que el mote pegue de verdad.
    const candidates: { p: P; aw: typeof awards[number]; strength: number }[] = [];
    for (const aw of awards) {
      const vals = perPlayer.map((p) => aw.m(p));
      const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
      const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length || 1)) || 1;
      for (const p of perPlayer) {
        if (p.tot < 3) continue; // sin datos suficientes no hay mote temático fiable
        candidates.push({ p, aw, strength: (aw.m(p) - mean) / std });
      }
    }
    candidates.sort((a, b) => b.strength - a.strength || seedOf(a.p.name) - seedOf(b.p.name));
    const takenPlayer = new Set<string>();
    const takenAward = new Set<string>();
    for (const c of candidates) {
      if (takenPlayer.has(c.p.userId) || takenAward.has(c.aw.mote)) continue;
      c.p.mote = c.aw.mote; c.p.emoji = c.aw.emoji; c.p.motivo = c.aw.reason(c.p);
      takenPlayer.add(c.p.userId); takenAward.add(c.aw.mote);
    }
    // A quien no le tocó premio (grupo grande o pocos datos): mote neutro con sus números
    const fillers = [
      { mote: 'El equilibrado', emoji: '⚖️' }, { mote: 'El discreto', emoji: '🎩' }, { mote: 'El constante', emoji: '🧱' },
      { mote: 'El sereno', emoji: '🧘' }, { mote: 'El estratega', emoji: '🧠' }, { mote: 'El clásico', emoji: '📻' },
    ];
    let fi = 0;
    for (const p of perPlayer) {
      if (takenPlayer.has(p.userId)) continue;
      const f = fillers[fi % fillers.length]; fi++;
      p.mote = f.mote; p.emoji = f.emoji;
      const aciertos = p.exactHits + p.resultHits;
      p.motivo = p.tot > 0
        ? `sin extremos: ${p.avgGoals.toFixed(1)} goles de media y ${pct(aciertos / p.tot)}% de aciertos`
        : 'aún sin predicciones suficientes para retratarle';
    }

    // ---- Remontada / hundimiento (grupos → final) ----
    const groupRank = buildRanking(members, predictions, groupFin);
    const groupPos = new Map(groupRank.map((r, i) => [r.userId, i + 1]));
    const finalPos = new Map(ranking.map((r, i) => [r.userId, i + 1]));
    let remont = { name: '', delta: 0 }, hund = { name: '', delta: 0 };
    for (const mem of members) {
      const gp = groupPos.get(mem.userId), fp = finalPos.get(mem.userId);
      if (gp == null || fp == null) continue;
      const delta = gp - fp;
      if (delta > remont.delta) remont = { name: mem.displayName, delta };
      if (delta < hund.delta) hund = { name: mem.displayName, delta };
    }

    // ---- Madrugador / dormilón (updatedAt vs hora del partido) ----
    const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);
    let madr = { name: '', h: -1 }, dorm = { name: '', h: Infinity };
    for (const mem of members) {
      let sum = 0, n = 0;
      for (const p of predictions.filter((x) => x.userId === mem.userId)) {
        const m = resultMap.get(p.matchId); if (!m) continue;
        const u = toDate(p.updatedAt); if (!u) continue;
        const lead = (new Date(m.scheduledAt).getTime() - u.getTime()) / 3600000;
        if (lead > 0) { sum += lead; n++; }
      }
      if (n > 0) { const avg = sum / n; if (avg > madr.h) madr = { name: mem.displayName, h: avg }; if (avg < dorm.h) dorm = { name: mem.displayName, h: avg }; }
    }

    // ---- Duelo de tortolitos (predicciones más parecidas) ----
    let tort = { a: '', b: '', n: -1 };
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const A = members[i], B = members[j];
      const pa = predictions.filter((p) => p.userId === A.userId && resultMap.has(p.matchId));
      let same = 0;
      for (const p of pa) { const q = predictions.find((x) => x.userId === B.userId && x.matchId === p.matchId); if (q && q.homeScore === p.homeScore && q.awayScore === p.awayScore) same++; }
      if (same > tort.n) tort = { a: A.displayName, b: B.displayName, n: same };
    }

    // ---- La sorpresa del torneo (partido que menos gente acertó) ----
    let surp: { match: Match | null; pct: number } = { match: null, pct: 2 };
    for (const [mid, ps] of predsByMatch) {
      if (ps.length < 3) continue;
      const m = resultMap.get(mid)!;
      const hit = ps.filter((p) => calculatePoints(p, m) > 0).length;
      const pct = hit / ps.length;
      if (pct < surp.pct) surp = { match: m, pct };
    }

    // ---- Muermos y tandas ----
    const muermos = finished.filter((m) => m.homeScore === 0 && m.awayScore === 0).length;
    const tandas = finished.filter((m) => (m as any).penaltyWinner).length;

    // ---- Camino del campeón ----
    let camino: { round: string; rival: string; gf: number; ga: number; pens: boolean }[] = [];
    if (champion) {
      camino = finished
        .filter((m) => m.phase !== 'group' && (m.homeTeam === champion || m.awayTeam === champion))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .map((m) => {
          const home = m.homeTeam === champion;
          return { round: PHASE_LABELS[m.phase], rival: home ? m.awayTeam : m.homeTeam, gf: (home ? m.homeScore : m.awayScore) ?? 0, ga: (home ? m.awayScore : m.homeScore) ?? 0, pens: !!(m as any).penaltyWinner };
        });
    }

    return {
      nostra, zeros, best, bestDayLabel, kingGroup, kingKo, sniper, coldBlood, faithful, totalGoals, closest, goalsList, wildest, champion, playedCount: finished.length,
      topScorerTeam, bestDefense, leakiest, mostWins, biggestWin,
      perPlayer, remont, hund, madr, dorm, tort, surp, muermos, tandas, camino,
    };
  }, [members, predictions, finished, ranking, liveMatches]);

  // ---- Definición de slides ----
  const slides = useMemo(() => {
    if (!stats || ranking.length === 0) return [] as { key: string; render: () => React.ReactNode }[];
    const podium = ranking.slice(0, 3);

    const arr: { key: string; render: () => React.ReactNode }[] = [];

    arr.push({ key: 'intro', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.big}>🏆</Text></FadeIn>
        <FadeIn delay={200}><Text style={styles.title}>Resumen del Mundial</Text></FadeIn>
        <FadeIn delay={400}><Text style={styles.subtitle}>{selectedGroup?.name}</Text></FadeIn>
        <FadeIn delay={700}><Text style={styles.hint}>Desliza para empezar →</Text></FadeIn>
      </View>
    )});

    arr.push({ key: 'podium', render: () => <PodiumSlide podium={podium} active={index === 1} /> });

    arr.push({ key: 'final', render: () => (
      <View style={[styles.slideInner, { paddingTop: 24 }]}>
        <Text style={styles.title}>Clasificación final</Text>
        <ScrollView style={{ maxHeight: LIST_MAX_H, marginTop: 16, width: '100%' }} contentContainerStyle={{ gap: 8, paddingBottom: 40 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {ranking.map((e, i) => (
            <View key={e.userId} style={styles.rankRow}>
              <Text style={[styles.rankPos, i < 3 && { color: T.color.accent }]}>{i + 1}</Text>
              <Text style={styles.rankName} numberOfLines={1}>{e.displayName}</Text>
              <Text style={styles.rankPts}>{e.totalPoints}</Text>
            </View>
          ))}
        </ScrollView>
        <Text style={styles.hint}>¡Gracias por jugar! 🏆</Text>
      </View>
    )});

    arr.push({ key: 'goles', render: () => (
      <View style={[styles.slideInner, { paddingTop: 40, justifyContent: 'center' }]}>
        <FadeIn><Text style={[styles.emoji, { textAlign: 'center' }]}>⚽</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>Goles del torneo</Text></FadeIn>
        <FadeIn delay={250}><Text style={[styles.bigNum, { textAlign: 'center' }]}>{stats.totalGoals}</Text></FadeIn>
        <FadeIn delay={350}><Text style={styles.sub}>en {stats.playedCount} partidos jugados</Text></FadeIn>
        <FadeIn delay={550} style={{ width: '100%', marginTop: 18 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Goles que predijo cada uno</Text>
          <ScrollView style={{ maxHeight: 260, width: '100%' }} contentContainerStyle={{ gap: 6 }} nestedScrollEnabled showsVerticalScrollIndicator>
            {stats.goalsList.map((it, i) => (
              <View key={it.name} style={[styles.rankRow, i === 0 && { borderColor: T.color.accent, backgroundColor: T.color.soft }]}>
                <Text style={styles.rankName} numberOfLines={1}>{it.name}{i === 0 ? '  🎯' : ''}</Text>
                <Text style={styles.rankPts}>{it.g}</Text>
                <Text style={styles.golDiff}>{it.diff === 0 ? 'clavado' : `±${it.diff}`}</Text>
              </View>
            ))}
          </ScrollView>
        </FadeIn>
      </View>
    )});

    if (stats.champion) arr.push({ key: 'campeon', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.emoji}>🌍</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>Campeón del Mundo</Text></FadeIn>
        <FadeIn delay={350}><Flag team={stats.champion!} size={72} /></FadeIn>
        <FadeIn delay={500}><Text style={styles.value}>{stats.champion}</Text></FadeIn>
      </View>
    )});

    // Curiosidades: cosas del Mundial en sí (los premios de jugadores van en Honores)
    const curiosidades: { emoji: string; label: string; value: string; sub: string }[] = [];
    if (stats.wildest) curiosidades.push({
      emoji: '🤯', label: 'El partido más loco',
      value: `${stats.wildest.homeTeam} ${stats.wildest.homeScore}–${stats.wildest.awayScore} ${stats.wildest.awayTeam}`,
      sub: `${(stats.wildest.homeScore ?? 0) + (stats.wildest.awayScore ?? 0)} goles en un partido`,
    });
    if (stats.surp.match) curiosidades.push({
      emoji: '😱', label: 'La sorpresa del torneo',
      value: `${stats.surp.match.homeTeam} ${stats.surp.match.homeScore}–${stats.surp.match.awayScore} ${stats.surp.match.awayTeam}`,
      sub: `solo un ${Math.round(stats.surp.pct * 100)}% del grupo lo vio venir`,
    });
    if (stats.biggestWin && stats.biggestWin.margin > 0) curiosidades.push({
      emoji: '💥', label: 'La goleada del torneo',
      value: `${stats.biggestWin.home} ${stats.biggestWin.hs}–${stats.biggestWin.as} ${stats.biggestWin.away}`,
      sub: `victoria por ${stats.biggestWin.margin} goles de diferencia`,
    });
    if (stats.topScorerTeam) curiosidades.push({
      emoji: '🥅', label: 'El país más goleador', value: stats.topScorerTeam[0],
      sub: `${stats.topScorerTeam[1].gf} goles anotados en el torneo`,
    });
    if (stats.bestDefense) curiosidades.push({
      emoji: '🧱', label: 'La mejor defensa', value: stats.bestDefense[0],
      sub: `${stats.bestDefense[1].ga} goles encajados en ${stats.bestDefense[1].played} partidos`,
    });
    if (stats.leakiest && stats.leakiest[0] !== stats.bestDefense?.[0]) curiosidades.push({
      emoji: '🕳️', label: 'El coladero', value: stats.leakiest[0],
      sub: `${stats.leakiest[1].ga} goles encajados en ${stats.leakiest[1].played} partidos`,
    });
    if (stats.mostWins && stats.mostWins[1].wins > 0) curiosidades.push({
      emoji: '🔥', label: 'El más ganador', value: stats.mostWins[0],
      sub: `${stats.mostWins[1].wins} victorias en el torneo`,
    });
    curiosidades.push({
      emoji: '📊', label: 'Datos del Mundial',
      value: `${stats.playedCount ? (stats.totalGoals / stats.playedCount).toFixed(2) : '0'} goles/partido`,
      sub: `${stats.muermos} partidos 0-0 · ${stats.tandas} tandas de penaltis`,
    });

    if (curiosidades.length > 0) arr.push({ key: 'curiosidades', render: () => (
      <View style={[styles.slideInner, { paddingTop: 30 }]}>
        <FadeIn><Text style={styles.title}>Curiosidades del Mundial</Text></FadeIn>
        <ScrollView style={{ maxHeight: LIST_MAX_H, width: '100%', marginTop: 14 }} contentContainerStyle={{ gap: 8, paddingBottom: 40 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {curiosidades.map((c, i) => (
            <FadeIn key={c.label} delay={150 + i * 100}>
              <View style={[styles.honorRow, styles.honorRowCompact]}>
                <Text style={styles.honorEmojiSmall}>{c.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.honorLabelSmall}>{c.label}</Text>
                  <Text style={styles.honorValueSmall} numberOfLines={1}>{c.value}</Text>
                  <Text style={styles.honorSubSmall}>{c.sub}</Text>
                </View>
              </View>
            </FadeIn>
          ))}
        </ScrollView>
      </View>
    )});

    const honores: { emoji: string; label: string; value: string; sub: string }[] = [];
    if (stats.nostra && stats.nostra.exactHits > 0) honores.push({ emoji: '🔮', label: 'El Nostradamus', value: stats.nostra.displayName, sub: `${stats.nostra.exactHits} marcadores exactos clavados` });
    if (stats.zeros && stats.zeros.z > 0) honores.push({ emoji: '🫠', label: 'El pupas', value: stats.zeros.name, sub: `${stats.zeros.z} predicciones falladas de pleno` });
    if (stats.best.pts > 0) honores.push({ emoji: '🔥', label: 'La mejor jornada', value: stats.best.name, sub: `${stats.best.pts} pts el ${cap(stats.bestDayLabel)}` });
    if (stats.kingGroup) honores.push({ emoji: '👑', label: 'Rey de la fase de grupos', value: stats.kingGroup.displayName, sub: `${stats.kingGroup.totalPoints} pts en la liguilla` });
    if (stats.kingKo) honores.push({ emoji: '👑', label: 'Rey de la eliminatoria', value: stats.kingKo.displayName, sub: `${stats.kingKo.totalPoints} pts en los cruces` });
    if (stats.sniper) honores.push({ emoji: '🎖️', label: 'El francotirador', value: stats.sniper.name, sub: `${stats.sniper.ratio.toFixed(1)} pts de media por predicción` });
    if (stats.coldBlood) honores.push({ emoji: '🧊', label: 'Sangre fría', value: stats.coldBlood.displayName, sub: `${stats.coldBlood.totalPoints} pts en la eliminatoria` });
    if (stats.faithful) honores.push({ emoji: '🦉', label: 'El más fiel', value: stats.faithful.name, sub: `no dejó ni un partido sin predecir` });
    if (stats.remont.delta > 0) honores.push({ emoji: '📈', label: 'La remontada', value: stats.remont.name, sub: `subió ${stats.remont.delta} puesto${stats.remont.delta > 1 ? 's' : ''} desde la fase de grupos` });
    if (stats.hund.delta < 0) honores.push({ emoji: '📉', label: 'El hundimiento', value: stats.hund.name, sub: `se dejó ${Math.abs(stats.hund.delta)} puesto${Math.abs(stats.hund.delta) > 1 ? 's' : ''} por el camino` });
    if (stats.madr.name) honores.push({ emoji: '⏰', label: 'El madrugador', value: stats.madr.name, sub: `predecía de media ${fmtLead(stats.madr.h)}` });
    if (stats.dorm.name && stats.dorm.name !== stats.madr.name) honores.push({ emoji: '😴', label: 'El dormilón', value: stats.dorm.name, sub: `a última hora: ${fmtLead(stats.dorm.h)}` });
    if (stats.tort.n > 0) honores.push({ emoji: '💑', label: 'Duelo de tortolitos', value: `${stats.tort.a} & ${stats.tort.b}`, sub: `${stats.tort.n} predicciones idénticas… ¿os copiáis? 👀` });

    if (honores.length > 0) arr.push({ key: 'honores', render: () => (
      <View style={[styles.slideInner, { paddingTop: 30 }]}>
        <FadeIn><Text style={styles.title}>Honores del grupo</Text></FadeIn>
        <ScrollView style={{ maxHeight: LIST_MAX_H, width: '100%', marginTop: 14 }} contentContainerStyle={{ gap: 8, paddingBottom: 40 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {honores.map((h, i) => (
            <FadeIn key={h.label} delay={150 + i * 100}>
              <View style={[styles.honorRow, styles.honorRowCompact]}>
                <Text style={styles.honorEmojiSmall}>{h.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.honorLabelSmall}>{h.label}</Text>
                  <Text style={styles.honorValueSmall}>{h.value}</Text>
                  <Text style={styles.honorSubSmall}>{h.sub}</Text>
                </View>
              </View>
            </FadeIn>
          ))}
        </ScrollView>
      </View>
    )});

    if (stats.camino.length > 0) arr.push({ key: 'camino', render: () => (
      <View style={[styles.slideInner, { justifyContent: 'center' }]}>
        <FadeIn><Text style={[styles.emoji, { textAlign: 'center' }]}>🛤️</Text></FadeIn>
        <FadeIn delay={120}><Text style={styles.label}>El camino del campeón</Text></FadeIn>
        <FadeIn delay={220}><Text style={[styles.value, { textAlign: 'center' }]}>{stats.champion}</Text></FadeIn>
        <View style={{ height: 12 }} />
        {stats.camino.map((c, i) => (
          <FadeIn key={i} delay={300 + i * 90} style={{ width: '100%' }}>
            <View style={styles.rankRow}>
              <Text style={styles.caminoRound}>{c.round}</Text>
              <Text style={styles.rankName} numberOfLines={1}>{c.rival}</Text>
              <Text style={styles.rankPts}>{c.gf}-{c.ga}{c.pens ? ' (p)' : ''}</Text>
            </View>
          </FadeIn>
        ))}
      </View>
    )});

    // Ficha de cada jugador, todas en una slide
    arr.push({ key: 'fichas', render: () => (
      <View style={[styles.slideInner, { paddingTop: 24 }]}>
        <Text style={styles.title}>Las fichas del grupo</Text>
        <ScrollView style={{ maxHeight: LIST_MAX_H, width: '100%', marginTop: 12 }} contentContainerStyle={{ gap: 10, paddingBottom: 40 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {stats.perPlayer.map((pl) => (
            <View key={pl.userId} style={styles.fichaCard}>
              <Text style={styles.fichaEmoji}>{pl.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fichaName} numberOfLines={1}>{pl.name} · <Text style={styles.fichaMote}>{pl.mote}</Text></Text>
                {!!pl.motivo && <Text style={styles.fichaMotivo}>{pl.motivo}</Text>}
                <Text style={styles.fichaStats}>{pl.pos}º · {pl.points} pts · {pl.exactHits} exactos</Text>
                <Text style={styles.fichaDay}>🔥 {pl.bestDay.label || '—'} ({pl.bestDay.pts})   ·   🫠 {pl.worstDay.label || '—'} ({pl.worstDay.pts})</Text>
                <Text style={styles.fichaJoke}>{pl.joke}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    )});

    const graciasIndex = arr.length;
    arr.push({ key: 'gracias', render: () => <ThanksSlide teams={ALL_WC_TEAMS} active={index === graciasIndex} /> });

    return arr;
  }, [stats, ranking, index, selectedGroup]);

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, i));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }

  // Solo accesible una vez logueado y con la final del Mundial ya jugada.
  // Esperamos a dataReady para no redirigir con el estado inicial (falso).
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!dataReady) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={T.color.accent} size="large" />
      </View>
    );
  }
  if (!finalDone) return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Barra superior: cerrar + progreso + selector de grupo */}
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {myGroups.length > 1 && (
        <View style={styles.groupChips}>
          {myGroups.map((g) => (
            <Pressable key={g.id} onPress={() => { setSelectedGroup(g); setIndex(0); listRef.current?.scrollToIndex({ index: 0, animated: false }); }}
              style={[styles.chip, selectedGroup?.id === g.id && styles.chipActive]}>
              <Text style={[styles.chipTxt, selectedGroup?.id === g.id && styles.chipTxtActive]}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading || !stats || slides.length === 0 ? (
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={T.color.accent} size="large" />
            : <Text style={styles.sub}>Aún no hay datos suficientes para el resumen.</Text>}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={slides}
            keyExtractor={(s) => s.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={() => {}}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width }]}>{item.render()}</View>
            )}
          />
          {index > 0 && (
            <Pressable style={[styles.arrow, styles.arrowLeft]} onPress={() => goTo(index - 1)} hitSlop={10}>
              <Text style={styles.arrowTxt}>‹</Text>
            </Pressable>
          )}
          {index < slides.length - 1 && (
            <Pressable style={[styles.arrow, styles.arrowRight]} onPress={() => goTo(index + 1)} hitSlop={10}>
              <Text style={styles.arrowTxt}>›</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Slide genérica de "dato curioso"
function SlideCard({ emoji, label, value, sub }: { emoji: string; label: string; value: string; sub: string }) {
  return (
    <View style={styles.center}>
      <FadeIn><Text style={styles.emoji}>{emoji}</Text></FadeIn>
      <FadeIn delay={150}><Text style={styles.label}>{label}</Text></FadeIn>
      <FadeIn delay={300}><Text style={styles.value}>{value}</Text></FadeIn>
      <FadeIn delay={450}><Text style={styles.sub}>{sub}</Text></FadeIn>
    </View>
  );
}

// Slide del podio con revelación 3º → 2º → 1º
function PodiumSlide({ podium, active }: { podium: RankingEntry[]; active: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 500);
    const t2 = setTimeout(() => setStep(2), 1500);
    const t3 = setTimeout(() => setStep(3), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active]);

  const third = podium[2], second = podium[1], first = podium[0];
  return (
    <View style={styles.center}>
      <Text style={[styles.label, { marginBottom: 24 }]}>El podio</Text>
      <View style={{ minHeight: 240, justifyContent: 'flex-end', gap: 14 }}>
        {step >= 1 && third && (
          <FadeIn><PodRow pos="🥉" name={third.displayName} pts={third.totalPoints} sub={`${third.exactHits} exactos · ${third.resultHits} correctos`} /></FadeIn>
        )}
        {step >= 2 && second && (
          <FadeIn><PodRow pos="🥈" name={second.displayName} pts={second.totalPoints} sub={`${second.exactHits} exactos · ${second.resultHits} correctos`} /></FadeIn>
        )}
        {step >= 3 && first && (
          <FadeIn><PodRow pos="🥇" name={first.displayName} pts={first.totalPoints} sub={`${first.exactHits} exactos · ${first.resultHits} correctos`} big /></FadeIn>
        )}
      </View>
      {step >= 3 && <FadeIn delay={200}><Text style={styles.hint}>🎉 ¡Campeón de la porra! 🎉</Text></FadeIn>}
    </View>
  );
}

function PodRow({ pos, name, pts, sub, big }: { pos: string; name: string; pts: number; sub: string; big?: boolean }) {
  return (
    <View style={[styles.podRow, big && styles.podRowBig]}>
      <Text style={styles.podMedal}>{pos}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.podName, big && { fontSize: 22 }]} numberOfLines={1}>{name}</Text>
        <Text style={styles.podSub}>{sub}</Text>
      </View>
      <Text style={[styles.podPts, big && { fontSize: 26 }]}>{pts}</Text>
    </View>
  );
}

// Slide final: agradecimiento + banderas de los 48 países que se van
// "activando" una por segundo (empiezan difuminadas/apagadas).
// Orden de activación aleatorio (barajado), no el orden de la rejilla
function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ThanksSlide({ teams, active }: { teams: string[]; active: boolean }) {
  const [litSet, setLitSet] = useState<Set<number>>(new Set());
  const orderRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active) { setLitSet(new Set()); return; }
    orderRef.current = shuffledIndices(teams.length);
    let i = 0;
    setLitSet(new Set());
    const id = setInterval(() => {
      i++;
      setLitSet(new Set(orderRef.current.slice(0, i)));
      if (i >= teams.length) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [active, teams.length]);

  return (
    <View style={[styles.slideInner, { paddingTop: 30 }]}>
      <FadeIn><Text style={styles.title}>¡Muchas gracias por participar! 🙌</Text></FadeIn>
      <FadeIn delay={200}><Text style={styles.sub}>Nos vemos en el próximo Mundial 🏆</Text></FadeIn>
      <ScrollView style={{ maxHeight: LIST_MAX_H, width: '100%' }} contentContainerStyle={{ alignItems: 'center' }} nestedScrollEnabled showsVerticalScrollIndicator>
        <View style={styles.thanksGrid}>
          {teams.map((t, i) => (
            <ThanksFlag key={t} team={t} active={litSet.has(i)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ThanksFlag({ team, active }: { team: string; active: boolean }) {
  const op = useRef(new Animated.Value(0.2)).current;
  const sc = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: active ? 1 : 0.2, duration: 900, useNativeDriver: true }),
      Animated.timing(sc, { toValue: active ? 1 : 0.9, duration: 900, useNativeDriver: true }),
    ]).start();
  }, [active]);
  return (
    <Animated.View style={{ opacity: op, transform: [{ scale: sc }] }}>
      <Flag team={team} size={30} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  thanksGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24, maxWidth: 420 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 8, gap: 12 },
  dots: { flex: 1, flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: T.color.line },
  dotActive: { backgroundColor: T.color.accent },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: T.color.ink2, fontSize: 20, fontFamily: 'HankenGrotesk_700Bold' },
  groupChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipTxt: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  chipTxtActive: { color: '#fff' },
  slide: { flex: 1 },
  slideInner: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 6 },
  big: { fontSize: 72 },
  emoji: { fontSize: 56, marginBottom: 6 },
  title: { color: T.color.ink, fontSize: 26, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  subtitle: { color: T.color.accent, fontSize: 18, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center' },
  label: { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  value: { color: T.color.ink, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  bigNum: { color: T.color.accent, fontSize: 64, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  sub: { color: T.color.ink2, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },
  hint: { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center', marginTop: 14 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  matchScore: { color: T.color.ink, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.color.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: T.color.line, width: 320, maxWidth: '100%' },
  podRowBig: { backgroundColor: T.color.soft, borderColor: T.color.accent },
  podMedal: { fontSize: 26 },
  podName: { color: T.color.ink, fontSize: 17, fontFamily: 'HankenGrotesk_700Bold' },
  podSub: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },
  podPts: { color: T.color.accent, fontSize: 20, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.color.surface, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: T.color.line },
  rankPos: { width: 22, color: T.color.ink3, fontSize: 14, fontFamily: 'SchibstedGrotesk_700Bold' },
  rankName: { flex: 1, color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  rankPts: { color: T.color.accent, fontSize: 16, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  golDiff: { width: 60, textAlign: 'right', color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  arrow: { position: 'absolute', top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: T.color.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  arrowTxt: { color: T.color.accent, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold', lineHeight: 34, marginTop: -2 },
  moteTag: { color: T.color.accent, fontSize: 17, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center' },
  fichaLine: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', marginVertical: 2 },
  joke: { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', fontStyle: 'italic', textAlign: 'center', marginTop: 18, paddingHorizontal: 8 },
  caminoRound: { width: 96, color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold' },
  fichaCard: { flexDirection: 'row', gap: 12, backgroundColor: T.color.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: T.color.line },
  fichaEmoji: { fontSize: 30 },
  fichaName: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  fichaMote: { color: T.color.accent, fontFamily: 'HankenGrotesk_700Bold' },
  fichaMotivo: { color: T.color.accent, fontSize: 11, fontFamily: 'HankenGrotesk_500Medium', marginTop: 1 },
  fichaStats: { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', marginTop: 1 },
  fichaDay: { color: T.color.ink2, fontSize: 11, fontFamily: 'HankenGrotesk_500Medium', marginTop: 3 },
  fichaJoke: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', fontStyle: 'italic', marginTop: 5 },
  honorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.color.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: T.color.line },
  honorEmoji: { fontSize: 28 },
  honorLabel: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  honorValue: { color: T.color.ink, fontSize: 17, fontFamily: 'SchibstedGrotesk_800ExtraBold', marginTop: 1 },
  honorSub: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', marginTop: 1 },
  honorRowCompact: { padding: 9, borderRadius: 12 },
  honorEmojiSmall: { fontSize: 20 },
  honorLabelSmall: { color: T.color.ink3, fontSize: 10, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  honorValueSmall: { color: T.color.ink, fontSize: 14, fontFamily: 'SchibstedGrotesk_800ExtraBold', marginTop: 0 },
  honorSubSmall: { color: T.color.ink2, fontSize: 11, fontFamily: 'HankenGrotesk_500Medium' },
});
