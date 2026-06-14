import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Platform, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useGroups } from '../../hooks/useGroup';
import { useAuth } from '../../contexts/AuthContext';
import { RankingItem } from '../../components/RankingItem';
import { Podium } from '../../components/Podium';
import { Flag } from '../../components/Flag';
import { buildRanking, calculatePoints } from '../../lib/scoring';
import { generateDailyRecap } from '../../lib/recap';
import { trackScreen } from '../../lib/analytics';
import { FLAG } from '../../constants/flags';
import { Group, Match, Prediction, RankingEntry, UserProfile } from '../../types';
import { T } from '../../constants/theme';
import { useMatchResults } from '../../hooks/useMatchResults';

// react-native-view-shot es nativo: solo se carga en móvil
const canShare = Platform.OS !== 'web';
let ViewShot: any = View;
if (canShare) {
  try { ViewShot = require('react-native-view-shot').default; } catch {}
}

export default function RankingScreen() {
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const liveMatches = useMatchResults();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const shotRef = useRef<any>(null);

  async function shareRanking() {
    try {
      if (!shotRef.current?.capture) return;
      const uri = await shotRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir ranking' });
      }
    } catch {
      // captura cancelada o error
    }
  }
  const [members, setMembers] = useState<{ userId: string; displayName: string; photoURL: string | null }[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const finishedMatches = useMemo(() => liveMatches.filter((m) => m.status === 'finished'), [liveMatches]);

  // Detalle del usuario pulsado: sus predicciones de partidos ya jugados,
  // con el resultado real y los puntos conseguidos (más reciente primero).
  const detailUser = useMemo(() => {
    if (!selectedUserId) return null;
    const name = members.find((m) => m.userId === selectedUserId)?.displayName ?? '?';
    const rows = finishedMatches
      .map((m) => {
        const pred = predictions.find((p) => p.userId === selectedUserId && p.matchId === m.id);
        if (!pred) return null;
        return { match: m, pred, pts: calculatePoints(pred, m) };
      })
      .filter((r): r is { match: Match; pred: Prediction; pts: number } => r !== null)
      .sort((a, b) => new Date(b.match.scheduledAt).getTime() - new Date(a.match.scheduledAt).getTime());
    const total = rows.reduce((s, r) => s + r.pts, 0);
    return { name, rows, total };
  }, [selectedUserId, members, predictions, finishedMatches]);

  const recap = useMemo(
    () => generateDailyRecap(members, predictions, finishedMatches),
    [members, predictions, finishedMatches]
  );

  // Ranking calculado en tiempo real cada vez que cambian partidos o predicciones
  const ranking = useMemo(
    () => buildRanking(members, predictions, finishedMatches),
    [members, predictions, finishedMatches]
  );

  // Estadísticas del grupo
  const groupStats = useMemo(() => {
    if (ranking.length === 0 || finishedMatches.length === 0) return null;
    const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '?';

    // Más exactos (de RankingEntry)
    const topExact = [...ranking].sort((a, b) => b.exactHits - a.exactHits)[0];

    // Partido más/menos acertado por el grupo
    const perMatch = finishedMatches.map((m) => {
      const preds = predictions.filter((p) => p.matchId === m.id);
      let exact = 0, hits = 0;
      for (const p of preds) {
        const pts = calculatePoints(p, m);
        if (pts === 5) exact++;
        if (pts > 0) hits++;
      }
      return { match: m, total: preds.length, exact, hitRate: preds.length ? hits / preds.length : 0 };
    }).filter((s) => s.total > 0);
    const bestMatch  = [...perMatch].sort((a, b) => b.exact - a.exact)[0];
    const worstMatch = [...perMatch].sort((a, b) => a.hitRate - b.hitRate)[0];

    // Partido con más goles (de todos los finalizados)
    const highScoring = [...finishedMatches]
      .filter((m) => m.homeScore !== undefined && m.awayScore !== undefined)
      .sort((a, b) => (b.homeScore! + b.awayScore!) - (a.homeScore! + a.awayScore!))[0];

    return {
      topExact: topExact && topExact.exactHits > 0 ? { name: topExact.displayName, value: topExact.exactHits } : null,
      bestMatch: bestMatch && bestMatch.exact > 0 ? bestMatch : null,
      worstMatch: worstMatch ? worstMatch : null,
      highScoring: highScoring ? highScoring : null,
    };
  }, [ranking, predictions, finishedMatches, members]);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroup) setSelectedGroup(groups[0]);
  }, [groups]);

  // Carga de datos de Firestore: solo cuando cambia el grupo seleccionado
  useFocusEffect(useCallback(() => { trackScreen('Ranking'); }, []));

  useFocusEffect(useCallback(() => {
    if (!selectedGroup) return;
    setLoadingRanking(true);
    async function load() {
      if (!selectedGroup) return;
      const memberDocs = await Promise.all(
        selectedGroup.members.map((uid) => getDoc(doc(db, 'users', uid)))
      );
      setMembers(
        memberDocs
          .filter((d) => d.exists())
          .map((d) => ({ userId: d.id, displayName: (d.data() as UserProfile).displayName, photoURL: (d.data() as UserProfile).photoURL }))
      );
      const predsSnap = await getDocs(
        query(collection(db, 'predictions'), where('userId', 'in', selectedGroup.members))
      );
      setPredictions(predsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Prediction)));
      setLoadingRanking(false);
    }
    load();
  }, [selectedGroup]));

  if (groupsLoading) {
    return <View style={styles.center}><ActivityIndicator color={T.color.accent} size="large" /></View>;
  }

  if (groups.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.title}>Ranking</Text></View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>Únete a un grupo</Text>
          <Text style={styles.emptySub}>El ranking aparece cuando formas parte de un grupo</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ranking</Text>
          {ranking.length > 0 && canShare && (
            <Pressable style={styles.shareBtn} onPress={shareRanking}>
              <Ionicons name="share-social" size={16} color={T.color.accent} />
              <Text style={styles.shareBtnText}>Compartir</Text>
            </Pressable>
          )}
        </View>

        {groups.length > 1 && (
          <FlatList
            horizontal
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ gap: T.space.sm }}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.chip, selectedGroup?.id === item.id && styles.chipActive]}
                onPress={() => setSelectedGroup(item)}
              >
                <Text style={[styles.chipText, selectedGroup?.id === item.id && styles.chipTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        )}

        {selectedGroup && (
          <View style={styles.codeRow}>
            <Text style={styles.codeSub}>Código: </Text>
            <Text style={styles.codeValue}>{selectedGroup.code}</Text>
          </View>
        )}
      </View>

      {loadingRanking ? (
        <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
      ) : ranking.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>Sin datos aún</Text>
          <Text style={styles.emptySub}>El ranking se actualiza cuando terminen los partidos</Text>
        </View>
      ) : (
        <FlatList
          data={ranking.slice(3)}
          keyExtractor={(r) => r.userId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {recap && (
                <View style={styles.recapCard}>
                  <Text style={styles.recapText}>{recap}</Text>
                </View>
              )}
              {groupStats && (
                <View style={styles.statsSection}>
                  <Text style={[styles.statsSectionTitle, { paddingHorizontal: 0, paddingTop: 0 }]}>Destacados del grupo</Text>
                  {groupStats.topExact && (
                    <View style={styles.statCard}>
                      <Text style={styles.statIcon}>🎯</Text>
                      <View style={styles.statTextBlock}>
                        <Text style={styles.statCardLabel}>Jugador con más marcadores exactos</Text>
                        <Text style={styles.statCardValue}>{groupStats.topExact.name} · {groupStats.topExact.value}</Text>
                      </View>
                    </View>
                  )}
                  {groupStats.bestMatch && (
                    <View style={styles.statCard}>
                      <Text style={styles.statIcon}>🔥</Text>
                      <View style={styles.statTextBlock}>
                        <Text style={styles.statCardLabel}>Partido con más marcadores exactos</Text>
                        <Text style={styles.statCardValue}>
                          {FLAG[groupStats.bestMatch.match.homeTeam]} {groupStats.bestMatch.match.homeScore}–{groupStats.bestMatch.match.awayScore} {FLAG[groupStats.bestMatch.match.awayTeam]} · {groupStats.bestMatch.exact}/{groupStats.bestMatch.total} exactos
                        </Text>
                      </View>
                    </View>
                  )}
                  {groupStats.worstMatch && (
                    <View style={styles.statCard}>
                      <Text style={styles.statIcon}>😵</Text>
                      <View style={styles.statTextBlock}>
                        <Text style={styles.statCardLabel}>Partido más fallado</Text>
                        <Text style={styles.statCardValue}>
                          {FLAG[groupStats.worstMatch.match.homeTeam]} {groupStats.worstMatch.match.homeScore}–{groupStats.worstMatch.match.awayScore} {FLAG[groupStats.worstMatch.match.awayTeam]} · {Math.round(groupStats.worstMatch.hitRate * 100)}% acertó
                        </Text>
                      </View>
                    </View>
                  )}
                  {groupStats.highScoring && (
                    <View style={styles.statCard}>
                      <Text style={styles.statIcon}>⚽</Text>
                      <View style={styles.statTextBlock}>
                        <Text style={styles.statCardLabel}>Partido con más goles</Text>
                        <Text style={styles.statCardValue}>
                          {FLAG[groupStats.highScoring.homeTeam]} {groupStats.highScoring.homeScore}–{groupStats.highScoring.awayScore} {FLAG[groupStats.highScoring.awayTeam]} · {groupStats.highScoring.homeScore! + groupStats.highScoring.awayScore!} goles
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
              {ranking.length > 0 && <Podium top3={ranking.slice(0, 3)} currentUserId={user?.uid} onPressUser={setSelectedUserId} />}
              {ranking.length > 3 && <Text style={styles.statsSectionTitle}>Clasificación</Text>}
            </>
          }
          renderItem={({ item, index }) => (
            <RankingItem entry={item} position={index + 4} isCurrentUser={item.userId === user?.uid} onPress={() => setSelectedUserId(item.userId)} />
          )}
        />
      )}

      {/* Tarjeta oculta para capturar y compartir */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
          <View style={styles.shareCard}>
            <Text style={styles.shareTitle}>🏆 {selectedGroup?.name ?? 'Ranking'}</Text>
            <Text style={styles.shareSubtitle}>Porras Mundial 2026</Text>
            <View style={styles.shareDivider} />
            {ranking.map((entry, i) => (
              <View key={entry.userId} style={styles.shareRow}>
                <Text style={[styles.sharePos, i < 3 && styles.sharePosTop]}>{i + 1}</Text>
                <Text style={styles.shareName} numberOfLines={1}>{entry.displayName}</Text>
                <Text style={styles.sharePts}>{entry.totalPoints} pts</Text>
              </View>
            ))}
            <Text style={styles.shareFooter}>Predice. Compite. Gana.</Text>
          </View>
        </ViewShot>
      </View>

      {/* Popup con las predicciones del usuario pulsado */}
      <Modal
        visible={!!selectedUserId}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedUserId(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedUserId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{detailUser?.name}</Text>
            <Text style={styles.modalSub}>{detailUser?.total ?? 0} pts en partidos jugados</Text>

            {detailUser && detailUser.rows.length > 0 ? (
              <ScrollView style={{ maxHeight: 380, marginTop: T.space.sm }} contentContainerStyle={{ gap: 8 }}>
                {detailUser.rows.map((r) => (
                  <View key={r.match.id} style={styles.predRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.predTeamsRow}>
                        <Flag team={r.match.homeTeam} size={16} />
                        <Text style={styles.predTeams} numberOfLines={1}>{r.match.homeTeam} – {r.match.awayTeam}</Text>
                        <Flag team={r.match.awayTeam} size={16} />
                      </View>
                      <Text style={styles.predDetail}>
                        Real {r.match.homeScore}–{r.match.awayScore} · Predijo {r.pred.homeScore}–{r.pred.awayScore}
                      </Text>
                    </View>
                    <Text style={[styles.predPts, r.pts === 5 && styles.predPtsExact, r.pts === 0 && styles.predPtsZero]}>
                      +{r.pts}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.modalEmpty}>Aún no hay partidos jugados con predicción suya.</Text>
            )}

            <Pressable style={styles.closeBtn} onPress={() => setSelectedUserId(null)}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.color.bg },
  header:    { paddingHorizontal: T.space.xl, paddingTop: 56, paddingBottom: T.space.lg, gap: T.space.sm, backgroundColor: T.color.bg },
  titleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { color: T.color.ink, fontSize: 27, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  shareBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.color.soft, borderRadius: T.radius.chip, paddingHorizontal: 12, paddingVertical: 7 },
  shareBtnText: { color: T.color.accent, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  recapCard: { marginHorizontal: T.space.lg, marginTop: T.space.sm, backgroundColor: T.color.soft, borderRadius: T.radius.card, padding: T.space.md },
  recapText: { color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', lineHeight: 20 },
  statsSection: { paddingHorizontal: T.space.lg, paddingTop: T.space.sm, gap: T.space.sm },
  statsSectionTitle: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: T.space.lg, paddingTop: T.space.md, paddingBottom: 4 },
  statCard: { flexDirection: 'row', alignItems: 'center', gap: T.space.md, backgroundColor: T.color.surface, borderRadius: T.radius.card, padding: T.space.md, borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  statIcon: { fontSize: 22 },
  statTextBlock: { flex: 1, gap: 2 },
  statCardLabel: { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  statCardValue: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },
  shareCard: { width: 360, backgroundColor: T.color.surface, padding: 24, gap: 4 },
  shareTitle: { color: T.color.ink, fontSize: 22, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  shareSubtitle: { color: T.color.accent, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', marginBottom: 8 },
  shareDivider: { height: 2, backgroundColor: T.color.soft, marginBottom: 8 },
  shareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: T.color.line },
  sharePos: { width: 28, color: T.color.ink3, fontSize: 15, fontFamily: 'SchibstedGrotesk_700Bold' },
  sharePosTop: { color: T.color.accent },
  shareName: { flex: 1, color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  sharePts: { color: T.color.ink, fontSize: 15, fontFamily: 'SchibstedGrotesk_700Bold' },
  shareFooter: { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', marginTop: 12 },
  chip:       { paddingHorizontal: T.space.md, paddingVertical: T.space.xs, borderRadius: T.radius.chip, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipText:       { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  chipTextActive: { color: '#fff' },
  codeRow:   { flexDirection: 'row', alignItems: 'center' },
  codeSub:   { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium' },
  codeValue: { color: T.color.accent, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  list:      { paddingBottom: 32 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.space.sm, paddingHorizontal: 32 },
  emptyEmoji:{ fontSize: 48 },
  emptyTitle:{ color: T.color.ink, fontSize: 18, fontFamily: 'HankenGrotesk_700Bold' },
  emptySub:  { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: T.space.xl },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: T.color.surface, borderRadius: T.radius.card, padding: T.space.lg },
  modalTitle: { color: T.color.ink, fontSize: 20, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  modalSub: { color: T.color.accent, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  predRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm, backgroundColor: T.color.bg, borderRadius: T.radius.chip, paddingVertical: 8, paddingHorizontal: 10 },
  predTeamsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  predTeams: { flexShrink: 1, color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  predDetail: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', marginTop: 2 },
  predPts: { color: T.color.ink2, fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold', minWidth: 32, textAlign: 'right' },
  predPtsExact: { color: T.color.good },
  predPtsZero: { color: T.color.ink3 },
  modalEmpty: { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', paddingVertical: T.space.lg },
  closeBtn: { marginTop: T.space.md, backgroundColor: T.color.accent, borderRadius: T.radius.chip, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
});
