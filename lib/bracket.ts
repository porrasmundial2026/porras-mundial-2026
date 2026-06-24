import { Match } from '../types';
import { BRACKET, Slot } from '../constants/bracket';
import { computeAllStandings, AllStandings } from './standings';

const TBD = 'Por definir';

function winnerOf(match: Match | undefined): string | null {
  if (!match || match.status !== 'finished') return null;
  if (match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  // Empate → lo decide la tanda de penaltis (si el admin la marcó)
  if (match.penaltyWinner === 'home') return match.homeTeam;
  if (match.penaltyWinner === 'away') return match.awayTeam;
  return null; // empate sin penaltis definidos → desconocido
}

function loserOf(match: Match | undefined): string | null {
  if (!match || match.status !== 'finished') return null;
  if (match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore > match.awayScore) return match.awayTeam;
  if (match.awayScore > match.homeScore) return match.homeTeam;
  if (match.penaltyWinner === 'home') return match.awayTeam;
  if (match.penaltyWinner === 'away') return match.homeTeam;
  return null;
}

/**
 * Asigna los 8 mejores terceros a sus cruces respetando la lista oficial de
 * grupos permitidos en cada hueco (regla FIFA). Resuelve el emparejamiento
 * con backtracking — son 8 huecos, es instantáneo.
 * Devuelve un mapa "matchId:side" → equipo.
 */
function assignThirds(standings: AllStandings): Map<string, string> {
  const result = new Map<string, string>();
  if (!standings.groupStageComplete) return result;

  // Huecos de tercero presentes en el cuadro (en orden), con sus grupos válidos
  const slots: { matchId: string; side: 'home' | 'away'; allowed: string[] }[] = [];
  for (const bm of BRACKET) {
    if (bm.home.kind === 'third') slots.push({ matchId: bm.id, side: 'home', allowed: bm.home.allowedGroups });
    if (bm.away.kind === 'third') slots.push({ matchId: bm.id, side: 'away', allowed: bm.away.allowedGroups });
  }

  const thirds = standings.bestThirds; // 8 equipos, cada uno con .group
  if (thirds.length < slots.length) return result; // aún no hay 8 terceros

  const assignment = new Array(slots.length).fill(-1); // slot → índice de tercero
  const used = new Array(thirds.length).fill(false);

  // Asignamos primero los huecos más restringidos para acelerar
  const order = slots
    .map((_, i) => i)
    .sort((a, b) => slots[a].allowed.length - slots[b].allowed.length);

  function backtrack(k: number): boolean {
    if (k === order.length) return true;
    const si = order[k];
    for (let ti = 0; ti < thirds.length; ti++) {
      if (!used[ti] && slots[si].allowed.includes(thirds[ti].group)) {
        used[ti] = true;
        assignment[si] = ti;
        if (backtrack(k + 1)) return true;
        used[ti] = false;
        assignment[si] = -1;
      }
    }
    return false;
  }

  if (backtrack(0)) {
    slots.forEach((s, i) => {
      if (assignment[i] >= 0) result.set(`${s.matchId}:${s.side}`, thirds[assignment[i]].team);
    });
  }

  return result;
}

/**
 * Resuelve los equipos de toda la eliminatoria a partir de las clasificaciones
 * de grupo y de los resultados de la propia eliminatoria.
 */
export type BracketOverrides = Record<string, { home?: string; away?: string }>;

export function resolveBracket(allMatches: Match[], overrides: BracketOverrides = {}): Match[] {
  const standings = computeAllStandings(allMatches);
  const thirdAssignment = assignThirds(standings);
  const matchById = new Map(allMatches.map((m) => [m.id, m]));
  const resolved = new Map<string, { home: string; away: string }>();

  function resolveSlot(slot: Slot, matchId: string, side: 'home' | 'away'): string {
    // El override manual del admin tiene prioridad sobre el cálculo automático
    const ov = overrides[matchId]?.[side];
    if (ov) return ov;
    switch (slot.kind) {
      case 'first': {
        const t = standings.byGroup[slot.group];
        return standings.groupComplete[slot.group] && t?.[0] ? t[0].team : TBD;
      }
      case 'second': {
        const t = standings.byGroup[slot.group];
        return standings.groupComplete[slot.group] && t?.[1] ? t[1].team : TBD;
      }
      case 'third':
        return thirdAssignment.get(`${matchId}:${side}`) ?? TBD;
      case 'winner':
        return winnerOf(matchById.get(slot.matchId)) ?? TBD;
      case 'loser':
        return loserOf(matchById.get(slot.matchId)) ?? TBD;
    }
  }

  // BRACKET va en orden R32→...→final, así cada ronda lee las anteriores ya resueltas
  for (const bm of BRACKET) {
    const home = resolveSlot(bm.home, bm.id, 'home');
    const away = resolveSlot(bm.away, bm.id, 'away');
    resolved.set(bm.id, { home, away });

    const existing = matchById.get(bm.id);
    if (existing) matchById.set(bm.id, { ...existing, homeTeam: home, awayTeam: away });
  }

  return allMatches.map((m) => {
    const r = resolved.get(m.id);
    return r ? { ...m, homeTeam: r.home, awayTeam: r.away } : m;
  });
}
