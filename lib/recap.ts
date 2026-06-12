import { Match, Prediction } from '../types';
import { calculatePoints } from './scoring';

interface Member { userId: string; displayName: string }

// Selección estable según una semilla (el día), para que el texto no cambie en cada render
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Genera un resumen humorístico de la última jornada con partidos finalizados.
 * Devuelve null si aún no hay nada que contar.
 */
export function generateDailyRecap(
  members: Member[],
  predictions: Prediction[],
  finishedMatches: Match[],
): string | null {
  if (members.length === 0) return null;

  // Última fecha (día) con partidos finalizados
  const fin = finishedMatches.filter((m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null);

  // Aún no ha empezado / no hay resultados: mensaje de cuenta atrás
  if (fin.length === 0) {
    const FIRST_MATCH = new Date('2026-06-11T19:00:00Z');
    const dayMs = 86400000;
    const startOfDay = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / dayMs);
    const diffDays = startOfDay(FIRST_MATCH) - startOfDay(new Date());
    if (diffDays > 1)  return `⚽ Faltan ${diffDays} días para el Mundial. Ve afinando tus predicciones 🍀`;
    if (diffDays === 1) return `⚽ ¡Mañana empieza el Mundial! Mucha suerte con tus predicciones 🍀`;
    if (diffDays === 0) return `⚽ ¡Hoy arranca el Mundial! Que empiece la porra 🔥🍀`;
    return `⚽ ¡El Mundial ya está en marcha! Mucha suerte 🍀`;
  }

  const dayKey = (m: Match) => {
    const d = new Date(m.scheduledAt);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const latestTime = Math.max(...fin.map((m) => new Date(m.scheduledAt).getTime()));
  const latestDay = dayKey(fin.find((m) => new Date(m.scheduledAt).getTime() === latestTime)!);
  const dayMatches = fin.filter((m) => dayKey(m) === latestDay);
  const dayIds = new Set(dayMatches.map((m) => m.id));
  const matchById = new Map(dayMatches.map((m) => [m.id, m]));

  // Puntos de cada miembro en esa jornada
  const scores = members.map((mem) => {
    const preds = predictions.filter((p) => p.userId === mem.userId && dayIds.has(p.matchId));
    let pts = 0, exact = 0;
    for (const p of preds) {
      const match = matchById.get(p.matchId)!;
      const s = calculatePoints(p, match);
      pts += s;
      if (s === 5) exact++;
    }
    return { name: mem.displayName, pts, exact, predicted: preds.length };
  }).filter((s) => s.predicted > 0);

  if (scores.length === 0) return null;

  const seed = hashStr(latestDay);
  const dateLabel = new Date(dayMatches[0].scheduledAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const best = [...scores].sort((a, b) => b.pts - a.pts)[0];
  const worst = [...scores].sort((a, b) => a.pts - b.pts)[0];

  // Nadie puntuó
  if (best.pts === 0) {
    const lines = [
      `Jornada nefasta: nadie del grupo acertó nada 🤷. ¿Veis el fútbol o jugáis a la lotería?`,
      `Pleno de fallos hoy 🙈. El grupo entero predice mejor el tiempo que los partidos.`,
      `Cero puntos para todos. Día para no hablar del tema en la comida.`,
      `Hoy ha ganado el fútbol y han perdido todos vuestros pronósticos 😅.`,
      `Día de humildad: el casillero de puntos se queda a cero para todo el mundo.`,
      `Ni de casualidad. Hoy el grupo no acertaría ni el día de la semana.`,
      `Borrón y cuenta nueva, porque lo de hoy mejor lo olvidamos 🫠.`,
      `Cero patatero para toda la peña. El fútbol os ha humillado a todos por igual.`,
      `Hoy habéis fallado más que una escopeta de feria 🎯❌.`,
      `Nadie suma. A este paso gana la porra el que menos sepa de fútbol.`,
      `Jornada de empate técnico: todos a cero, todos igual de perdidos.`,
      `Ni con la bola de cristal. Hoy el grupo no daba una.`,
      `El marcador de puntos hoy parece la temperatura de Siberia: bajo cero para todos ❄️.`,
      `Día para invitar a una ronda y que se olvide lo que ha pasado aquí.`,
    ];
    return `📅 ${cap(dateLabel)} — ${pick(lines, seed)}`;
  }

  const heroLines = [
    `${best.name} está intratable 🔥 (+${best.pts} pts). Que alguien le baje los humos.`,
    `Día redondo de ${best.name} 🎯 (+${best.pts} pts). El resto, tomando apuntes.`,
    `${best.name} se ha venido arriba con +${best.pts} pts. Huele a chuleta 🤨.`,
    `${best.name} hoy es el oráculo del grupo (+${best.pts} pts).`,
    `Manda ${best.name} con +${best.pts} pts. Hoy no le tosía nadie.`,
    `${best.name} ha hecho los deberes: +${best.pts} pts y a presumir.`,
    `Recital de ${best.name} hoy (+${best.pts} pts). Empieza a caer mal y todo 😏.`,
    `+${best.pts} pts para ${best.name}. Alguien ha estado viendo mucho fútbol.`,
    `${best.name} se sale: +${best.pts} pts. Lo de hoy tiene nombre y apellidos.`,
    `Bordó la jornada ${best.name} con +${best.pts} pts. Tomad nota, mortales.`,
    `${best.name} en modo máquina: +${best.pts} pts. ¿Pacto con el diablo? 😈`,
    `Hoy el patio es de ${best.name} (+${best.pts} pts). Que disfrute, que mañana se cae.`,
    `${best.name} firma +${best.pts} pts y se va a dormir tranquilo. El resto, rumiando.`,
    `Clase magistral de ${best.name}: +${best.pts} pts. Cobrad entrada la próxima.`,
    `${best.name} arrasó hoy con +${best.pts} pts. Empezad a temerle 😎.`,
    `+${best.pts} pts y liderato moral para ${best.name}. Insoportable va a estar.`,
    `${best.name} la lió: +${best.pts} pts. Hoy adivina hasta lo que cenáis.`,
    `Pleno de acierto para ${best.name} (+${best.pts} pts). Sospechoso, muy sospechoso 🕵️.`,
    `${best.name} no falla: +${best.pts} pts. ¿Seguro que no tienes un primo en la FIFA?`,
    `Día de gloria de ${best.name} con +${best.pts} pts. Que alguien le pinche el globo.`,
  ];
  let text = pick(heroLines, seed);

  if (best.exact > 0) {
    const exactLines = best.exact === 1
      ? [
          `Y encima clavó un marcador exacto.`,
          `De hecho acertó un resultado al dedillo.`,
          `Hasta clavó un exacto, el muy chulo.`,
          `Y bordó un marcador clavado, por si fuera poco.`,
          `Incluso le acertó el resultado exacto a un partido. Tela.`,
          `Y de regalo, un exacto que deja en evidencia a todos.`,
        ]
      : [
          `Y clavó ${best.exact} marcadores exactos.`,
          `Acertó ${best.exact} resultados exactos, ahí es nada.`,
          `${best.exact} exactos en una tarde. De récord.`,
          `Y se sacó ${best.exact} marcadores clavados de la chistera 🎩.`,
          `Con ${best.exact} exactos incluidos. ¿Pero esto es legal?`,
          `${best.exact} resultados al dedillo. Para enmarcarlo.`,
        ];
    text += ` ${pick(exactLines, seed + 2)}`;
  }

  // Mención al peor (si es distinto del mejor y se quedó corto)
  if (worst.name !== best.name && worst.pts <= 2) {
    const loserLines = [
      `Mientras, ${worst.name} mejor que no comente nada 😬.`,
      `Jornada para olvidar de ${worst.name} 🙈.`,
      `${worst.name}, en cambio, predijo cosas que solo pasaron en su cabeza.`,
      `Y a ${worst.name} le ha pasado la jornada por encima como un camión.`,
      `${worst.name} sigue regalando puntos al resto. Un crack de la generosidad.`,
      `Lo de ${worst.name} hoy ha sido más de penalti que de quiniela.`,
      `${worst.name} debería plantearse otra afición que no sea predecir 😅.`,
      `Pobre ${worst.name}, hoy ni una. El grupo le manda un abrazo.`,
      `${worst.name} firma una jornada de las de tirar el móvil al sofá.`,
      `A ${worst.name} le ha salido todo al revés. Hasta el café de la mañana.`,
      `${worst.name} predijo con el corazón y el corazón le ha traicionado 💔.`,
      `Día de barro para ${worst.name}. Mejor cambiamos de tema.`,
      `${worst.name} va camino de pagar la cena de todos a este ritmo 🍽️.`,
      `Lo de ${worst.name} hoy no es mala suerte, es… arte abstracto.`,
      `${worst.name} sigue demostrando que el fútbol es impredecible. Sobre todo para él.`,
      `Y ${worst.name}, como siempre, poniendo la nota cómica de la jornada 🤡.`,
    ];
    text += ` ${pick(loserLines, seed + 1)}`;
  }

  return `📅 ${cap(dateLabel)} — ${text}`;
}
