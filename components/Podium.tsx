import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { RankingEntry } from '../types';
import { T } from '../constants/theme';

interface Props {
  top3: RankingEntry[];
  currentUserId?: string;
  onPressUser?: (userId: string) => void;
}

const PODIUM_H = { 1: 88, 2: 68, 3: 56 };
const ORDER    = [1, 0, 2]; // visual: 2º - 1º - 3º

export function Podium({ top3, currentUserId, onPressUser }: Props) {
  return (
    <View style={styles.wrap}>
      {ORDER.map((idx) => {
        const entry    = top3[idx];
        if (!entry) return <View key={idx} style={styles.col} />;
        const position = idx + 1 as 1 | 2 | 3;
        const isMe     = entry.userId === currentUserId;
        const isFirst  = position === 1;

        return (
          <Pressable key={entry.userId} style={styles.col} onPress={() => onPressUser?.(entry.userId)}>
            <View style={[styles.avatar, isMe && styles.avatarMe, isFirst && styles.avatarFirst]}>
              <Text style={styles.avatarText}>{entry.displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>{entry.displayName}{isMe ? ' (tú)' : ''}</Text>
            <Text style={styles.sub} numberOfLines={1}>{entry.exactHits} exactos · {entry.resultHits} correctos</Text>
            <View style={[styles.bar, styles[`bar${position}`], { height: PODIUM_H[position] }]}>
              <Text style={styles.posLabel}>{position}º</Text>
              <Text style={styles.pts}>{entry.totalPoints}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: T.space.sm,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.sm,
    paddingBottom: T.space.xl,
  },
  col:     { flex: 1, alignItems: 'center', gap: T.space.xs },
  avatar:  { width: 48, height: 48, borderRadius: 24, backgroundColor: T.color.line, alignItems: 'center', justifyContent: 'center' },
  avatarMe:    { borderWidth: 2, borderColor: T.color.accent },
  avatarFirst: { width: 56, height: 56, borderRadius: 28, backgroundColor: T.color.soft, borderWidth: 2, borderColor: T.color.accent },
  avatarText:  { color: T.color.ink, fontSize: 20, fontFamily: 'SchibstedGrotesk_700Bold' },
  name:        { color: T.color.ink, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold', maxWidth: '100%' },
  sub:         { color: T.color.ink3, fontSize: 9, fontFamily: 'HankenGrotesk_400Regular', maxWidth: '100%', textAlign: 'center' },
  bar:         { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bar1:        { backgroundColor: T.color.accent },   // 1º verde fuerte
  bar2:        { backgroundColor: '#4A9D78' },         // 2º verde medio
  bar3:        { backgroundColor: '#86C2A6' },         // 3º verde claro
  posLabel:    { color: '#fff', fontSize: 11, fontFamily: 'HankenGrotesk_700Bold', opacity: 0.85 },
  pts:         { color: '#fff', fontSize: 20, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
});
