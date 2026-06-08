import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ALL_MATCHES } from '../constants/matches';
import { Match } from '../types';
import { resolveBracket } from '../lib/bracket';

interface MatchResult {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'upcoming' | 'live' | 'finished';
  penaltyWinner?: 'home' | 'away';
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

    return {
      ...m,
      status: r.status ?? m.status,
      homeScore: rHome ?? m.homeScore,
      awayScore: rAway ?? m.awayScore,
      penaltyWinner: penaltyWinner ?? m.penaltyWinner,
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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'matchResults'), (snap) => {
      const resultMap = new Map<string, MatchResult>();
      snap.docs.forEach((doc) => {
        const d = doc.data() as MatchResult;
        resultMap.set(pairKey(d.homeTeam, d.awayTeam), d);
      });

      let current = ALL_MATCHES;
      for (let i = 0; i < 6; i++) {
        current = resolveBracket(current);      // rellena equipos según clasificación / ganadores
        current = applyResults(current, resultMap); // aplica marcadores ya conocidos
      }

      setMatches(current);
    });

    return unsubscribe;
  }, []);

  return matches;
}
