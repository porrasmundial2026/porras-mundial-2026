/**
 * Sedes reales de los partidos de fase de grupos del Mundial 2026.
 * La API gratuita no devuelve la sede, así que se cablean aquí desde el
 * calendario oficial. Mapeado por PAREJA de equipos (sin importar el orden).
 *
 * ⚠️ Revisar puntualmente contra la web oficial de FIFA ante cualquier duda.
 */

function vk(a: string, b: string): string {
  return [a, b].sort().join('__');
}

// [equipoA, equipoB, sede]
const RAW: [string, string, string][] = [
  // Grupo A
  ['México', 'Sudáfrica', 'Estadio Azteca, Ciudad de México'],
  ['Corea del Sur', 'República Checa', 'Estadio Akron, Guadalajara'],
  ['México', 'Corea del Sur', 'Estadio Akron, Guadalajara'],
  ['República Checa', 'Sudáfrica', 'Gillette Stadium, Boston'],
  ['Sudáfrica', 'Corea del Sur', 'Estadio BBVA, Monterrey'],
  ['República Checa', 'México', 'Estadio Azteca, Ciudad de México'],
  // Grupo B
  ['Canadá', 'Bosnia y Herzegovina', 'BMO Field, Toronto'],
  ['Catar', 'Suiza', "Levi's Stadium, San Francisco"],
  ['Canadá', 'Catar', 'BC Place, Vancouver'],
  ['Suiza', 'Bosnia y Herzegovina', 'SoFi Stadium, Los Ángeles'],
  ['Bosnia y Herzegovina', 'Catar', 'Lumen Field, Seattle'],
  ['Suiza', 'Canadá', 'BC Place, Vancouver'],
  // Grupo C
  ['Haití', 'Escocia', 'Gillette Stadium, Boston'],
  ['Brasil', 'Marruecos', 'MetLife Stadium, Nueva York'],
  ['Brasil', 'Haití', 'Lincoln Financial Field, Filadelfia'],
  ['Escocia', 'Marruecos', 'Gillette Stadium, Boston'],
  ['Escocia', 'Brasil', 'Hard Rock Stadium, Miami'],
  ['Marruecos', 'Haití', 'Mercedes-Benz Stadium, Atlanta'],
  // Grupo D
  ['Estados Unidos', 'Paraguay', 'SoFi Stadium, Los Ángeles'],
  ['Australia', 'Turquía', 'BC Place, Vancouver'],
  ['Turquía', 'Paraguay', "Levi's Stadium, San Francisco"],
  ['Estados Unidos', 'Australia', 'Lumen Field, Seattle'],
  ['Estados Unidos', 'Turquía', 'SoFi Stadium, Los Ángeles'],
  ['Paraguay', 'Australia', "Levi's Stadium, San Francisco"],
  // Grupo E
  ['Alemania', 'Curazao', 'NRG Stadium, Houston'],
  ['Costa de Marfil', 'Ecuador', 'Lincoln Financial Field, Filadelfia'],
  ['Alemania', 'Costa de Marfil', 'BMO Field, Toronto'],
  ['Ecuador', 'Curazao', 'Arrowhead Stadium, Kansas City'],
  ['Ecuador', 'Alemania', 'MetLife Stadium, Nueva York'],
  ['Curazao', 'Costa de Marfil', 'Lincoln Financial Field, Filadelfia'],
  // Grupo F
  ['Países Bajos', 'Japón', 'AT&T Stadium, Dallas'],
  ['Países Bajos', 'Suecia', 'NRG Stadium, Houston'],
  ['Túnez', 'Japón', 'Estadio BBVA, Monterrey'],
  ['Túnez', 'Países Bajos', 'Arrowhead Stadium, Kansas City'],
  ['Suecia', 'Túnez', 'Estadio BBVA, Monterrey'],
  ['Japón', 'Suecia', 'AT&T Stadium, Dallas'],
  // Grupo G
  ['Bélgica', 'Egipto', 'Lumen Field, Seattle'],
  ['Irán', 'Nueva Zelanda', 'SoFi Stadium, Los Ángeles'],
  ['Bélgica', 'Irán', 'SoFi Stadium, Los Ángeles'],
  ['Nueva Zelanda', 'Egipto', 'BC Place, Vancouver'],
  ['Egipto', 'Irán', 'Lumen Field, Seattle'],
  ['Nueva Zelanda', 'Bélgica', 'BC Place, Vancouver'],
  // Grupo H
  ['España', 'Cabo Verde', 'Mercedes-Benz Stadium, Atlanta'],
  ['Arabia Saudita', 'Uruguay', 'Hard Rock Stadium, Miami'],
  ['España', 'Arabia Saudita', 'Mercedes-Benz Stadium, Atlanta'],
  ['Uruguay', 'Cabo Verde', 'Hard Rock Stadium, Miami'],
  ['Uruguay', 'España', 'Estadio Akron, Guadalajara'],
  ['Cabo Verde', 'Arabia Saudita', 'NRG Stadium, Houston'],
  // Grupo I
  ['Irak', 'Noruega', 'Gillette Stadium, Boston'],
  ['Francia', 'Senegal', 'MetLife Stadium, Nueva York'],
  ['Francia', 'Irak', 'Lincoln Financial Field, Filadelfia'],
  ['Noruega', 'Senegal', 'MetLife Stadium, Nueva York'],
  ['Senegal', 'Irak', 'BMO Field, Toronto'],
  ['Noruega', 'Francia', 'Gillette Stadium, Boston'],
  // Grupo J
  ['Argentina', 'Argelia', 'Arrowhead Stadium, Kansas City'],
  ['Austria', 'Jordania', "Levi's Stadium, San Francisco"],
  ['Jordania', 'Argelia', "Levi's Stadium, San Francisco"],
  ['Argentina', 'Austria', 'AT&T Stadium, Dallas'],
  ['Jordania', 'Argentina', 'AT&T Stadium, Dallas'],
  ['Argelia', 'Austria', 'Arrowhead Stadium, Kansas City'],
  // Grupo K
  ['Uzbekistán', 'Colombia', 'Estadio Azteca, Ciudad de México'],
  ['Portugal', 'RD Congo', 'NRG Stadium, Houston'],
  ['Colombia', 'RD Congo', 'Estadio Akron, Guadalajara'],
  ['Portugal', 'Uzbekistán', 'NRG Stadium, Houston'],
  ['Colombia', 'Portugal', 'Hard Rock Stadium, Miami'],
  ['RD Congo', 'Uzbekistán', 'Mercedes-Benz Stadium, Atlanta'],
  // Grupo L
  ['Inglaterra', 'Croacia', 'AT&T Stadium, Dallas'],
  ['Ghana', 'Panamá', 'BMO Field, Toronto'],
  ['Inglaterra', 'Ghana', 'Gillette Stadium, Boston'],
  ['Panamá', 'Croacia', 'BMO Field, Toronto'],
  ['Panamá', 'Inglaterra', 'MetLife Stadium, Nueva York'],
  ['Croacia', 'Ghana', 'Lincoln Financial Field, Filadelfia'],
];

const MATCH_VENUES: Record<string, string> = Object.fromEntries(
  RAW.map(([a, b, v]) => [vk(a, b), v])
);

export function venueFor(home: string, away: string): string | undefined {
  return MATCH_VENUES[vk(home, away)];
}

/**
 * Sedes de la eliminatoria, por hueco del cuadro (los equipos son TBD pero
 * la sede de cada partido está fijada por FIFA). IDs según constants/bracket.ts.
 */
export const KNOCKOUT_VENUES: Record<string, string> = {
  // Dieciseisavos (M73-M88)
  'r32-1':  'SoFi Stadium, Los Ángeles',
  'r32-2':  'Gillette Stadium, Boston',
  'r32-3':  'Estadio BBVA, Monterrey',
  'r32-4':  'NRG Stadium, Houston',
  'r32-5':  'MetLife Stadium, Nueva York',
  'r32-6':  'AT&T Stadium, Dallas',
  'r32-7':  'Estadio Azteca, Ciudad de México',
  'r32-8':  'Mercedes-Benz Stadium, Atlanta',
  'r32-9':  "Levi's Stadium, San Francisco",
  'r32-10': 'Lumen Field, Seattle',
  'r32-11': 'BMO Field, Toronto',
  'r32-12': 'SoFi Stadium, Los Ángeles',
  'r32-13': 'BC Place, Vancouver',
  'r32-14': 'Hard Rock Stadium, Miami',
  'r32-15': 'Arrowhead Stadium, Kansas City',
  'r32-16': 'AT&T Stadium, Dallas',
  // Octavos (M89-M96)
  'r16-1': 'Lincoln Financial Field, Filadelfia',
  'r16-2': 'NRG Stadium, Houston',
  'r16-3': 'MetLife Stadium, Nueva York',
  'r16-4': 'Estadio Azteca, Ciudad de México',
  'r16-5': 'AT&T Stadium, Dallas',
  'r16-6': 'Lumen Field, Seattle',
  'r16-7': 'Mercedes-Benz Stadium, Atlanta',
  'r16-8': 'BC Place, Vancouver',
  // Cuartos (M97-M100)
  'qf-1': 'Gillette Stadium, Boston',
  'qf-2': 'SoFi Stadium, Los Ángeles',
  'qf-3': 'Hard Rock Stadium, Miami',
  'qf-4': 'Arrowhead Stadium, Kansas City',
  // Semifinales (M101-M102)
  'sf-1': 'AT&T Stadium, Dallas',
  'sf-2': 'Mercedes-Benz Stadium, Atlanta',
  // Tercer puesto (M103) y Final (M104)
  'third-1': 'Hard Rock Stadium, Miami',
  'final-1': 'MetLife Stadium, Nueva York',
};

/**
 * Fechas reales de la eliminatoria (la hora exacta no se conoce hasta tener
 * los equipos; se usa una hora neutra). Calendario oficial Mundial 2026.
 */
export const KNOCKOUT_DATES: Record<string, string> = {
  'r32-1': '2026-06-28', 'r32-2': '2026-06-29', 'r32-3': '2026-06-29', 'r32-4': '2026-06-29',
  'r32-5': '2026-06-30', 'r32-6': '2026-06-30', 'r32-7': '2026-06-30', 'r32-8': '2026-07-01',
  'r32-9': '2026-07-01', 'r32-10': '2026-07-01', 'r32-11': '2026-07-02', 'r32-12': '2026-07-02',
  'r32-13': '2026-07-02', 'r32-14': '2026-07-03', 'r32-15': '2026-07-03', 'r32-16': '2026-07-03',
  'r16-1': '2026-07-04', 'r16-2': '2026-07-04', 'r16-3': '2026-07-05', 'r16-4': '2026-07-05',
  'r16-5': '2026-07-06', 'r16-6': '2026-07-06', 'r16-7': '2026-07-07', 'r16-8': '2026-07-07',
  'qf-1': '2026-07-09', 'qf-2': '2026-07-10', 'qf-3': '2026-07-11', 'qf-4': '2026-07-11',
  'sf-1': '2026-07-14', 'sf-2': '2026-07-15',
  'third-1': '2026-07-18', 'final-1': '2026-07-19',
};
