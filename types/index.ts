export type MatchPhase = 'group' | 'r32' | 'r16' | 'quarter' | 'semi' | 'third' | 'final';
export type MatchStatus = 'upcoming' | 'live' | 'finished';

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  group?: string;
  phase: MatchPhase;
  scheduledAt: Date;
  venue: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  /** En eliminatoria, quién ganó en la tanda de penaltis (si hubo empate). */
  penaltyWinner?: 'home' | 'away';
  /** Marcador de la tanda de penaltis (opcional, solo informativo). */
  penaltyHome?: number;
  penaltyAway?: number;
}

export interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  points?: number;
  updatedAt: Date;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  members: string[];
  createdAt: Date;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
}

export interface RankingEntry {
  userId: string;
  displayName: string;
  photoURL: string | null;
  totalPoints: number;
  exactHits: number;
  resultHits: number;
  predicted: number;
}

export type GroupedMatches = Record<string, Match[]>;
