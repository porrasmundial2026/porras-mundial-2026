import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, Pressable,
  Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { getDocs, doc, getDoc } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { db } from '../../lib/firebase';
import { MatchCard } from '../../components/MatchCard';
import { usePredictions } from '../../hooks/usePredictions';
import { useUserPredictions } from '../../hooks/useUserPredictions';
import { useMatchResults } from '../../hooks/useMatchResults';
import { useGroups } from '../../hooks/useGroup';
import { useAuth } from '../../contexts/AuthContext';
import { PHASE_LABELS, GROUPS } from '../../constants/matches';
import { Match, UserProfile } from '../../types';
import { T } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type PhaseFilter = 'group' | 'knockout' | 'all';
type SortMode   = 'group' | 'date';

const FILTERS: { key: PhaseFilter; label: string }[] = [
  { key: 'group',    label: 'Grupos' },
  { key: 'knockout', label: 'Eliminatoria' },
];

interface Member { uid: string; displayName: string }
interface GroupSection { groupId: string; groupName: string; members: Member[] }

export default function PrediccionesScreen() {
  const { user } = useAuth();
  const { getPrediction, savePrediction } = usePredictions();
  const liveMatches = useMatchResults();
  const { groups } = useGroups();
  const [filter, setFilter]     = useState<PhaseFilter>('group');
  const [sortMode, setSortMode] = useState<SortMode>('group');
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  // Selector de usuario
  const [groupSections, setGroupSections] = useState<GroupSection[]>([]);
  const [selectedUid, setSelectedUid]     = useState<string | null>(null); // null = yo
  const [modalVisible, setModalVisible]   = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const { getPrediction: getOtherPred, loading: loadingOther } = useUserPredictions(selectedUid);

  // Cargar miembros agrupados por grupo (se recarga al volver a la pestaña)
  useFocusEffect(useCallback(() => {
    if (!groups.length || !user) return;
    setLoadingMembers(true);

    const otherGroups = groups.filter((g) => g.members.some((uid) => uid !== user.uid));
    const allUids = [...new Set(otherGroups.flatMap((g) => g.members).filter((uid) => uid !== user.uid))];
    if (!allUids.length) { setLoadingMembers(false); return; }

    Promise.all(allUids.map((uid) => getDoc(doc(db, 'users', uid)))).then((docs) => {
      const profileMap: Record<string, string> = {};
      docs.filter((d) => d.exists()).forEach((d) => {
        profileMap[d.id] = (d.data() as UserProfile).displayName;
      });

      setGroupSections(
        otherGroups.map((g) => ({
          groupId: g.id,
          groupName: g.name,
          members: g.members
            .filter((uid) => uid !== user.uid && profileMap[uid])
            .map((uid) => ({ uid, displayName: profileMap[uid] })),
        })).filter((s) => s.members.length > 0)
      );
      setLoadingMembers(false);
    });
  }, [groups, user]));

  const viewingOther   = selectedUid !== null;
  const allMembers     = groupSections.flatMap((s) => s.members);
  const hasMembers     = groupSections.length > 0;
  const selectedName   = allMembers.find((m) => m.uid === selectedUid)?.displayName ?? 'Yo';
  const selectedGroup  = groupSections.find((s) => s.members.some((m) => m.uid === selectedUid))?.groupName;
  const activePred    = viewingOther ? getOtherPred : getPrediction;

  const sections = useMemo(() => {
    let filtered = liveMatches.filter((m) => {
      if (filter === 'group')    return m.phase === 'group';
      if (filter === 'knockout') return m.phase !== 'group';
      return true;
    });

    // Filtrar solo no rellenas (solo aplica en mis predicciones)
    if (onlyEmpty && !viewingOther) {
      filtered = filtered.filter((m) => m.status === 'upcoming' && !getPrediction(m.id));
    }

    if (sortMode === 'date' || filter === 'knockout') {
      // Sección única ordenada por fecha
      const sorted = [...filtered].sort((a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
      return [{ title: 'Por fecha', data: sorted }];
    }

    // Ordenación por grupo (comportamiento original)
    const bySection = new Map<string, Match[]>();
    for (const match of filtered) {
      const key = match.phase === 'group' && match.group
        ? `Grupo ${match.group}`
        : PHASE_LABELS[match.phase];
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(match);
    }
    return Array.from(bySection.entries()).map(([title, data]) => ({ title, data }));
  }, [filter, sortMode, onlyEmpty, liveMatches, getPrediction, viewingOther]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Predicciones</Text>

        {/* Selector de usuario + filtro sin rellenar */}
        <View style={styles.selectorRow}>
        {hasMembers && (
          <Pressable style={styles.userSelector} onPress={() => setModalVisible(true)}>
            <View style={styles.userSelectorLeft}>
              <View style={[styles.avatarSmall, viewingOther && { backgroundColor: T.color.line }]}>
                <Text style={[styles.avatarSmallText, viewingOther && { color: T.color.ink }]}>
                  {viewingOther ? selectedName.charAt(0).toUpperCase() : (user?.displayName ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.userSelectorLabel}>
                  {viewingOther ? selectedName : 'Mis predicciones'}
                </Text>
                {viewingOther && selectedGroup && (
                  <Text style={styles.userSelectorGroup}>{selectedGroup}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-down" size={16} color={T.color.ink3} />
          </Pressable>
        )}
        {!viewingOther && (
          <Pressable
            style={[styles.userSelector, onlyEmpty && styles.userSelectorActive]}
            onPress={() => setOnlyEmpty((v) => !v)}
          >
            <Ionicons
              name={onlyEmpty ? 'filter' : 'filter-outline'}
              size={14}
              color={onlyEmpty ? T.color.accentInk : T.color.ink3}
            />
            <Text style={[styles.userSelectorLabel, onlyEmpty && { color: T.color.accentInk }]}>
              Sin rellenar
            </Text>
          </Pressable>
        )}
        </View>

        {/* Filtros de fase */}
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.chip, filter === f.key && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Ordenación y filtro vacías */}
        <View style={styles.filters}>
          {filter === 'group' && (
            <>
              <Pressable
                style={[styles.chip, sortMode === 'group' && styles.chipActive]}
                onPress={() => setSortMode('group')}
              >
                <Text style={[styles.chipText, sortMode === 'group' && styles.chipTextActive]}>Por grupo</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, sortMode === 'date' && styles.chipActive]}
                onPress={() => setSortMode('date')}
              >
                <Text style={[styles.chipText, sortMode === 'date' && styles.chipTextActive]}>Por fecha</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {loadingOther ? (
        <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{title}</Text>
              {filter === 'group' && (
                <Text style={styles.sectionSub}>
                  {GROUPS[title.replace('Grupo ', '')]?.teams.join(' · ')}
                </Text>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <MatchCard
              match={item}
              prediction={activePred(item.id)}
              onSave={viewingOther ? async () => {} : savePrediction}
              readOnly={viewingOther}
            />
          )}
        />
      )}

      {/* Modal selector */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ver predicciones de</Text>

            {/* Opción: yo */}
            <Pressable
              style={[styles.memberRow, !viewingOther && styles.memberRowActive]}
              onPress={() => { setSelectedUid(null); setModalVisible(false); }}
            >
              <View style={[styles.memberAvatar, { backgroundColor: T.color.accent }]}>
                <Text style={styles.memberAvatarText}>{(user?.displayName ?? '?').charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.memberName}>Mis predicciones</Text>
              {!viewingOther && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
            </Pressable>

            {loadingMembers ? (
              <ActivityIndicator color={T.color.accent} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={groupSections}
                keyExtractor={(s) => s.groupId}
                renderItem={({ item: section }) => (
                  <View>
                    <Text style={styles.groupHeader}>{section.groupName}</Text>
                    {section.members.map((m) => (
                      <Pressable
                        key={m.uid}
                        style={styles.memberRow}
                        onPress={() => { setSelectedUid(m.uid); setModalVisible(false); }}
                      >
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>{m.displayName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={styles.memberName}>{m.displayName}</Text>
                        {selectedUid === m.uid && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
                      </Pressable>
                    ))}
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  header: {
    paddingHorizontal: T.space.xl,
    paddingTop: 56,
    paddingBottom: T.space.lg,
    gap: T.space.md,
    backgroundColor: T.color.bg,
  },
  title: { color: T.color.ink, fontSize: 27, fontFamily: 'SchibstedGrotesk_800ExtraBold' },

  // Selector usuario
  userSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.color.surface,
    borderRadius: T.radius.chip,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm,
    borderWidth: 1,
    borderColor: T.color.line,
    alignSelf: 'flex-start',
    gap: T.space.sm,
  },
  userSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  avatarSmall:      { width: 24, height: 24, borderRadius: 12, backgroundColor: T.color.soft, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText:  { color: T.color.accent, fontSize: 12, fontFamily: 'SchibstedGrotesk_700Bold' },
  selectorRow:      { flexDirection: 'row', gap: T.space.sm, flexWrap: 'wrap' },
  userSelectorActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  userSelectorLabel:{ color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  userSelectorGroup:{ color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },

  // Filtros
  filters: { flexDirection: 'row', gap: T.space.sm },
  chip:       { paddingHorizontal: T.space.md, paddingVertical: T.space.xs, borderRadius: T.radius.chip, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipText:       { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  chipTextActive: { color: '#fff' },

  list: { paddingHorizontal: T.space.lg, paddingBottom: 32 },
  sectionHeader: { marginTop: T.space.xl, marginBottom: T.space.sm, gap: 2 },
  sectionTitle:  { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  sectionSub:    { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: T.color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: T.space.xl, paddingTop: T.space.md, paddingBottom: 40, maxHeight: '75%' },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: T.color.line, alignSelf: 'center', marginBottom: T.space.lg },
  modalTitle:   { color: T.color.ink, fontSize: 17, fontFamily: 'SchibstedGrotesk_700Bold', marginBottom: T.space.sm },
  memberRow:    { flexDirection: 'row', alignItems: 'center', gap: T.space.md, paddingVertical: T.space.sm, borderRadius: 12 },
  memberRowActive: { },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.color.line, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: T.color.ink, fontSize: 17, fontFamily: 'SchibstedGrotesk_700Bold' },
  groupHeader:  { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, paddingVertical: T.space.sm, borderBottomWidth: 1, borderBottomColor: T.color.line, marginBottom: 4 },
  memberName:   { flex: 1, color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
});
