import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { Match } from '../types';
import { Flag } from './Flag';
import { BRACKET, slotLabel } from '../constants/bracket';
import { C, SHADOW } from '../constants/theme';

// Mapa id de partido -> etiquetas de sus dos huecos (1ºA, Ganador..., etc.)
const SLOTS: Record<string, { home: string; away: string }> = Object.fromEntries(
  BRACKET.map((b) => [b.id, { home: slotLabel(b.home), away: slotLabel(b.away) }])
);

interface Props {
  matches: Match[];
}

const ROUNDS: { key: Match['phase']; label: string }[] = [
  { key: 'r32', label: 'Dieciseisavos' },
  { key: 'r16', label: 'Octavos' },
  { key: 'quarter', label: 'Cuartos' },
  { key: 'semi', label: 'Semis' },
  { key: 'final', label: 'Final' },
];

export function BracketView({ matches }: Props) {
  return (
    // Scroll vertical (por fuera) + horizontal (por dentro): cuadro ancho y alto
    <ScrollView
      showsVerticalScrollIndicator
      style={Platform.OS === 'web' ? ({ maxHeight: '82vh' } as any) : undefined}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.container}>
        {ROUNDS.map(({ key, label }) => {
          const roundMatches = matches.filter((m) => m.phase === key);
          if (roundMatches.length === 0) return null;
          return (
            <View key={key} style={styles.column}>
              <Text style={styles.roundLabel}>{label}</Text>
              <View style={styles.columnInner}>
                {roundMatches.map((m) => <BracketMatchCard key={m.id} match={m} />)}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ScrollView>
  );
}

function BracketMatchCard({ match }: { match: Match }) {
  const isFinished = match.status === 'finished';
  const homeWon = isFinished && (match.homeScore ?? 0) > (match.awayScore ?? 0)
    || (isFinished && match.penaltyWinner === 'home');
  const awayWon = isFinished && (match.awayScore ?? 0) > (match.homeScore ?? 0)
    || (isFinished && match.penaltyWinner === 'away');

  const dateStr = new Date(match.scheduledAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  const slots = SLOTS[match.id];

  return (
    <View style={styles.card}>
      <TeamLine name={match.homeTeam} placeholder={slots?.home} score={match.homeScore} won={homeWon} finished={isFinished} />
      <View style={styles.divider} />
      <TeamLine name={match.awayTeam} placeholder={slots?.away} score={match.awayScore} won={awayWon} finished={isFinished} />
      <View style={styles.metaWrap}>
        <Text style={styles.meta} numberOfLines={1}>{dateStr}</Text>
        {match.venue && match.venue !== 'Por confirmar' && (
          <Text style={styles.metaVenue} numberOfLines={1}>{match.venue}</Text>
        )}
      </View>
    </View>
  );
}

function TeamLine({ name, placeholder, score, won, finished }: { name: string; placeholder?: string; score?: number; won: boolean; finished: boolean }) {
  const tbd = name === 'Por definir';
  return (
    <View style={styles.teamLine}>
      {tbd ? <View style={styles.flagTbd} /> : <Flag team={name} size={18} />}
      <Text style={[styles.teamName, won && styles.teamNameWon, tbd && styles.tbd]} numberOfLines={1}>
        {tbd ? (placeholder ?? 'Por definir') : name}
      </Text>
      {finished && <Text style={[styles.score, won && styles.scoreWon]}>{score}</Text>}
    </View>
  );
}

const CARD_W = 150;

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  column: { width: CARD_W, gap: 8 },
  roundLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  columnInner: { flex: 1, justifyContent: 'space-around', gap: 10 },
  card: { backgroundColor: C.surface, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, ...SHADOW },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  flagTbd: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.border },
  teamName: { flex: 1, color: C.textSecondary, fontSize: 12, fontWeight: '500' },
  teamNameWon: { color: C.textPrimary, fontWeight: '800' },
  tbd: { color: C.textTertiary, fontStyle: 'italic' },
  score: { color: C.textSecondary, fontSize: 13, fontWeight: '700', minWidth: 14, textAlign: 'right' },
  scoreWon: { color: C.accent },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator, marginVertical: 1 },
  metaWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator, marginTop: 4, paddingTop: 4, gap: 1 },
  meta: { color: C.textSecondary, fontSize: 10, fontWeight: '700' },
  metaVenue: { color: C.textTertiary, fontSize: 9 },
});
