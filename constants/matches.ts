import { Match } from '../types';
import { venueFor, KNOCKOUT_VENUES, KNOCKOUT_DATES } from './venues';

// Hora neutra para eliminatoria (la real no se sabe hasta tener los equipos)
function koDate(id: string, fallback: string): Date {
  const d = KNOCKOUT_DATES[id];
  return new Date(d ? `${d}T19:00:00Z` : fallback);
}

// FIFA World Cup 2026 — 12 groups (A–L), 4 teams each
// Group stage dates are approximate; update once FIFA publishes official schedule
// Teams from official draw (December 5, 2024)

// Grupos oficiales del sorteo del Mundial 2026 (5 diciembre 2025)
export const GROUPS: Record<string, { teams: string[] }> = {
  A: { teams: ['México', 'Sudáfrica', 'Corea del Sur', 'República Checa'] },
  B: { teams: ['Canadá', 'Bosnia y Herzegovina', 'Catar', 'Suiza'] },
  C: { teams: ['Brasil', 'Marruecos', 'Haití', 'Escocia'] },
  D: { teams: ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'] },
  E: { teams: ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'] },
  F: { teams: ['Países Bajos', 'Japón', 'Suecia', 'Túnez'] },
  G: { teams: ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'] },
  H: { teams: ['España', 'Cabo Verde', 'Arabia Saudita', 'Uruguay'] },
  I: { teams: ['Francia', 'Senegal', 'Irak', 'Noruega'] },
  J: { teams: ['Argentina', 'Argelia', 'Austria', 'Jordania'] },
  K: { teams: ['Portugal', 'RD Congo', 'Uzbekistán', 'Colombia'] },
  L: { teams: ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'] },
};

// Generate group stage matches (6 per group = 72 total)
// Each group: match1(0v1), match2(2v3), match3(0v2), match4(1v3), match5(0v3), match6(1v2)
function generateGroupMatches(): Match[] {
  const matches: Match[] = [];

  const groupMatchPairs = [
    [0, 1], [2, 3],
    [0, 2], [1, 3],
    [0, 3], [1, 2],
  ];

  // Group stage: June 11 – July 2, 2026
  const groupStartDate = new Date('2026-06-11T18:00:00Z');

  Object.entries(GROUPS).forEach(([groupLetter, { teams }], groupIndex) => {
    groupMatchPairs.forEach(([homeIdx, awayIdx], matchIndex) => {
      const date = new Date(groupStartDate);
      date.setDate(date.getDate() + Math.floor(groupIndex / 2) + Math.floor(matchIndex / 2) * 3);

      matches.push({
        id: `group-${groupLetter}-${matchIndex + 1}`,
        homeTeam: teams[homeIdx],
        awayTeam: teams[awayIdx],
        group: groupLetter,
        phase: 'group',
        scheduledAt: date,
        venue: venueFor(teams[homeIdx], teams[awayIdx]) ?? GROUP_VENUES[groupLetter] ?? 'Por confirmar',
        status: 'upcoming',
      });
    });
  });

  return matches;
}

const GROUP_VENUES: Record<string, string> = {
  A: 'SoFi Stadium, Los Ángeles',
  B: 'Estadio Azteca, Ciudad de México',
  C: 'BC Place, Vancouver',
  D: 'MetLife Stadium, Nueva York',
  E: 'AT&T Stadium, Dallas',
  F: 'Levi\'s Stadium, San Francisco',
  G: 'Arrowhead Stadium, Kansas City',
  H: 'Estadio BBVA, Monterrey',
  I: 'Gillette Stadium, Boston',
  J: 'NRG Stadium, Houston',
  K: 'Mercedes-Benz Stadium, Atlanta',
  L: 'Estadio Akron, Guadalajara',
};

// Knockout stage placeholders (teams TBD after group stage)
const KNOCKOUT_MATCHES: Match[] = [
  // Round of 32 (16 matches) — July 4–10, 2026
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `r32-${i + 1}`,
    homeTeam: 'Por definir',
    awayTeam: 'Por definir',
    phase: 'r32' as const,
    scheduledAt: koDate(`r32-${i + 1}`, '2026-06-28T19:00:00Z'),
    venue: KNOCKOUT_VENUES[`r32-${i + 1}`] ?? 'Por confirmar',
    status: 'upcoming' as const,
  })),
  // Round of 16 (8 matches) — July 11–14
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `r16-${i + 1}`,
    homeTeam: 'Por definir',
    awayTeam: 'Por definir',
    phase: 'r16' as const,
    scheduledAt: koDate(`r16-${i + 1}`, '2026-07-04T19:00:00Z'),
    venue: KNOCKOUT_VENUES[`r16-${i + 1}`] ?? 'Por confirmar',
    status: 'upcoming' as const,
  })),
  // Quarterfinals (4 matches) — July 17–18
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `qf-${i + 1}`,
    homeTeam: 'Por definir',
    awayTeam: 'Por definir',
    phase: 'quarter' as const,
    scheduledAt: koDate(`qf-${i + 1}`, '2026-07-09T19:00:00Z'),
    venue: KNOCKOUT_VENUES[`qf-${i + 1}`] ?? 'Por confirmar',
    status: 'upcoming' as const,
  })),
  // Semifinals (2 matches) — July 21–22
  { id: 'sf-1', homeTeam: 'Por definir', awayTeam: 'Por definir', phase: 'semi', scheduledAt: koDate('sf-1', '2026-07-14T19:00:00Z'), venue: KNOCKOUT_VENUES['sf-1'] ?? 'Por confirmar', status: 'upcoming' },
  { id: 'sf-2', homeTeam: 'Por definir', awayTeam: 'Por definir', phase: 'semi', scheduledAt: koDate('sf-2', '2026-07-15T19:00:00Z'), venue: KNOCKOUT_VENUES['sf-2'] ?? 'Por confirmar', status: 'upcoming' },
  // Tercer puesto — 18 julio
  { id: 'third-1', homeTeam: 'Por definir', awayTeam: 'Por definir', phase: 'third', scheduledAt: koDate('third-1', '2026-07-18T19:00:00Z'), venue: KNOCKOUT_VENUES['third-1'] ?? 'Por confirmar', status: 'upcoming' },
  // Final — 19 julio
  { id: 'final-1', homeTeam: 'Por definir', awayTeam: 'Por definir', phase: 'final', scheduledAt: koDate('final-1', '2026-07-19T19:00:00Z'), venue: KNOCKOUT_VENUES['final-1'] ?? 'MetLife Stadium, Nueva York', status: 'upcoming' },
];

export const ALL_MATCHES: Match[] = [
  ...generateGroupMatches(),
  ...KNOCKOUT_MATCHES,
];

export const MATCH_BY_ID: Record<string, Match> = Object.fromEntries(
  ALL_MATCHES.map((m) => [m.id, m])
);

export const PHASE_LABELS: Record<string, string> = {
  group: 'Fase de Grupos',
  r32: 'Ronda de 32',
  r16: 'Octavos de Final',
  quarter: 'Cuartos de Final',
  semi: 'Semifinales',
  third: 'Tercer Lugar',
  final: 'Final',
};
