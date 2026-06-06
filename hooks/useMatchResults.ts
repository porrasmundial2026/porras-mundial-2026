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

/**
 * Aplica los resultados (de Firestore) a los partidos, emparejando por
 * nombre de equipo. Solo encajan los partidos cuyos equipos ya se conocen.
 */
function applyResults(matches: Match[], resultMap: Map<string, MatchResult>): Match[] {
  return matches.map((m) => {
    if (m.homeTeam === 'Por definir' || m.awayTeam === 'Por definir') return m;
    const key = `${m.homeTeam}__${m.awayTeam}`.replace(/\s/g, '_');
    const r = resultMap.get(key);
    if (!r) return m;
    return {
      ...m,
      // Solo sobrescribimos lo que venga definido (un doc puede tener solo la hora)
      status: r.status ?? m.status,
      homeScore: r.homeScore ?? m.homeScore,
      awayScore: r.awayScore ?? m.awayScore,
      penaltyWinner: r.penaltyWinner ?? m.penaltyWinner,
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
        const key = `${d.homeTeam}__${d.awayTeam}`.replace(/\s/g, '_');
        resultMap.set(key, d);
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
