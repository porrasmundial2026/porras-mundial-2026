import { Match } from '../types';
import { GROUPS } from '../constants/matches';

export interface TeamStanding {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;       // goles a favor
  ga: number;       // goles en contra
  gd: number;       // diferencia de goles
  points: number;
}

/**
 * Calcula la clasificación de un grupo a partir de los partidos jugados.
 * Orden: puntos → diferencia de goles → goles a favor → alfabético (desempate simple).
 * Nota: la FIFA usa más criterios (enfrentamiento directo, fair play, sorteo),
 * pero para una porras esto es una aproximación más que suficiente.
 */
export function computeGroupStanding(groupLetter: string, matches: Match[]): TeamStanding[] {
  const teams = GROUPS[groupLetter]?.teams ?? [];
  const table = new Map<string, TeamStanding>();

  for (const team of teams) {
    table.set(team, {
      team, group: groupLetter,
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, gd: 0, points: 0,
    });
  }

  // Cuenta partidos finalizados Y en vivo (la clasificación refleja el directo)
  const groupMatches = matches.filter(
    (m) => m.group === groupLetter && (m.status === 'finished' || m.status === 'live')
      && m.homeScore != null && m.awayScore != null
  );

  for (const m of groupMatches) {
    const home = table.get(m.homeTeam);
    const away = table.get(m.awayTeam);
    if (!home || !away) continue;

    const hs = m.homeScore!;
    const as = m.awayScore!;

    home.played++; away.played++;
    home.gf += hs; home.ga += as;
    away.gf += as; away.ga += hs;

    if (hs > as) {
      home.won++; home.points += 3; away.lost++;
    } else if (hs < as) {
      away.won++; away.points += 3; home.lost++;
    } else {
      home.drawn++; away.drawn++;
      home.points += 1; away.points += 1;
    }
  }

  for (const s of table.values()) s.gd = s.gf - s.ga;

  return Array.from(table.values()).sort(compareStandings);
}

function compareStandings(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.team.localeCompare(b.team);
}

export interface AllStandings {
  byGroup: Record<string, TeamStanding[]>;
  /** ¿Han terminado TODOS los partidos de grupo? */
  groupStageComplete: boolean;
  /** Los 8 mejores terceros, ordenados de mejor a peor. */
  bestThirds: TeamStanding[];
}

export function computeAllStandings(matches: Match[]): AllStandings {
  const groupLetters = Object.keys(GROUPS);
  const byGroup: Record<string, TeamStanding[]> = {};

  for (const g of groupLetters) {
    byGroup[g] = computeGroupStanding(g, matches);
  }

  // ¿Todos los 72 partidos de grupo finalizados?
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const groupStageComplete = groupMatches.length > 0
    && groupMatches.every((m) => m.status === 'finished');

  // Ranking de los 12 terceros → los 8 mejores
  const thirds = groupLetters
    .map((g) => byGroup[g][2])
    .filter(Boolean)
    .sort(compareStandings);

  const bestThirds = thirds.slice(0, 8);

  return { byGroup, groupStageComplete, bestThirds };
}
