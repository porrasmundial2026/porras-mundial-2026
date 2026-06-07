import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TeamStanding } from '../lib/standings';
import { Flag } from './Flag';
import { C, SHADOW } from '../constants/theme';
import { GROUPS } from '../constants/matches';

interface Props {
  groupLetter: string;
  standings: TeamStanding[];
  liveTeams?: Set<string>;
}

export function GroupStandingTable({ groupLetter, standings, liveTeams }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Grupo {groupLetter}</Text>

      {/* Cabecera */}
      <View style={styles.headerRow}>
        <Text style={[styles.pos, styles.hdr]}>#</Text>
        <Text style={[styles.team, styles.hdr]}>Equipo</Text>
        <Text style={[styles.col, styles.hdr]}>PJ</Text>
        <Text style={[styles.col, styles.hdr]}>DG</Text>
        <Text style={[styles.col, styles.hdrPts]}>Pts</Text>
      </View>

      {standings.map((s, i) => {
        const qualifies = i < 2;        // 1º y 2º pasan directo
        const maybe = i === 2;          // 3º puede pasar como mejor tercero
        return (
          <View key={s.team} style={styles.row}>
            <View style={styles.posWrap}>
              <View style={[styles.dot, qualifies ? styles.dotQ : maybe ? styles.dotMaybe : styles.dotOut]} />
              <Text style={styles.pos}>{i + 1}</Text>
            </View>
            <View style={styles.teamCell}>
              <Flag team={s.team} size={20} />
              <Text style={styles.team} numberOfLines={1}>{s.team}</Text>
              {liveTeams?.has(s.team) && <View style={styles.liveDot} />}
            </View>
            <Text style={styles.col}>{s.played}</Text>
            <Text style={styles.col}>{s.gd > 0 ? `+${s.gd}` : s.gd}</Text>
            <Text style={styles.colPts}>{s.points}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 14, marginVertical: 6, ...SHADOW },
  title: { color: C.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.separator },
  hdr: { color: C.textTertiary, fontSize: 11, fontWeight: '700' },
  hdrPts: { color: C.accent, fontSize: 11, fontWeight: '700', width: 34, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator },
  posWrap: { width: 28, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 16, borderRadius: 2 },
  dotQ: { backgroundColor: C.exact },
  dotMaybe: { backgroundColor: C.result },
  dotOut: { backgroundColor: 'transparent' },
  pos: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  teamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  team: { flexShrink: 1, color: C.textPrimary, fontSize: 13, fontWeight: '600' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  col: { width: 34, textAlign: 'center', color: C.textSecondary, fontSize: 13 },
  colPts: { width: 34, textAlign: 'center', color: C.accent, fontSize: 15, fontWeight: '800' },
});

// Re-export para que la pantalla pueda iterar los grupos sin reimportar
export { GROUPS };
