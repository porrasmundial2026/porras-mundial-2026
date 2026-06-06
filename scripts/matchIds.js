/**
 * Mapa de homeTeam__awayTeam → matchId
 * Generado a partir de los grupos oficiales del sorteo del Mundial 2026
 */

const GROUPS = {
  A: ['México', 'Sudáfrica', 'Corea del Sur', 'República Checa'],
  B: ['Canadá', 'Bosnia y Herzegovina', 'Catar', 'Suiza'],
  C: ['Brasil', 'Marruecos', 'Haití', 'Escocia'],
  D: ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'],
  E: ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'],
  F: ['Países Bajos', 'Japón', 'Suecia', 'Túnez'],
  G: ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'],
  H: ['España', 'Cabo Verde', 'Arabia Saudita', 'Uruguay'],
  I: ['Francia', 'Senegal', 'Irak', 'Noruega'],
  J: ['Argentina', 'Argelia', 'Austria', 'Jordania'],
  K: ['Portugal', 'RD Congo', 'Uzbekistán', 'Colombia'],
  L: ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'],
};

const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];

const MATCH_ID_MAP = {};

// Clave canónica (equipos ordenados) independiente del orden local/visitante
function pairKey(a, b) {
  return [a, b].sort().join('__').replace(/\s/g, '_');
}

Object.entries(GROUPS).forEach(([letter, teams]) => {
  PAIRS.forEach(([hi, ai], idx) => {
    MATCH_ID_MAP[pairKey(teams[hi], teams[ai])] = `group-${letter}-${idx + 1}`;
  });
});

module.exports = MATCH_ID_MAP;
