import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, ScrollView, TextInput, Alert } from 'react-native';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Match } from '../types';
import { GROUPS, PHASE_LABELS } from '../constants/matches';
import { Flag } from './Flag';
import { T } from '../constants/theme';

const TBD = 'Por definir';
const ALL_TEAMS = Object.values(GROUPS).flatMap((g) => g.teams).sort((a, b) => a.localeCompare(b));
const PHASE_ORDER: Match['phase'][] = ['r32', 'r16', 'quarter', 'semi', 'third', 'final'];

type Slots = Record<string, { home?: string; away?: string }>;

export function BracketAdmin({ matches }: { matches: Match[] }) {
  const [slots, setSlots] = useState<Slots>({});
  const [picker, setPicker] = useState<{ matchId: string; side: 'home' | 'away' } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'bracket'), (snap) => {
      setSlots(snap.exists() ? ((snap.data().slots as Slots) ?? {}) : {});
    });
    return unsub;
  }, []);

  const koMatches = useMemo(
    () => matches
      .filter((m) => m.phase !== 'group')
      .sort((a, b) =>
        PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      ),
    [matches]
  );

  async function setSlot(matchId: string, side: 'home' | 'away', team: string | null) {
    const next: Slots = { ...slots, [matchId]: { ...(slots[matchId] ?? {}) } };
    if (team) next[matchId][side] = team;
    else delete next[matchId][side];
    if (!next[matchId].home && !next[matchId].away) delete next[matchId];
    try {
      // Sin merge: reemplaza el mapa entero para que los borrados se apliquen
      await setDoc(doc(db, 'config', 'bracket'), { slots: next });
    } catch {
      Alert.alert('Error', 'No se pudo guardar el cambio del cuadro');
    }
  }

  function closePicker() { setPicker(null); setSearch(''); }

  const filteredTeams = ALL_TEAMS.filter((t) => t.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <FlatList
      data={koMatches}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      ListHeaderComponent={
        <Text style={styles.help}>
          Fija a mano quién juega cada cruce si el cálculo automático se equivoca (p.ej. desempates de
          terceros). Lo marcado con ✎ es manual; elige "Automático" para que lo calcule solo.
        </Text>
      }
      renderItem={({ item }) => {
        const ovH = !!slots[item.id]?.home;
        const ovA = !!slots[item.id]?.away;
        return (
          <View style={styles.card}>
            <Text style={styles.phase}>{PHASE_LABELS[item.phase]}</Text>
            <View style={styles.row}>
              <TeamBtn team={item.homeTeam} overridden={ovH} onPress={() => setPicker({ matchId: item.id, side: 'home' })} />
              <Text style={styles.vs}>vs</Text>
              <TeamBtn team={item.awayTeam} overridden={ovA} onPress={() => setPicker({ matchId: item.id, side: 'away' })} />
            </View>
          </View>
        );
      }}
      ListFooterComponent={
        <Modal visible={!!picker} transparent animationType="fade" onRequestClose={closePicker}>
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Elegir equipo</Text>
              <TextInput
                style={styles.search}
                placeholder="Buscar..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={T.color.ink3}
              />
              <Pressable
                style={styles.autoBtn}
                onPress={() => { if (picker) setSlot(picker.matchId, picker.side, null); closePicker(); }}
              >
                <Text style={styles.autoText}>🔄 Automático (calcular solo)</Text>
              </Pressable>
              <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
                {filteredTeams.map((t) => (
                  <Pressable
                    key={t}
                    style={styles.teamOpt}
                    onPress={() => { if (picker) setSlot(picker.matchId, picker.side, t); closePicker(); }}
                  >
                    <Flag team={t} size={20} />
                    <Text style={styles.teamOptText}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.cancelBtn} onPress={closePicker}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      }
    />
  );
}

function TeamBtn({ team, overridden, onPress }: { team: string; overridden: boolean; onPress: () => void }) {
  const tbd = team === TBD;
  return (
    <Pressable style={[styles.teamBtn, overridden && styles.teamBtnOv]} onPress={onPress}>
      {!tbd && <Flag team={team} size={18} />}
      <Text style={[styles.teamBtnText, tbd && styles.tbd]} numberOfLines={1}>{team}</Text>
      {overridden && <Text style={styles.ovTag}>✎</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  help: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium', lineHeight: 18, marginBottom: 6 },
  card: { backgroundColor: T.color.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: T.color.line, gap: 6 },
  phase: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vs: { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  teamBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.color.bg, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: T.color.line },
  teamBtnOv: { borderColor: T.color.accent, backgroundColor: T.color.soft },
  teamBtnText: { flexShrink: 1, color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  tbd: { color: T.color.ink3, fontStyle: 'italic' },
  ovTag: { color: T.color.accent, fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: T.color.surface, borderRadius: 14, padding: 16 },
  modalTitle: { color: T.color.ink, fontSize: 18, fontFamily: 'SchibstedGrotesk_800ExtraBold', marginBottom: 8 },
  search: { backgroundColor: T.color.bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: T.color.ink, borderWidth: 1, borderColor: T.color.line, marginBottom: 8 },
  autoBtn: { backgroundColor: T.color.bg, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: T.color.line },
  autoText: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  teamOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.color.line },
  teamOptText: { color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium' },
  cancelBtn: { marginTop: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: T.color.line, borderRadius: 8 },
  cancelText: { color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
});
