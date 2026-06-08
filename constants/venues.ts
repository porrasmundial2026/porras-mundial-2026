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
