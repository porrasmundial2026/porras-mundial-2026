import { Match } from '../types';

/** ¿Ha terminado ya la final del Mundial? (dispara el Resumen del torneo). */
export function isFinalFinished(matches: Match[]): boolean {
  return matches.some((m) => m.phase === 'final' && m.status === 'finished');
}
