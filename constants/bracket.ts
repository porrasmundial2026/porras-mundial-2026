/**
 * ===========================================================================
 *  CUADRO DE ELIMINATORIA — Mundial 2026  (estructura OFICIAL FIFA)
 * ===========================================================================
 *  Fuente: bracket oficial FIFA / Wikipedia "2026 FIFA World Cup knockout stage".
 *  Partidos 73-88 = dieciseisavos, 89-96 = octavos, 97-100 = cuartos,
 *  101-102 = semis, 103 = 3er puesto, 104 = final.
 *
 *  Notación de posiciones:
 *    '1A' = primero del grupo A · '2B' = segundo del grupo B
 *    tercero = away, con la lista OFICIAL de grupos de los que puede venir.
 *
 *  Los 8 mejores terceros se asignan a sus cruces respetando esa lista
 *  (es la regla oficial: un grupo no puede repetirse y nadie juega contra
 *  el primero de su propio grupo). Ver lib/bracket.ts → assignThirds().
 * ===========================================================================
 */

export type Slot =
  | { kind: 'first'; group: string }
  | { kind: 'second'; group: string }
  | { kind: 'third'; allowedGroups: string[] }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string };

export interface BracketMatch {
  id: string;
  home: Slot;
  away: Slot;
}

// Etiqueta corta de un partido para referenciarlo (Ganador/Perdedor de...)
function matchShort(id: string): string {
  if (id.startsWith('r32-')) return `16avos ${id.split('-')[1]}`;
  if (id.startsWith('r16-')) return `8vos ${id.split('-')[1]}`;
  if (id.startsWith('qf-'))  return `Cuartos ${id.split('-')[1]}`;
  if (id.startsWith('sf-'))  return `Semi ${id.split('-')[1]}`;
  return id;
}

// Texto legible de un hueco del cuadro cuando el equipo aún no se conoce
export function slotLabel(slot: Slot): string {
  switch (slot.kind) {
    case 'first':  return `1º Grupo ${slot.group}`;
    case 'second': return `2º Grupo ${slot.group}`;
    case 'third':  return `3º (${slot.allowedGroups.join('/')})`;
    case 'winner': return `Ganador ${matchShort(slot.matchId)}`;
    case 'loser':  return `Perdedor ${matchShort(slot.matchId)}`;
  }
}

// --- DIECISEISAVOS (M73-M88) — cruces oficiales ---
export const R32: BracketMatch[] = [
  { id: 'r32-1',  home: { kind: 'second', group: 'A' }, away: { kind: 'second', group: 'B' } },                       // M73
  { id: 'r32-2',  home: { kind: 'first', group: 'E' },  away: { kind: 'third', allowedGroups: ['A','B','C','D','F'] } }, // M74
  { id: 'r32-3',  home: { kind: 'first', group: 'F' },  away: { kind: 'second', group: 'C' } },                       // M75
  { id: 'r32-4',  home: { kind: 'first', group: 'C' },  away: { kind: 'second', group: 'F' } },                       // M76
  { id: 'r32-5',  home: { kind: 'first', group: 'I' },  away: { kind: 'third', allowedGroups: ['C','D','F','G','H'] } }, // M77
  { id: 'r32-6',  home: { kind: 'second', group: 'E' }, away: { kind: 'second', group: 'I' } },                       // M78
  { id: 'r32-7',  home: { kind: 'first', group: 'A' },  away: { kind: 'third', allowedGroups: ['C','E','F','H','I'] } }, // M79
  { id: 'r32-8',  home: { kind: 'first', group: 'L' },  away: { kind: 'third', allowedGroups: ['E','H','I','J','K'] } }, // M80
  { id: 'r32-9',  home: { kind: 'first', group: 'D' },  away: { kind: 'third', allowedGroups: ['B','E','F','I','J'] } }, // M81
  { id: 'r32-10', home: { kind: 'first', group: 'G' },  away: { kind: 'third', allowedGroups: ['A','E','H','I','J'] } }, // M82
  { id: 'r32-11', home: { kind: 'second', group: 'K' }, away: { kind: 'second', group: 'L' } },                       // M83
  { id: 'r32-12', home: { kind: 'first', group: 'H' },  away: { kind: 'second', group: 'J' } },                       // M84
  { id: 'r32-13', home: { kind: 'first', group: 'B' },  away: { kind: 'third', allowedGroups: ['E','F','G','I','J'] } }, // M85
  { id: 'r32-14', home: { kind: 'first', group: 'J' },  away: { kind: 'second', group: 'H' } },                       // M86
  { id: 'r32-15', home: { kind: 'first', group: 'K' },  away: { kind: 'third', allowedGroups: ['D','E','I','J','L'] } }, // M87
  { id: 'r32-16', home: { kind: 'second', group: 'D' }, away: { kind: 'second', group: 'G' } },                       // M88
];

// --- OCTAVOS (M89-M96) — emparejamiento oficial del cuadro ---
export const R16: BracketMatch[] = [
  { id: 'r16-1', home: { kind: 'winner', matchId: 'r32-2' },  away: { kind: 'winner', matchId: 'r32-5' } },  // M89: W74+W77
  { id: 'r16-2', home: { kind: 'winner', matchId: 'r32-1' },  away: { kind: 'winner', matchId: 'r32-3' } },  // M90: W73+W75
  { id: 'r16-3', home: { kind: 'winner', matchId: 'r32-4' },  away: { kind: 'winner', matchId: 'r32-6' } },  // M91: W76+W78
  { id: 'r16-4', home: { kind: 'winner', matchId: 'r32-7' },  away: { kind: 'winner', matchId: 'r32-8' } },  // M92: W79+W80
  { id: 'r16-5', home: { kind: 'winner', matchId: 'r32-11' }, away: { kind: 'winner', matchId: 'r32-12' } }, // M93: W83+W84
  { id: 'r16-6', home: { kind: 'winner', matchId: 'r32-9' },  away: { kind: 'winner', matchId: 'r32-10' } }, // M94: W81+W82
  { id: 'r16-7', home: { kind: 'winner', matchId: 'r32-14' }, away: { kind: 'winner', matchId: 'r32-16' } }, // M95: W86+W88
  { id: 'r16-8', home: { kind: 'winner', matchId: 'r32-13' }, away: { kind: 'winner', matchId: 'r32-15' } }, // M96: W85+W87
];

// --- CUARTOS (M97-M100) ---
export const QF: BracketMatch[] = [
  { id: 'qf-1', home: { kind: 'winner', matchId: 'r16-1' }, away: { kind: 'winner', matchId: 'r16-2' } }, // M97: W89+W90
  { id: 'qf-2', home: { kind: 'winner', matchId: 'r16-5' }, away: { kind: 'winner', matchId: 'r16-6' } }, // M98: W93+W94
  { id: 'qf-3', home: { kind: 'winner', matchId: 'r16-3' }, away: { kind: 'winner', matchId: 'r16-4' } }, // M99: W91+W92
  { id: 'qf-4', home: { kind: 'winner', matchId: 'r16-7' }, away: { kind: 'winner', matchId: 'r16-8' } }, // M100: W95+W96
];

// --- SEMIFINALES (M101-M102) ---
export const SF: BracketMatch[] = [
  { id: 'sf-1', home: { kind: 'winner', matchId: 'qf-1' }, away: { kind: 'winner', matchId: 'qf-2' } }, // M101: W97+W98
  { id: 'sf-2', home: { kind: 'winner', matchId: 'qf-3' }, away: { kind: 'winner', matchId: 'qf-4' } }, // M102: W99+W100
];

// --- TERCER PUESTO (M103) Y FINAL (M104) ---
export const FINALS: BracketMatch[] = [
  { id: 'third-1', home: { kind: 'loser', matchId: 'sf-1' },  away: { kind: 'loser', matchId: 'sf-2' } },
  { id: 'final-1', home: { kind: 'winner', matchId: 'sf-1' }, away: { kind: 'winner', matchId: 'sf-2' } },
];

export const BRACKET: BracketMatch[] = [...R32, ...R16, ...QF, ...SF, ...FINALS];
