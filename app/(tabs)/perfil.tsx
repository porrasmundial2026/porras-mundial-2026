import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { usePredictions } from '../../hooks/usePredictions';
import { useMatchResults } from '../../hooks/useMatchResults';
import { calculatePoints } from '../../lib/scoring';
import { isAdmin } from '../../constants/admin';
import { T } from '../../constants/theme';

export default function PerfilScreen() {
  const { user, profile, logOut, updateDisplayName } = useAuth();
  const { predictions } = usePredictions();
  const liveMatches = useMatchResults();
  const admin = isAdmin(user?.uid);

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);

  const finishedMatchMap = new Map(
    liveMatches.filter((m) => m.status === 'finished').map((m) => [m.id, m])
  );
  const myPredictionsOnFinished = predictions.filter((p) => finishedMatchMap.has(p.matchId));
  const livePoints = myPredictionsOnFinished.map((p) => {
    const match = finishedMatchMap.get(p.matchId)!;
    return calculatePoints(p, match);
  });
  const totalPoints  = livePoints.reduce((acc, pts) => acc + pts, 0);
  const exactHits    = livePoints.filter((pts) => pts === 5).length;
  const resultHits   = livePoints.filter((pts) => pts === 2).length;
  const totalPlayed  = livePoints.length;
  const pctExact     = totalPlayed > 0 ? Math.round((exactHits / totalPlayed) * 100) : 0;
  const pctCorrect   = totalPlayed > 0 ? Math.round(((exactHits + resultHits) / totalPlayed) * 100) : 0;

  // Racha máxima de aciertos consecutivos (exacto o resultado)
  const maxStreak = (() => {
    let best = 0, current = 0;
    for (const pts of livePoints) {
      if (pts > 0) { current++; best = Math.max(best, current); }
      else current = 0;
    }
    return best;
  })();

  async function handleSaveName() {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      await updateDisplayName(newName.trim());
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el nombre');
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => { await logOut(); router.replace('/(auth)/login'); } },
    ]);
  }

  const initial = (profile?.displayName ?? '?').charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.nameBlock}>
            {editingName ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.nameInput}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  maxLength={30}
                  selectTextOnFocus
                />
                <Pressable style={styles.saveBtn} onPress={handleSaveName} disabled={savingName}>
                  {savingName ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>✓</Text>}
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={() => { setEditingName(false); setNewName(profile?.displayName ?? ''); }}>
                  <Text style={styles.cancelText}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.nameRow} onPress={() => setEditingName(true)}>
                <Text style={styles.name}>{profile?.displayName}</Text>
                <Text style={styles.editIcon}>✏️</Text>
              </Pressable>
            )}
            <Text style={styles.email}>{profile?.email}</Text>
          </View>
        </View>
      </View>

      {/* Stats 2×2 */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardAccent]}>
          <Text style={styles.statValueWhite}>{totalPoints}</Text>
          <Text style={styles.statLabelWhite}>Puntos totales</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{predictions.length}</Text>
          <Text style={styles.statLabel}>Predicciones</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{exactHits}</Text>
          <Text style={styles.statLabel}>Exactas</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{maxStreak}</Text>
          <Text style={styles.statLabel}>Racha máx.</Text>
        </View>
      </View>

      {/* Estadísticas de acierto */}
      {totalPlayed > 0 && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>Estadísticas de acierto</Text>

          <View style={styles.statRow}>
            <Text style={styles.statRowLabel}>Exactos</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${pctExact}%`, backgroundColor: T.color.good }]} />
            </View>
            <Text style={styles.statRowPct}>{pctExact}%</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statRowLabel}>Correctos</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${pctCorrect}%`, backgroundColor: '#d97706' }]} />
            </View>
            <Text style={styles.statRowPct}>{pctCorrect}%</Text>
          </View>

          <Text style={styles.statSub}>{totalPlayed} partidos jugados · {exactHits + resultHits} aciertos · {totalPlayed - exactHits - resultHits} fallos</Text>
        </View>
      )}

      {/* Sistema de puntuación */}
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>Sistema de puntuación</Text>
        <View style={styles.infoRow}><Text style={[styles.infoPts, { color: T.color.good }]}>5 pts</Text><Text style={styles.infoDesc}>Resultado exacto</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoPts, { color: '#D97706' }]}>2 pts</Text><Text style={styles.infoDesc}>Resultado correcto (G/E/P)</Text></View>
        <View style={styles.infoRow}><Text style={[styles.infoPts, { color: T.color.ink3 }]}>0 pts</Text><Text style={styles.infoDesc}>Fallo</Text></View>
      </View>

      {admin && (
        <Pressable style={styles.adminBtn} onPress={() => router.push('/admin')}>
          <Text style={styles.adminText}>⚙️ Panel de administrador</Text>
        </Pressable>
      )}

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  scroll: { paddingBottom: 40 },
  header:    { paddingHorizontal: T.space.xl, paddingTop: 56, paddingBottom: T.space.xl, gap: T.space.lg, backgroundColor: T.color.bg },
  title:     { color: T.color.ink, fontSize: 27, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.md },
  avatar:    { width: 72, height: 72, borderRadius: 36, backgroundColor: T.color.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: T.color.accent },
  avatarText:{ color: T.color.accent, fontSize: 32, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  nameBlock: { flex: 1, gap: 4 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:      { color: T.color.ink, fontSize: 20, fontFamily: 'SchibstedGrotesk_700Bold' },
  editIcon:  { fontSize: 14 },
  email:     { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_400Regular' },
  editRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: { flex: 1, borderWidth: 1, borderColor: T.color.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, fontSize: 16, fontFamily: 'HankenGrotesk_700Bold', color: T.color.ink },
  saveBtn:   { backgroundColor: T.color.accent, borderRadius: 10, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:{ color: '#fff', fontSize: 16, fontFamily: 'HankenGrotesk_700Bold' },
  cancelBtn: { backgroundColor: T.color.line, borderRadius: 10, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cancelText:{ color: T.color.ink2, fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: T.space.lg, gap: T.space.sm },
  statCard:  { flex: 1, minWidth: '45%', backgroundColor: T.color.surface, borderRadius: T.radius.card, padding: T.space.lg, gap: 4, borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  statCardAccent: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  statValue:      { color: T.color.ink, fontSize: 28, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  statLabel:      { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  statValueWhite: { color: '#fff', fontSize: 28, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  statLabelWhite: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  infoBox:   { margin: T.space.lg, backgroundColor: T.color.surface, borderRadius: T.radius.card, padding: T.space.lg, gap: T.space.sm, borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  infoLabel: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  infoPts:   { fontSize: 15, fontFamily: 'SchibstedGrotesk_700Bold', width: 44 },
  infoDesc:  { color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium' },
  statRow:      { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  statRowLabel: { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium', width: 70 },
  barBg:        { flex: 1, height: 8, borderRadius: 4, backgroundColor: T.color.line, overflow: 'hidden' },
  barFill:      { height: 8, borderRadius: 4 },
  statRowPct:   { color: T.color.ink, fontSize: 13, fontFamily: 'SchibstedGrotesk_700Bold', width: 40, textAlign: 'right' },
  statSub:      { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_400Regular', marginTop: 4 },
  adminBtn:  { marginHorizontal: T.space.lg, marginTop: 'auto', backgroundColor: T.color.soft, borderRadius: T.radius.card, paddingVertical: 15, alignItems: 'center' },
  adminText: { color: T.color.accent, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  logoutBtn: { margin: T.space.lg, backgroundColor: T.color.surface, borderRadius: T.radius.card, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5' },
  logoutText:{ color: T.color.danger, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
});
