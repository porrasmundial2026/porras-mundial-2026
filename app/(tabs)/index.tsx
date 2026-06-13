import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, Pressable,
  Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { getDocs, doc, getDoc } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { db } from '../../lib/firebase';
import { MatchCard } from '../../components/MatchCard';
import { usePredictions } from '../../hooks/usePredictions';
import { useGroupPredictions } from '../../hooks/useGroupPredictions';
import { useReactions, reactionKey, toggleReaction } from '../../hooks/useReactions';
import { useMatchResults } from '../../hooks/useMatchResults';
import { useGroups } from '../../hooks/useGroup';
import { useAuth } from '../../contexts/AuthContext';
import { PHASE_LABELS, GROUPS } from '../../constants/matches';
import { calculatePoints } from '../../lib/scoring';
import { trackScreen } from '../../lib/analytics';
import { Match, UserProfile } from '../../types';
import { T } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type PhaseFilter = 'group' | 'knockout';
type SortMode    = 'group' | 'date';

const FILTERS: { key: PhaseFilter; label: string }[] = [
  { key: 'group',    label: 'Grupos' },
  { key: 'knockout', label: 'Eliminatoria' },
];

interface GroupInfo {
  id: string;
  name: string;
  members: { uid: string; displayName: string }[];
}

export default function PrediccionesScreen() {
  const { user } = useAuth();
  const { getPrediction, savePrediction } = usePredictions();
  const liveMatches = useMatchResults();
  const { groups } = useGroups();
  const [filter, setFilter]       = useState<PhaseFilter>('group');
  const [sortMode, setSortMode]   = useState<SortMode>('date');
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  // null = "Mis predicciones"; si no, id del grupo seleccionado
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupInfos, setGroupInfos] = useState<GroupInfo[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Cargar info (nombres de miembros) de cada grupo del usuario
  useFocusEffect(useCallback(() => { trackScreen('Predicciones'); }, []));

  useFocusEffect(useCallback(() => {
    if (!groups.length || !user) { setGroupInfos([]); return; }
    setLoadingMembers(true);
    const allUids = [...new Set(groups.flatMap((g) => g.members))];
    Promise.all(allUids.map((uid) => getDoc(doc(db, 'users', uid)))).then((docs) => {
      const nameMap: Record<string, string> = {};
      docs.filter((d) => d.exists()).forEach((d) => {
        nameMap[d.id] = (d.data() as UserProfile).displayName;
      });
      setGroupInfos(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          members: g.members.map((uid) => ({ uid, displayName: nameMap[uid] ?? 'Usuario' })),
        }))
      );
      setLoadingMembers(false);
    }).catch(() => setLoadingMembers(false));
  }, [groups, user]));

  const selectedGroup = groupInfos.find((g) => g.id === selectedGroupId) ?? null;
  const viewingGroup  = selectedGroup !== null;
  const memberUids    = selectedGroup ? selectedGroup.members.map((m) => m.uid) : [];
  const nameOf        = (uid: string) => selectedGroup?.members.find((m) => m.uid === uid)?.displayName ?? '?';

  const { byMatch, loading: loadingGroupPreds } = useGroupPredictions(memberUids);
  const reactionsByPred = useReactions(viewingGroup ? selectedGroup!.id : null);
  const [reactTarget, setReactTarget] = useState<{ matchId: string; uid: string; name: string } | null>(null);
  const [reactInfo, setReactInfo] = useState<{ matchId: string; uid: string; name: string } | null>(null);

  const REACTION_EMOJIS = ['🔥', '😂', '👑', '🐐', '😱', '🤡', '👏', '🙈'];

  async function handleReact(emoji: string) {
    if (!reactTarget || !user || !selectedGroup) return;
    const t = reactTarget;
    setReactTarget(null);
    try {
      await toggleReaction(
        selectedGroup.id,
        t.matchId,
        { uid: t.uid, name: t.name },
        { uid: user.uid, name: user.displayName ?? 'Alguien' },
        emoji,
      );
    } catch {}
  }

  // Agrupa reacciones de una predicción por emoji con su cuenta
  function aggReactions(matchId: string, targetUid: string) {
    const list = reactionsByPred[reactionKey(matchId, targetUid)] ?? [];
    const counts: Record<string, number> = {};
    for (const r of list) counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    return Object.entries(counts); // [emoji, count][]
  }

  const sections = useMemo(() => {
    let filtered = liveMatches.filter((m) => {
      if (filter === 'group')    return m.phase === 'group';
      if (filter === 'knockout') return m.phase !== 'group';
      return true;
    });

    if (onlyEmpty && !viewingGroup) {
      filtered = filtered.filter((m) => m.status === 'upcoming' && !getPrediction(m.id));
    }

    if (sortMode === 'date' || filter === 'knockout') {
      const sorted = [...filtered].sort((a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
      // Agrupar por día, con cabecera de fecha
      const byDay = new Map<string, Match[]>();
      for (const match of sorted) {
        const d = new Date(match.scheduledAt);
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(match);
      }
      return Array.from(byDay.values()).map((data) => {
        const d = new Date(data[0].scheduledAt);
        let title = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        title = title.charAt(0).toUpperCase() + title.slice(1); // Capitalizar día
        return { title, data, isDate: true };
      });
    }

    const bySection = new Map<string, Match[]>();
    for (const match of filtered) {
      const key = match.phase === 'group' && match.group ? `Grupo ${match.group}` : PHASE_LABELS[match.phase];
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(match);
    }
    return Array.from(bySection.entries()).map(([title, data]) => ({ title, data }));
  }, [filter, sortMode, onlyEmpty, liveMatches, getPrediction, viewingGroup]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Predicciones</Text>

        {/* Selector vista + filtro sin rellenar */}
        <View style={styles.selectorRow}>
          {groupInfos.length > 0 && (
            <Pressable style={styles.userSelector} onPress={() => setModalVisible(true)}>
              <View style={styles.userSelectorLeft}>
                <Ionicons name={viewingGroup ? 'people' : 'person'} size={16} color={T.color.accent} />
                <Text style={styles.userSelectorLabel}>
                  {viewingGroup ? `Predicciones · ${selectedGroup!.name}` : 'Mis predicciones'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={T.color.ink3} />
            </Pressable>
          )}
          {!viewingGroup && (
            <Pressable
              style={[styles.userSelector, onlyEmpty && styles.userSelectorActive]}
              onPress={() => setOnlyEmpty((v) => !v)}
            >
              <Ionicons name={onlyEmpty ? 'filter' : 'filter-outline'} size={14} color={onlyEmpty ? T.color.accentInk : T.color.ink3} />
              <Text style={[styles.userSelectorLabel, onlyEmpty && { color: T.color.accentInk }]}>Sin rellenar</Text>
            </Pressable>
          )}
        </View>

        {/* Filtros de fase */}
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Ordenación */}
        {filter === 'group' && (
          <View style={styles.filters}>
            <Pressable style={[styles.chip, sortMode === 'date' && styles.chipActive]} onPress={() => setSortMode('date')}>
              <Text style={[styles.chipText, sortMode === 'date' && styles.chipTextActive]}>Por fecha</Text>
            </Pressable>
            <Pressable style={[styles.chip, sortMode === 'group' && styles.chipActive]} onPress={() => setSortMode('group')}>
              <Text style={[styles.chipText, sortMode === 'group' && styles.chipTextActive]}>Por grupo</Text>
            </Pressable>
          </View>
        )}
      </View>

      {viewingGroup && loadingGroupPreds ? (
        <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => {
            const { title } = section;
            const isDate = (section as any).isDate;
            const teams = !isDate && title.startsWith('Grupo ') ? GROUPS[title.replace('Grupo ', '')]?.teams.join(' · ') : null;
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {teams && <Text style={styles.sectionSub}>{teams}</Text>}
              </View>
            );
          }}
          renderItem={({ item }) => (
            viewingGroup ? (
              <View style={styles.groupMatchWrap}>
                <MatchCard match={item} prediction={undefined} onSave={async () => {}} readOnly />
                <View style={styles.predsList}>
                  {(() => {
                    const isFinished = item.status === 'finished' && item.homeScore !== undefined && item.awayScore !== undefined;
                    // Ordenar por puntos cuando el partido ha terminado
                    const rows = selectedGroup!.members.map((m) => {
                      const p = byMatch[item.id]?.find((x) => x.userId === m.uid);
                      const pts = isFinished && p ? calculatePoints(p, item as any) : null;
                      return { m, p, pts };
                    });
                    if (isFinished) rows.sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1));
                    return rows.map(({ m, p, pts }) => {
                      const reacts = aggReactions(item.id, m.uid);
                      return (
                        <View key={m.uid} style={styles.predRow}>
                          <View style={styles.predLeft}>
                            <Text style={styles.predName} numberOfLines={1}>{m.displayName}{m.uid === user?.uid ? ' (tú)' : ''}</Text>
                            {reacts.length > 0 && (
                              <Pressable style={styles.reactRow} onPress={() => setReactInfo({ matchId: item.id, uid: m.uid, name: m.displayName })}>
                                {reacts.map(([emoji, count]) => (
                                  <View key={emoji} style={styles.reactChip}>
                                    <Text style={styles.reactEmoji}>{emoji}</Text>
                                    {count > 1 && <Text style={styles.reactCount}>{count}</Text>}
                                  </View>
                                ))}
                              </Pressable>
                            )}
                          </View>
                          <Text style={[styles.predScore, !p && styles.predScoreEmpty]}>
                            {p ? `${p.homeScore} – ${p.awayScore}` : 'Sin predecir'}
                          </Text>
                          {isFinished && p && (
                            <View style={[styles.ptsBadge, pts === 5 ? styles.pts5 : pts === 2 ? styles.pts2 : styles.pts0]}>
                              <Text style={styles.ptsBadgeText}>+{pts}</Text>
                            </View>
                          )}
                          {p && (
                            <Pressable style={styles.reactBtn} onPress={() => setReactTarget({ matchId: item.id, uid: m.uid, name: m.displayName })}>
                              <Ionicons name="happy-outline" size={16} color={T.color.accent} />
                            </Pressable>
                          )}
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            ) : (
              <MatchCard match={item} prediction={getPrediction(item.id)} onSave={savePrediction} />
            )
          )}
        />
      )}

      {/* Modal selector */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ver predicciones</Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => { setSelectedGroupId(null); setModalVisible(false); }}
            >
              <Ionicons name="person" size={20} color={T.color.accent} />
              <Text style={styles.optionName}>Mis predicciones</Text>
              {!viewingGroup && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
            </Pressable>

            {loadingMembers ? (
              <ActivityIndicator color={T.color.accent} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={groupInfos}
                keyExtractor={(g) => g.id}
                renderItem={({ item: g }) => (
                  <Pressable
                    style={styles.optionRow}
                    onPress={() => { setSelectedGroupId(g.id); setModalVisible(false); }}
                  >
                    <Ionicons name="people" size={20} color={T.color.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionName}>Predicciones · {g.name}</Text>
                      <Text style={styles.optionSub}>{g.members.length} miembros</Text>
                    </View>
                    {selectedGroupId === g.id && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
                  </Pressable>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Selector de reacción sobre una predicción */}
      <Modal visible={!!reactTarget} transparent animationType="fade" onRequestClose={() => setReactTarget(null)}>
        <Pressable style={styles.reactOverlay} onPress={() => setReactTarget(null)}>
          <View style={styles.reactSheet}>
            <Text style={styles.reactSheetTitle}>Reaccionar a {reactTarget?.name}</Text>
            <View style={styles.reactGrid}>
              {REACTION_EMOJIS.map((e) => (
                <Pressable key={e} style={styles.reactEmojiBtn} onPress={() => handleReact(e)}>
                  <Text style={styles.reactEmojiBig}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Quién ha reaccionado */}
      <Modal visible={!!reactInfo} transparent animationType="fade" onRequestClose={() => setReactInfo(null)}>
        <Pressable style={styles.reactOverlay} onPress={() => setReactInfo(null)}>
          <View style={styles.reactSheet}>
            <Text style={styles.reactSheetTitle}>Reacciones a {reactInfo?.name}</Text>
            {reactInfo && (reactionsByPred[reactionKey(reactInfo.matchId, reactInfo.uid)] ?? []).map((r) => (
              <View key={r.id} style={styles.whoRow}>
                <Text style={styles.whoEmoji}>{r.emoji}</Text>
                <Text style={styles.whoName}>{r.fromUid === user?.uid ? 'Tú' : r.fromName}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  header: { paddingHorizontal: T.space.xl, paddingTop: 56, paddingBottom: T.space.lg, gap: T.space.md, backgroundColor: T.color.bg },
  title: { color: T.color.ink, fontSize: 27, fontFamily: 'SchibstedGrotesk_800ExtraBold' },

  userSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.color.surface, borderRadius: T.radius.chip, paddingHorizontal: T.space.md, paddingVertical: T.space.sm, borderWidth: 1, borderColor: T.color.line, alignSelf: 'flex-start', gap: T.space.sm },
  userSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  selectorRow: { flexDirection: 'row', gap: T.space.sm, flexWrap: 'wrap' },
  userSelectorActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  userSelectorLabel: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },

  filters: { flexDirection: 'row', gap: T.space.sm },
  chip: { paddingHorizontal: T.space.md, paddingVertical: T.space.xs, borderRadius: T.radius.chip, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipText: { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  chipTextActive: { color: '#fff' },

  list: { paddingHorizontal: T.space.lg, paddingBottom: 32 },
  sectionHeader: { marginTop: T.space.xl, marginBottom: T.space.sm, gap: 2 },
  sectionTitle: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  sectionSub: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },

  // Predicciones de grupo bajo cada partido
  groupMatchWrap: { marginBottom: T.space.sm },
  predsList: { backgroundColor: T.color.surface, borderRadius: T.radius.card, borderWidth: 1, borderColor: T.color.line, borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -8, paddingHorizontal: T.space.md, paddingBottom: T.space.sm, paddingTop: T.space.sm },
  predRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: T.color.line },
  predName: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium' },
  predScore: { color: T.color.accent, fontSize: 13, fontFamily: 'SchibstedGrotesk_700Bold' },
  predScoreEmpty: { color: T.color.ink3, fontFamily: 'HankenGrotesk_400Regular', fontStyle: 'italic' },
  ptsBadge: { marginLeft: T.space.sm, borderRadius: T.radius.chip, paddingHorizontal: 7, paddingVertical: 2, minWidth: 30, alignItems: 'center' },
  ptsBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'HankenGrotesk_700Bold' },
  pts5: { backgroundColor: '#16a34a' },
  pts2: { backgroundColor: '#d97706' },
  pts0: { backgroundColor: '#dc2626' },
  predLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  reactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: T.color.line },
  whoEmoji: { fontSize: 20 },
  whoName: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  reactBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.color.soft, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  reactChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: T.color.bg, borderRadius: T.radius.chip, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: T.color.line },
  reactEmoji: { fontSize: 13 },
  reactCount: { color: T.color.ink2, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold' },
  reactOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  reactSheet: { backgroundColor: T.color.surface, borderRadius: 20, padding: 20, width: '100%', maxWidth: 360, gap: 14 },
  reactSheetTitle: { color: T.color.ink, fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold', textAlign: 'center' },
  reactGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  reactEmojiBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: T.color.bg, alignItems: 'center', justifyContent: 'center' },
  reactEmojiBig: { fontSize: 26 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: T.color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: T.space.xl, paddingTop: T.space.md, paddingBottom: 40, maxHeight: '75%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.color.line, alignSelf: 'center', marginBottom: T.space.lg },
  modalTitle: { color: T.color.ink, fontSize: 17, fontFamily: 'SchibstedGrotesk_700Bold', marginBottom: T.space.sm },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.md, paddingVertical: T.space.md, borderBottomWidth: 1, borderBottomColor: T.color.line },
  optionName: { flex: 1, color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  optionSub: { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_400Regular' },
});
