import { Prediction, Match, RankingEntry } from '../types';

export function getMatchResult(homeScore: number, awayScore: number): 'home' | 'draw' | 'away' {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

export function calculatePoints(
  prediction: Pick<Prediction, 'homeScore' | 'awayScore'>,
  result: Pick<Match, 'homeScore' | 'awayScore'>
): number {
  if (result.homeScore === undefined || result.awayScore === undefined) return 0;

  if (prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore) {
    return 5;
  }

  const predResult = getMatchResult(prediction.homeScore, prediction.awayScore);
  const actualResult = getMatchResult(result.homeScore, result.awayScore);

  return predResult === actualResult ? 2 : 0;
}

export function buildRanking(
  members: { userId: string; displayName: string; photoURL: string | null }[],
  predictions: Prediction[],
  finishedMatches: Match[]
): RankingEntry[] {
  const resultMap = new Map(finishedMatches.map((m) => [m.id, m]));

  // Goles totales reales del torneo (suma de todos los partidos finalizados)
  const tournamentGoals = finishedMatches.reduce((sum, m) => {
    if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) {
      return sum + m.homeScore + m.awayScore;
    }
    return sum;
  }, 0);

  const goalDiffByUser = new Map<string, number>();

  const entries = members.map(({ userId, displayName, photoURL }) => {
    const userPredictions = predictions.filter((p) => p.userId === userId);
    let totalPoints = 0;
    let exactHits = 0;
    let resultHits = 0;
    let predicted = 0;
    let predictedGoals = 0;

    for (const pred of userPredictions) {
      const match = resultMap.get(pred.matchId);
      if (!match || match.status !== 'finished') continue;

      const pts = calculatePoints(pred, match);
      totalPoints += pts;
      if (pts === 5) exactHits++;
      if (pts === 2) resultHits++;
      predicted++;
      predictedGoals += pred.homeScore + pred.awayScore;
    }

    // Desempate: cuán cerca quedó la suma de goles predichos del total real
    goalDiffByUser.set(userId, Math.abs(predictedGoals - tournamentGoals));

    return { userId, displayName, photoURL, totalPoints, exactHits, resultHits, predicted };
  });

  return entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
    if (b.resultHits !== a.resultHits) return b.resultHits - a.resultHits;
    // Desempate: quien más cerca quedó del nº total de goles del torneo
    const gd = (goalDiffByUser.get(a.userId) ?? 0) - (goalDiffByUser.get(b.userId) ?? 0);
    if (gd !== 0) return gd;
    // A igualdad total: orden alfabético (determinista y estable)
    return a.displayName.localeCompare(b.displayName, 'es');
  });
}
