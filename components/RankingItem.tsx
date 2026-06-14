import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { RankingEntry } from '../types';
import { T } from '../constants/theme';

interface Props {
  entry: RankingEntry;
  position: number;
  isCurrentUser: boolean;
  onPress?: () => void;
}

export function RankingItem({ entry, position, isCurrentUser, onPress }: Props) {
  return (
    <Pressable style={[styles.row, isCurrentUser && styles.rowHighlight]} onPress={onPress}>
      <Text style={styles.pos}>{position}</Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{entry.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.displayName}{isCurrentUser ? ' · tú' : ''}
        </Text>
        <Text style={styles.sub}>
          {entry.exactHits} exactos · {entry.resultHits} correctos
        </Text>
      </View>
      <Text style={styles.points}>{entry.totalPoints}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: T.space.xl,
    gap: T.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: T.color.line,
    backgroundColor: T.color.surface,
  },
  rowHighlight: { backgroundColor: T.color.soft },
  pos:    { width: 24, color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.color.line, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: T.color.ink2, fontSize: 15, fontFamily: 'SchibstedGrotesk_700Bold' },
  info:   { flex: 1, gap: 2 },
  name:   { color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  sub:    { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_400Regular' },
  points: { color: T.color.accent, fontSize: 22, fontFamily: 'SchibstedGrotesk_700Bold', minWidth: 36, textAlign: 'right' },
});
