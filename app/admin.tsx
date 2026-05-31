import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, FlatList, TextInput,
  Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { Redirect } from 'expo-router';
import { doc, setDoc, deleteDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, onSnapshot, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMatchResults } from '../hooks/useMatchResults';
import { isAdmin } from '../constants/admin';
import { PHASE_LABELS, ALL_MATCHES } from '../constants/matches';
import { FLAG } from '../constants/flags';
import { calculatePoints } from '../lib/scoring';
import { Match, UserProfile, Prediction } from '../types';
import { C, SHADOW, T } from '../constants/theme';

type AdminTab = 'resultados' | 'usuarios' | 'grupos' | 'stats';
interface AdminGroup { id: string; name: string; code: string; ownerId: string; members: string[]; memberNames: string[] }

export default function AdminScreen() {
  const { user } = useAuth();
  const liveMatches = useMatchResults();
  const [tab, setTab] = useState<AdminTab>('resultados');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [allPreds, setAllPreds] = useState<Prediction[]>([]);
  const [allUsers, setAllUsers] = useState<Record<string, string>>({});
  const [loadingStats, setLoadingStats] = useState(false);

  if (!isAdmin(user?.uid)) {
    return <Redirect href="/(tabs)" />;
  }

  useEffect(() => {
    if (tab !== 'stats') return;
    setLoadingStats(true);
    (async () => {
      const [predsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'predictions')),
        getDocs(collection(db, 'users')),
      ]);
      setAllPreds(predsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Prediction)));
      const names: Record<string, string> = {};
      usersSnap.docs.forEach((d) => { names[d.id] = (d.data() as UserProfile).displayName; });
      setAllUsers(names);
      setLoadingStats(false);
    })();
  }, [tab]);

  const globalStats = useMemo(() => {
    const finished = liveMatches.filter((m) => m.status === 'finished');
    const finishedMap = new Map(finished.map((m) => [m.id, m]));

    // Por partido: cuántos acertaron exacto y cuántos resultado
    const perMatch = finished.map((m) => {
      const preds = allPreds.filter((p) => p.matchId === m.id);
      let exact = 0, correct = 0;
      for (const p of preds) {
        const pts = calculatePoints(p, m);
        if (pts === 5) exact++;
        if (pts === 2) correct++;
      }
      return { match: m, total: preds.length, exact, correct, hitRate: preds.length ? (exact + correct) / preds.length : 0 };
    }).filter((s) => s.total > 0);

    const mostExact = [...perMatch].sort((a, b) => b.exact - a.exact)[0];
    const hardest   = [...perMatch].sort((a, b) => a.hitRate - b.hitRate)[0];

    // Por usuario: puntos totales y racha
    const byUser = new Map<string, number>();
    for (const p of allPreds) {
      const m = finishedMap.get(p.matchId);
      if (!m) continue;
      byUser.set(p.userId, (byUser.get(p.userId) ?? 0) + calculatePoints(p, m));
    }
    const leader = [...byUser.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      totalUsers: Object.keys(allUsers).length,
      totalPreds: allPreds.length,
      finishedCount: finished.length,
      mostExact,
      hardest,
      leader: leader ? { name: allUsers[leader[0]] ?? '?', points: leader[1] } : null,
    };
  }, [allPreds, allUsers, liveMatches]);

  useEffect(() => {
    if (tab !== 'usuarios') return;
    setLoadingUsers(true);
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return unsub;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'grupos') return;
    setLoadingGroups(true);
    const unsub = onSnapshot(collection(db, 'groups'), async (snap) => {

      const groupDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      // Cargar nombres de miembros
      const allUids = [...new Set(groupDocs.flatMap((g: any) => g.members as string[]))];
      const userDocs = await Promise.all(allUids.map((uid) => getDocs(query(collection(db, 'users'), where('__name__', '==', uid)))));
      const nameMap: Record<string, string> = {};
      userDocs.forEach((snap) => snap.docs.forEach((d) => { nameMap[d.id] = (d.data() as UserProfile).displayName; }));
      setGroups(groupDocs.map((g: any) => ({
        ...g,
        memberNames: (g.members as string[]).map((uid: string) => nameMap[uid] ?? uid),
      })));
      setLoadingGroups(false);
    }, () => setLoadingGroups(false));
    return unsub;
  }, [tab]);

  async function deleteGroup(g: AdminGroup) {
    Alert.alert(
      'Borrar grupo',
      `¿Borrar el grupo "${g.name}"? Se eliminará para todos sus miembros. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar', style: 'destructive', onPress: async () => {
            try {
              await deleteDoc(doc(db, 'groups', g.id));
              Alert.alert('Hecho', `Grupo "${g.name}" eliminado`);
            } catch {
              Alert.alert('Error', 'No se pudo borrar el grupo');
            }
          },
        },
      ]
    );
  }

  async function banUser(u: UserProfile) {
    Alert.alert(
      'Bloquear usuario',
      `¿Bloquear a ${u.displayName}? Se eliminarán sus predicciones, se le quitará de todos los grupos y no podrá volver a entrar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear', style: 'destructive', onPress: async () => {
            try {
              const batch = writeBatch(db);

              // Borrar predicciones
              const predsSnap = await getDocs(query(collection(db, 'predictions'), where('userId', '==', u.uid)));
              predsSnap.docs.forEach((d) => batch.delete(d.ref));

              // Quitarle de grupos
              const groupsSnap = await getDocs(query(collection(db, 'groups'), where('members', 'array-contains', u.uid)));
              groupsSnap.docs.forEach((d) => batch.update(d.ref, { members: arrayRemove(u.uid) }));

              // Marcar como baneado (no borrar el doc para que no pueda crear cuenta nueva)
              batch.update(doc(db, 'users', u.uid), { banned: true });

              await batch.commit();
              Alert.alert('Hecho', `${u.displayName} bloqueado`);
            } catch {
              Alert.alert('Error', 'No se pudo bloquear el usuario');
            }
          },
        },
      ]
    );
  }

  async function unbanUser(u: UserProfile) {
    Alert.alert(
      'Desbloquear usuario',
      `¿Desbloquear a ${u.displayName}? Podrá volver a entrar en la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear', onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', u.uid), { banned: false });
              Alert.alert('Hecho', `${u.displayName} desbloqueado`);
            } catch {
              Alert.alert('Error', 'No se pudo desbloquear el usuario');
            }
          },
        },
      ]
    );
  }

  const sections = useMemo(() => {
    const bySection = new Map<string, Match[]>();
    for (const m of liveMatches) {
      if (m.homeTeam === 'Por definir' || m.awayTeam === 'Por definir') continue;
      const key = PHASE_LABELS[m.phase];
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(m);
    }
    return Array.from(bySection.entries()).map(([title, data]) => ({ title, data }));
  }, [liveMatches]);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>⚙️ Panel de administrador</Text>
      </View>

      {/* Selector de pestaña */}
      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, tab === 'resultados' && styles.tabBtnActive]} onPress={() => setTab('resultados')}>
          <Text style={[styles.tabText, tab === 'resultados' && styles.tabTextActive]}>Resultados</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'usuarios' && styles.tabBtnActive]} onPress={() => setTab('usuarios')}>
          <Text style={[styles.tabText, tab === 'usuarios' && styles.tabTextActive]}>Usuarios</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'grupos' && styles.tabBtnActive]} onPress={() => setTab('grupos')}>
          <Text style={[styles.tabText, tab === 'grupos' && styles.tabTextActive]}>Grupos</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, tab === 'stats' && styles.tabBtnActive]} onPress={() => setTab('stats')}>
          <Text style={[styles.tabText, tab === 'stats' && styles.tabTextActive]}>Stats</Text>
        </Pressable>
      </View>

      {tab === 'resultados' ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionTitle}>{title}</Text>
          )}
          renderItem={({ item }) => <AdminMatchRow match={item} />}
        />
      ) : tab === 'usuarios' ? (
        loadingUsers ? (
          <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users.filter((u) => {
            if (userFilter === 'active') return !(u as any).banned;
            if (userFilter === 'banned') return (u as any).banned;
            return true;
          })}
          keyExtractor={(u) => u.uid}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.userFilterRow}>
              {(['all', 'active', 'banned'] as const).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.userFilterBtn, userFilter === f && styles.userFilterBtnActive]}
                  onPress={() => setUserFilter(f)}
                >
                  <Text style={[styles.userFilterText, userFilter === f && styles.userFilterTextActive]}>
                    {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Bloqueados'}
                  </Text>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item: u }) => (
            <View style={styles.userRow}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{u.displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{u.displayName}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
              </View>
              {u.uid !== user?.uid && (
                <Pressable
                  style={(u as any).banned ? styles.bannedBtn : styles.deleteBtn}
                  onPress={() => (u as any).banned ? unbanUser(u) : banUser(u)}
                >
                  <Text style={(u as any).banned ? styles.bannedText : styles.deleteText}>
                    {(u as any).banned ? 'Bloqueado' : 'Bloquear'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        />
        )
      ) : tab === 'grupos' ? (
        loadingGroups ? (
          <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.usersCount}>{groups.length} grupos en la app</Text>}
            renderItem={({ item: g }) => (
              <View style={styles.groupAdminCard}>
                <View style={styles.groupAdminHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupAdminName}>{g.name}</Text>
                    <Text style={styles.groupAdminCode}>Código: {g.code} · {g.members.length} miembros</Text>
                  </View>
                  <Pressable style={styles.deleteBtn} onPress={() => deleteGroup(g)}>
                    <Text style={styles.deleteText}>Borrar</Text>
                  </Pressable>
                </View>
                <Text style={styles.groupAdminMembers}>{g.memberNames.join(' · ')}</Text>
              </View>
            )}
          />
        )
      ) : loadingStats ? (
        <ActivityIndicator color={T.color.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[]}
          keyExtractor={() => 'x'}
          renderItem={() => null}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              {/* Resumen */}
              <View style={styles.statsSummaryRow}>
                <View style={styles.statsSummaryCard}>
                  <Text style={styles.statsSummaryValue}>{globalStats.totalUsers}</Text>
                  <Text style={styles.statsSummaryLabel}>Usuarios</Text>
                </View>
                <View style={styles.statsSummaryCard}>
                  <Text style={styles.statsSummaryValue}>{globalStats.totalPreds}</Text>
                  <Text style={styles.statsSummaryLabel}>Predicciones</Text>
                </View>
                <View style={styles.statsSummaryCard}>
                  <Text style={styles.statsSummaryValue}>{globalStats.finishedCount}</Text>
                  <Text style={styles.statsSummaryLabel}>Jugados</Text>
                </View>
              </View>

              {globalStats.leader && (
                <View style={styles.statBlock}>
                  <Text style={styles.statBlockLabel}>🏆 Líder global</Text>
                  <Text style={styles.statBlockMain}>{globalStats.leader.name}</Text>
                  <Text style={styles.statBlockSub}>{globalStats.leader.points} puntos</Text>
                </View>
              )}

              {globalStats.mostExact && (
                <View style={styles.statBlock}>
                  <Text style={styles.statBlockLabel}>🎯 Más acertado (exacto)</Text>
                  <Text style={styles.statBlockMain}>
                    {FLAG[globalStats.mostExact.match.homeTeam]} {globalStats.mostExact.match.homeTeam} {globalStats.mostExact.match.homeScore}–{globalStats.mostExact.match.awayScore} {globalStats.mostExact.match.awayTeam} {FLAG[globalStats.mostExact.match.awayTeam]}
                  </Text>
                  <Text style={styles.statBlockSub}>{globalStats.mostExact.exact} de {globalStats.mostExact.total} acertaron el marcador exacto</Text>
                </View>
              )}

              {globalStats.hardest && (
                <View style={styles.statBlock}>
                  <Text style={styles.statBlockLabel}>😵 Más difícil de predecir</Text>
                  <Text style={styles.statBlockMain}>
                    {FLAG[globalStats.hardest.match.homeTeam]} {globalStats.hardest.match.homeTeam} {globalStats.hardest.match.homeScore}–{globalStats.hardest.match.awayScore} {globalStats.hardest.match.awayTeam} {FLAG[globalStats.hardest.match.awayTeam]}
                  </Text>
                  <Text style={styles.statBlockSub}>Solo {Math.round(globalStats.hardest.hitRate * 100)}% acertó algo ({globalStats.hardest.total} predicciones)</Text>
                </View>
              )}

              {globalStats.finishedCount === 0 && (
                <Text style={styles.statsEmpty}>Las estadísticas aparecerán cuando finalicen los primeros partidos.</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

function AdminMatchRow({ match }: { match: Match }) {
  const [home, setHome] = useState(match.homeScore?.toString() ?? '');
  const [away, setAway] = useState(match.awayScore?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [penaltyWinner, setPenaltyWinner] = useState<'home' | 'away' | undefined>(match.penaltyWinner);

  // Sincronizar inputs cuando llegan los datos de Firestore
  useEffect(() => {
    if (match.homeScore !== undefined) setHome(match.homeScore.toString());
    if (match.awayScore !== undefined) setAway(match.awayScore.toString());
    setPenaltyWinner(match.penaltyWinner);
  }, [match.homeScore, match.awayScore, match.penaltyWinner]);

  const valid = /^\d{1,2}$/.test(home) && /^\d{1,2}$/.test(away);
  const isKnockout = match.phase !== 'group';
  const isDraw = valid && parseInt(home, 10) === parseInt(away, 10);
  // En eliminatoria, un empate necesita ganador de penaltis para poder finalizar
  const needsPenalty = isKnockout && isDraw;
  const canFinish = valid && (!needsPenalty || penaltyWinner != null);

  const docId = `${match.homeTeam}__${match.awayTeam}`.replace(/\s/g, '_');

  async function save(status: 'finished' | 'live') {
    if (!valid) return;
    if (status === 'finished' && needsPenalty && !penaltyWinner) {
      Alert.alert('Falta el ganador', 'Es eliminatoria y hay empate: marca quién pasó por penaltis.');
      return;
    }
    setSaving(true);
    const homeScoreInt = parseInt(home, 10);
    const awayScoreInt = parseInt(away, 10);
    try {
      await setDoc(doc(db, 'matchResults', docId), {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: homeScoreInt,
        awayScore: awayScoreInt,
        status,
        penaltyWinner: isDraw ? (penaltyWinner ?? null) : null,
        updatedAt: serverTimestamp(),
        editedByAdmin: true,
      }, { merge: true });

      // Si el partido finaliza, recalcular puntos de todas las predicciones
      if (status === 'finished') {
        const matchObj = ALL_MATCHES.find(
          (m) => m.homeTeam === match.homeTeam && m.awayTeam === match.awayTeam
        );
        if (matchObj) {
          const predsSnap = await getDocs(
            query(collection(db, 'predictions'), where('matchId', '==', matchObj.id))
          );
          if (!predsSnap.empty) {
            const batch = writeBatch(db);
            predsSnap.docs.forEach((d) => {
              const pred = d.data();
              const points = calculatePoints(
                { homeScore: pred.homeScore, awayScore: pred.awayScore },
                { homeScore: homeScoreInt, awayScore: awayScoreInt }
              );
              batch.update(d.ref, { points });
            });
            await batch.commit();
          }
        }
      }

      Alert.alert('Guardado', `${match.homeTeam} ${home}–${away} ${match.awayTeam}${isDraw && penaltyWinner ? ` (pen. ${penaltyWinner === 'home' ? match.homeTeam : match.awayTeam})` : ''}`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar el resultado');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    Alert.alert(
      'Resetear partido',
      'El partido volverá a estado "próximo" y se actualizará solo cuando se juegue. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetear',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteDoc(doc(db, 'matchResults', docId));
              setHome('');
              setAway('');
            } catch {
              Alert.alert('Error', 'No se pudo resetear');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.teams}>
        <Text style={styles.team} numberOfLines={1}>{FLAG[match.homeTeam]} {match.homeTeam}</Text>
        <Text style={styles.team} numberOfLines={1}>{FLAG[match.awayTeam]} {match.awayTeam}</Text>
      </View>

      <View style={styles.inputs}>
        <TextInput style={styles.input} value={home} onChangeText={setHome} keyboardType="number-pad" maxLength={2} placeholder="-" placeholderTextColor={C.textTertiary} selectTextOnFocus />
        <Text style={styles.dash}>–</Text>
        <TextInput style={styles.input} value={away} onChangeText={setAway} keyboardType="number-pad" maxLength={2} placeholder="-" placeholderTextColor={C.textTertiary} selectTextOnFocus />
      </View>

      {needsPenalty && (
        <View style={styles.penaltyBox}>
          <Text style={styles.penaltyLabel}>⚽ Empate — ¿quién pasó por penaltis?</Text>
          <View style={styles.penaltyRow}>
            <Pressable
              style={[styles.penaltyBtn, penaltyWinner === 'home' && styles.penaltyBtnActive]}
              onPress={() => setPenaltyWinner('home')}
            >
              <Text style={[styles.penaltyBtnText, penaltyWinner === 'home' && styles.penaltyBtnTextActive]} numberOfLines={1}>
                {match.homeTeam}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.penaltyBtn, penaltyWinner === 'away' && styles.penaltyBtnActive]}
              onPress={() => setPenaltyWinner('away')}
            >
              <Text style={[styles.penaltyBtnText, penaltyWinner === 'away' && styles.penaltyBtnTextActive]} numberOfLines={1}>
                {match.awayTeam}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.liveBtn, (!valid || saving) && styles.disabled]} onPress={() => save('live')} disabled={!valid || saving}>
          <Text style={styles.liveText}>En vivo</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.finBtn, (!canFinish || saving) && styles.disabled]} onPress={() => save('finished')} disabled={!canFinish || saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.finText}>Finalizar</Text>}
        </Pressable>
      </View>

      {match.status !== 'upcoming' && (
        <View style={styles.currentRow}>
          <Text style={styles.current}>Actual: {match.homeScore}–{match.awayScore} ({match.status === 'finished' ? 'Final' : 'En vivo'})</Text>
          <Pressable onPress={reset} disabled={saving}>
            <Text style={styles.resetText}>Resetear</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  banner: { backgroundColor: '#FEF3C7', padding: 14, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  bannerText: { color: '#92400E', fontSize: 13, fontWeight: '700' },
  tabRow: { flexDirection: 'row', backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: T.color.accent },
  tabText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: T.color.accent },
  usersCount: { color: C.textSecondary, fontSize: 12, marginBottom: 8 },
  userFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  userFilterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  userFilterBtnActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  userFilterText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  userFilterTextActive: { color: '#fff' },
  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 12, padding: 12, marginVertical: 4, gap: 12, ...SHADOW },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.color.soft, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: T.color.accent, fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
  userEmail: { color: C.textSecondary, fontSize: 12 },
  deleteBtn:   { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  deleteText:  { color: C.miss, fontSize: 13, fontWeight: '700' },
  groupAdminCard:    { backgroundColor: C.surface, borderRadius: 12, padding: 14, marginVertical: 4, gap: 8, ...SHADOW },
  groupAdminHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupAdminName:    { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  groupAdminCode:    { color: C.textSecondary, fontSize: 12 },
  groupAdminMembers: { color: C.textTertiary, fontSize: 12, lineHeight: 18 },
  statsSummaryRow:   { flexDirection: 'row', gap: 8 },
  statsSummaryCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 14, alignItems: 'center', gap: 2, ...SHADOW },
  statsSummaryValue: { color: T.color.accent, fontSize: 24, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  statsSummaryLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '600' },
  statBlock:      { backgroundColor: C.surface, borderRadius: 12, padding: 14, gap: 4, ...SHADOW },
  statBlockLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statBlockMain:  { color: C.textPrimary, fontSize: 15, fontWeight: '700' },
  statBlockSub:   { color: C.textTertiary, fontSize: 13 },
  statsEmpty:     { color: C.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 30, paddingHorizontal: 20, lineHeight: 22 },
  bannedBtn:   { backgroundColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  bannedText:  { color: C.textTertiary, fontSize: 13, fontWeight: '700' },
  list: { padding: 16 },
  sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, marginVertical: 5, gap: 10, ...SHADOW },
  teams: { gap: 2 },
  team: { color: C.textPrimary, fontSize: 14, fontWeight: '600' },
  inputs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  input: {
    width: 56, height: 48, backgroundColor: C.bg, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, color: C.textPrimary,
    fontSize: 22, fontWeight: '700', textAlign: 'center',
  },
  dash: { color: C.textTertiary, fontSize: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, borderRadius: 10, height: 42, alignItems: 'center', justifyContent: 'center' },
  liveBtn: { backgroundColor: '#FEE2E2' },
  liveText: { color: C.miss, fontWeight: '700', fontSize: 14 },
  finBtn: { backgroundColor: C.accent },
  finText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.4 },
  penaltyBox: { backgroundColor: C.bg, borderRadius: 10, padding: 10, gap: 8 },
  penaltyLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  penaltyRow: { flexDirection: 'row', gap: 8 },
  penaltyBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  penaltyBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  penaltyBtnText: { color: C.textPrimary, fontSize: 12, fontWeight: '600' },
  penaltyBtnTextActive: { color: '#fff' },
  currentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  current: { color: C.textSecondary, fontSize: 12 },
  resetText: { color: C.miss, fontSize: 12, fontWeight: '700' },
});
