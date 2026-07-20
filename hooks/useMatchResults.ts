import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ALL_MATCHES } from '../constants/matches';
import { Match } from '../types';
import { resolveBracket, BracketOverrides } from '../lib/bracket';

interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'upcoming' | 'live' | 'finished';
  penaltyWinner?: 'home' | 'away';
  penaltyHome?: number;
  penaltyAway?: number;
  scheduledAt?: string; // hora de inicio real (ISO) desde la API
}

/** Clave de emparejamiento independiente del orden local/visitante. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('__').replace(/\s/g, '_');
}

/**
 * Aplica los resultados (de Firestore) a los partidos. El emparejamiento es
 * independiente del orden local/visitante; si el resultado viene invertido
 * respecto a nuestro partido, se gira el marcador.
 */
function applyResults(matches: Match[], resultMap: Map<string, MatchResult>): Match[] {
  return matches.map((m) => {
    if (m.homeTeam === 'Por definir' || m.awayTeam === 'Por definir') return m;
    const r = resultMap.get(pairKey(m.homeTeam, m.awayTeam));
    if (!r) return m;

    // ¿El resultado viene en el mismo orden que nuestro partido?
    const sameOrder = r.homeTeam === m.homeTeam;

    const rHome = sameOrder ? r.homeScore : r.awayScore;
    const rAway = sameOrder ? r.awayScore : r.homeScore;
    let penaltyWinner = r.penaltyWinner;
    if (penaltyWinner && !sameOrder) penaltyWinner = penaltyWinner === 'home' ? 'away' : 'home';
    const penHome = sameOrder ? r.penaltyHome : r.penaltyAway;
    const penAway = sameOrder ? r.penaltyAway : r.penaltyHome;

    // Un partido solo se considera finalizado/en vivo si tiene marcador.
    // Si llega un estado sin marcador, lo dejamos como estaba (próximo).
    const hasScore = rHome != null && rAway != null;
    const status = hasScore ? (r.status ?? m.status) : m.status;

    return {
      ...m,
      status,
      homeScore: rHome ?? m.homeScore,
      awayScore: rAway ?? m.awayScore,
      penaltyWinner: penaltyWinner ?? m.penaltyWinner,
      penaltyHome: penHome ?? m.penaltyHome,
      penaltyAway: penAway ?? m.penaltyAway,
      scheduledAt: r.scheduledAt ? new Date(r.scheduledAt) : m.scheduledAt,
    };
  });
}

/**
 * Partidos del Mundial con resultados en tiempo real Y eliminatoria resuelta
 * automáticamente a partir de las clasificaciones de grupo.
 *
 * El bucle resuelve una ronda por iteración:
 *  grupos → dieciseisavos → octavos → cuartos → semis → final
 * (6 iteraciones cubren todas las rondas de sobra).
 */
export function useMatchResults(): Match[] {
  const [matches, setMatches] = useState<Match[]>(() => resolveBracket(ALL_MATCHES));
  const resultMapRef = useRef<Map<string, MatchResult>>(new Map());
  const overridesRef = useRef<BracketOverrides>({});

  const recompute = useCallback(() => {
    let current = ALL_MATCHES;
    for (let i = 0; i < 6; i++) {
      current = resolveBracket(current, overridesRef.current); // equipos: clasificación / ganadores / override admin
      current = applyResults(current, resultMapRef.current);   // marcadores ya conocidos
    }
    setMatches(current);
  }, []);

  useEffect(() => {
    const unsubResults = onSnapshot(collection(db, 'matchResults'), (snap) => {
      const resultMap = new Map<string, MatchResult>();
      snap.docs.forEach((d) => {
        const data = d.data() as MatchResult;
        resultMap.set(pairKey(data.homeTeam, data.awayTeam), data);
      });
      resultMapRef.current = resultMap;
      recompute();
    });

    // Override manual del cuadro (admin): doc único config/bracket
    const unsubBracket = onSnapshot(doc(db, 'config', 'bracket'), (snap) => {
      overridesRef.current = snap.exists() ? ((snap.data().slots as BracketOverrides) ?? {}) : {};
      recompute();
    });

    return () => { unsubResults(); unsubBracket(); };
  }, [recompute]);

  return matches;
}

/**
 * ¿Ha llegado ya la primera respuesta real de Firestore para matchResults?
 * A diferencia de un useEffect atado a `liveMatches` (que se dispara también
 * en el primer montaje, con el estado por defecto), esto solo se pone a
 * true DENTRO del callback de onSnapshot, cuando el dato ha llegado de verdad.
 */
export function useMatchResultsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'matchResults'), () => setReady(true));
    return unsub;
  }, []);
  return ready;
}
