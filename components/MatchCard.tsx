import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Match, Prediction } from '../types';
import { Flag } from './Flag';
import { T } from '../constants/theme';
import { calculatePoints } from '../lib/scoring';

interface Props {
  match: Match;
  prediction?: Prediction;
  onSave: (matchId: string, home: number, away: number) => Promise<void>;
  readOnly?: boolean;
}

export function MatchCard({ match, prediction, onSave, readOnly = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [homeInput, setHomeInput] = useState(prediction?.homeScore?.toString() ?? '');
  const [awayInput, setAwayInput] = useState(prediction?.awayScore?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const isUpcoming = match.status === 'upcoming';
  const isFinished = match.status === 'finished';
  const isLive     = match.status === 'live';
  const teamsKnown = match.homeTeam !== 'Por definir' && match.awayTeam !== 'Por definir';
  // El partido cierra cuando llega su hora de inicio, aunque la API/admin no lo haya marcado aún
  const hasStarted = new Date(match.scheduledAt).getTime() <= Date.now();
  const isPredictable = isUpcoming && teamsKnown && !readOnly && !hasStarted;
  const hasPred = prediction != null;
  // Calcular puntos en tiempo real desde el resultado actual, no del campo almacenado
  const pts = isFinished && hasPred && match.homeScore !== undefined && match.awayScore !== undefined
    ? calculatePoints(prediction!, match as Pick<Match, 'homeScore' | 'awayScore'>)
    : prediction?.points;

  function handlePress() {
    if (!isPredictable) return;
    setHomeInput(prediction?.homeScore?.toString() ?? '');
    setAwayInput(prediction?.awayScore?.toString() ?? '');
    setExpanded((e) => !e);
  }

  async function handleSave() {
    if (!homeInput || !awayInput) return;
    setSaving(true);
    try {
      await onSave(match.id, parseInt(homeInput, 10), parseInt(awayInput, 10));
      setExpanded(false);
    } catch {
      // offline: Firestore guarda en caché
    } finally {
      setSaving(false);
    }
  }

  const dateStr = new Date(match.scheduledAt).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = new Date(match.scheduledAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
     <Pressable onPress={handlePress} disabled={!isPredictable}>
      {/* Equipos */}
      <View style={styles.teamsRow}>
        <View style={styles.team}>
          <Flag team={match.homeTeam} size={34} />
          <Text style={styles.teamName} numberOfLines={2}>{match.homeTeam}</Text>
        </View>

        <View style={styles.center}>
          {isFinished || isLive ? (
            <>
              <Text style={[styles.score, isFinished && styles.scoreFinal]}>{match.homeScore} – {match.awayScore}</Text>
              {isLive
                ? <View style={styles.liveBadge}><Text style={styles.liveText}>EN VIVO</Text></View>
                : <Text style={styles.finLabel}>FIN</Text>}
            </>
          ) : (
            <>
              <Text style={styles.time}>{timeStr}</Text>
              <Text style={styles.dateSmall}>{dateStr}</Text>
            </>
          )}
        </View>

        <View style={[styles.team, styles.teamRight]}>
          <Flag team={match.awayTeam} size={34} />
          <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>{match.awayTeam}</Text>
        </View>
      </View>

      {/* Separador */}
      <View style={styles.divider} />

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.venue} numberOfLines={1}>{match.venue}</Text>
        <View style={styles.footerRight}>
          {isFinished && hasPred && pts != null ? (
            <View style={styles.footerRow}>
              <View style={styles.predBadge}>
                <Text style={styles.predText}>Tu pred · {prediction!.homeScore}–{prediction!.awayScore}</Text>
              </View>
              {pts === 5 ? (
                <View style={styles.exactBadge}><Text style={styles.exactText}>+5 pts</Text></View>
              ) : pts === 2 ? (
                <View style={styles.resultBadge}><Text style={styles.resultText}>+2 pts</Text></View>
              ) : (
                <View style={styles.missBadge}><Text style={styles.missText}>0 pts</Text></View>
              )}
            </View>
          ) : hasPred ? (
            <View style={styles.predBadge}>
              <Text style={styles.predText}>Tu pred · {prediction!.homeScore}–{prediction!.awayScore}</Text>
            </View>
          ) : isPredictable ? (
            <View style={styles.ctaBtn}>
              <Text style={styles.ctaText}>Predecir ✏️</Text>
            </View>
          ) : isUpcoming && !teamsKnown ? (
            <Text style={styles.pendingText}>Por definir</Text>
          ) : hasStarted && !hasPred && teamsKnown ? (
            <Text style={styles.pendingText}>Cerrado</Text>
          ) : null}
        </View>
      </View>
     </Pressable>

      {/* Input inline */}
      {expanded && isPredictable && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={homeInput}
            onChangeText={setHomeInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="0"
            placeholderTextColor={T.color.ink3}
            selectTextOnFocus
            autoFocus
          />
          <Text style={styles.dash}>–</Text>
          <TextInput
            style={styles.input}
            value={awayInput}
            onChangeText={setAwayInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="0"
            placeholderTextColor={T.color.ink3}
            selectTextOnFocus
          />
          <Pressable
            style={[styles.saveBtn, (!homeInput || !awayInput || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!homeInput || !awayInput || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Guardar</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.card,
    padding: 15,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: T.color.line,
    ...T.shadow,
  },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  team:      { flex: 1, alignItems: 'flex-start', gap: T.space.xs },
  teamRight: { alignItems: 'flex-end' },
  teamName:  { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', lineHeight: 18 },
  teamNameRight: { textAlign: 'right' },
  center:    { width: 80, alignItems: 'center', gap: 2 },
  score:     { color: T.color.ink, fontSize: 22, fontFamily: 'SchibstedGrotesk_700Bold' },
  scoreFinal:{ color: T.color.good },
  finLabel:  { color: T.color.ink3, fontSize: 10, fontFamily: 'HankenGrotesk_500Medium', letterSpacing: 0.8 },
  time:      { color: T.color.ink, fontSize: 18, fontFamily: 'SchibstedGrotesk_700Bold' },
  dateSmall: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_500Medium' },
  liveBadge: { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveText:  { color: T.color.danger, fontSize: 10, fontFamily: 'HankenGrotesk_700Bold', letterSpacing: 0.5 },
  divider:   { height: 1, backgroundColor: T.color.line },
  footer:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  venue:     { flex: 1, color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },
  footerRight: { flexShrink: 0 },
  footerRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  predBadge:   { backgroundColor: T.color.soft, borderRadius: T.radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  predText:    { color: T.color.accent, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  ctaBtn:      { backgroundColor: T.color.accent, borderRadius: T.radius.chip, paddingHorizontal: 12, paddingVertical: 5 },
  ctaText:     { color: '#fff', fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  exactBadge:  { backgroundColor: '#16a34a', borderRadius: T.radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  exactText:   { color: '#fff', fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  resultBadge: { backgroundColor: '#d97706', borderRadius: T.radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  resultText:  { color: '#fff', fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  missBadge:   { backgroundColor: '#dc2626', borderRadius: T.radius.chip, paddingHorizontal: 10, paddingVertical: 4 },
  missText:    { color: '#fff', fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  pendingText: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular', fontStyle: 'italic' },
  resultRow:   { borderTopWidth: 1, borderTopColor: T.color.line, paddingTop: 6 },
  resultInfo:  { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.color.line },
  input: {
    width: 52, height: 48,
    backgroundColor: T.color.bg,
    borderRadius: 12, borderWidth: 1, borderColor: T.color.line,
    color: T.color.ink, fontSize: 24, fontFamily: 'SchibstedGrotesk_700Bold', textAlign: 'center',
  },
  dash:           { color: T.color.ink3, fontSize: 20 },
  saveBtn:        { flex: 1, backgroundColor: T.color.accent, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled:{ opacity: 0.3 },
  saveBtnText:    { color: '#fff', fontFamily: 'HankenGrotesk_700Bold', fontSize: 15 },
});
