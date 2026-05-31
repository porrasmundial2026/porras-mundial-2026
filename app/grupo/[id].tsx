import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Share, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Group, UserProfile } from '../../types';
import { T, SHADOW } from '../../constants/theme';
import { MAX_GROUP_MEMBERS } from '../../constants/admin';

export default function GrupoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<{ userId: string; displayName: string; photoURL: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const groupSnap = await getDoc(doc(db, 'groups', id!));
      if (!groupSnap.exists()) { setLoading(false); return; }

      const groupData = { id: groupSnap.id, ...groupSnap.data() } as Group;
      setGroup(groupData);

      const memberDocs = await Promise.all(
        groupData.members.map((uid) => getDoc(doc(db, 'users', uid)))
      );
      setMembers(
        memberDocs
          .filter((d) => d.exists())
          .map((d) => ({ userId: d.id, displayName: (d.data() as UserProfile).displayName, photoURL: (d.data() as UserProfile).photoURL }))
      );

      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDelete() {
    if (!group) return;
    Alert.alert(
      'Borrar grupo',
      `¿Seguro que quieres borrar "${group.name}"? Se eliminará para todos los miembros y no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar', style: 'destructive', onPress: async () => {
            try {
              await deleteDoc(doc(db, 'groups', group.id));
              router.replace('/(tabs)/grupos');
            } catch {
              Alert.alert('Error', 'No se pudo borrar el grupo');
            }
          },
        },
      ]
    );
  }

  async function shareCode() {
    if (!group) return;
    const link = `porras-mundial://grupo/unirse?code=${group.code}`;
    await Share.share({
      message: `¡Únete a mi grupo "${group.name}" en Porras Mundial 2026! 🏆\n\nCódigo: ${group.code}\n\nO entra directamente con este enlace (si ya tienes la app):\n${link}`,
    });
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={T.color.accent} /></View>;
  if (!group)  return <View style={styles.center}><Text style={styles.error}>Grupo no encontrado</Text></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Cabecera del grupo */}
            <View style={styles.headerCard}>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.memberCount}>{group.members.length}/{MAX_GROUP_MEMBERS} miembros{group.members.length >= MAX_GROUP_MEMBERS ? ' · COMPLETO' : ''}</Text>
              <View style={styles.btnRow}>
                <Pressable style={styles.shareBtn} onPress={shareCode}>
                  <Text style={styles.shareBtnText}>Compartir · {group.code}</Text>
                </Pressable>
                {user?.uid === group.ownerId && (
                  <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                    <Text style={styles.deleteBtnText}>Borrar grupo</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Miembros */}
            <Text style={styles.sectionTitle}>Miembros</Text>
            {members.map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{m.displayName.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.memberName}>{m.displayName}{m.userId === user?.uid ? ' (tú)' : ''}</Text>
                {m.userId === group.ownerId && <Text style={styles.ownerBadge}>Admin</Text>}
              </View>
            ))}

          </>
        }
        renderItem={() => null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.color.bg },
  error:     { color: T.color.danger, fontSize: 16 },
  list:      { paddingBottom: 32 },
  headerCard: {
    margin: 16,
    backgroundColor: T.color.surface,
    borderRadius: T.radius.card,
    padding: 18,
    gap: 6,
    borderWidth: 1,
    borderColor: T.color.line,
    ...SHADOW,
  },
  groupName:   { color: T.color.ink, fontSize: 22, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  memberCount: { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium' },
  btnRow:      { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  shareBtn:    { backgroundColor: T.color.soft, borderRadius: T.radius.chip, paddingVertical: 8, paddingHorizontal: 14 },
  shareBtnText:{ color: T.color.accent, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  deleteBtn:   { backgroundColor: '#FEE2E2', borderRadius: T.radius.chip, paddingVertical: 8, paddingHorizontal: 14 },
  deleteBtnText:{ color: '#dc2626', fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  sectionTitle:{ color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingBottom: 8 },
  memberRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: T.color.line, backgroundColor: T.color.surface },
  memberAvatar:{ width: 36, height: 36, borderRadius: 18, backgroundColor: T.color.soft, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: T.color.accent, fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold' },
  memberName:  { flex: 1, color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  ownerBadge:  { color: T.color.accent, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold', backgroundColor: T.color.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: T.radius.chip },
  empty:       { padding: 32, alignItems: 'center', gap: 10 },
  emptyEmoji:  { fontSize: 40 },
  emptyText:   { color: T.color.ink2, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', lineHeight: 24 },
});
