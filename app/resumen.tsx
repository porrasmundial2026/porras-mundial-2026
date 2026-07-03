import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Animated, Dimensions, ScrollView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../constants/admin';
import { useMatchResults } from '../hooks/useMatchResults';
import { buildRanking, calculatePoints } from '../lib/scoring';
import { Flag } from '../components/Flag';
import { Group, Match, Prediction, RankingEntry, UserProfile } from '../types';
import { PHASE_LABELS } from '../constants/matches';
import { T } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ---- Pequeño componente de aparición suave ----
function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity: op, transform: [{ translateY: ty }] }]}>{children}</Animated.View>;
}

interface Member { userId: string; displayName: string; photoURL: string | null }

export default function ResumenScreen() {
  const { user } = useAuth();
  const liveMatches = useMatchResults();

  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(SCREEN_W);
  const listRef = useRef<FlatList>(null);

  // Como admin, cargamos TODOS los grupos de la app para poder elegir cuál ver
  useEffect(() => {
    getDocs(collection(db, 'groups'))
      .then((snap) => setAllGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (allGroups.length > 0 && !selectedGroup) setSelectedGroup(allGroups[0]);
  }, [allGroups]);

  useEffect(() => {
    if (!selectedGroup) return;
    setLoading(true);
    (async () => {
      const memberDocs = await Promise.all(selectedGroup.members.map((uid) => getDoc(doc(db, 'users', uid))));
      setMembers(memberDocs.filter((d) => d.exists()).map((d) => ({ userId: d.id, displayName: (d.data() as UserProfile).displayName, photoURL: (d.data() as UserProfile).photoURL ?? null })));
      const snap = await getDocs(query(collection(db, 'predictions'), where('userId', 'in', selectedGroup.members)));
      setPredictions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Prediction)));
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [selectedGroup]);

  const finished = useMemo(
    () => liveMatches.filter((m) => m.status === 'finished' && m.homeScore != null && m.awayScore != null),
    [liveMatches]
  );

  const ranking = useMemo(() => buildRanking(members, predictions, finished), [members, predictions, finished]);

  const stats = useMemo(() => {
    if (members.length === 0) return null;
    const nameOf = (uid: string) => members.find((m) => m.userId === uid)?.displayName ?? '?';
    const resultMap = new Map(finished.map((m) => [m.id, m]));

    // Nostradamus: más exactos
    const nostra = [...ranking].sort((a, b) => b.exactHits - a.exactHits)[0];

    // El pupas: más fallos (0 pts en partidos jugados que predijo)
    const zeros = members.map((mem) => {
      let z = 0;
      for (const p of predictions.filter((x) => x.userId === mem.userId)) {
        const m = resultMap.get(p.matchId);
        if (m && calculatePoints(p, m) === 0) z++;
      }
      return { name: mem.displayName, z };
    }).sort((a, b) => b.z - a.z)[0];

    // Mejor jornada (mejor puntuación de una persona en un solo día)
    const dayKey = (m: Match) => { const d = new Date(m.scheduledAt); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    let best = { name: '', pts: -1, day: '' };
    const days = new Map<string, Match[]>();
    for (const m of finished) { const k = dayKey(m); if (!days.has(k)) days.set(k, []); days.get(k)!.push(m); }
    for (const mem of members) {
      for (const [k, ms] of days) {
        let pts = 0;
        for (const m of ms) {
          const p = predictions.find((x) => x.userId === mem.userId && x.matchId === m.id);
          if (p) pts += calculatePoints(p, m);
        }
        if (pts > best.pts) best = { name: mem.displayName, pts, day: k };
      }
    }
    const bestDayLabel = best.day
      ? (() => { const [y, mo, d] = best.day.split('-').map(Number); return new Date(y, mo, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); })()
      : '';

    // Rey de grupos vs Rey de eliminatoria
    const groupFin = finished.filter((m) => m.phase === 'group');
    const koFin = finished.filter((m) => m.phase !== 'group');
    const kingGroup = buildRanking(members, predictions, groupFin)[0];
    const kingKo = koFin.length > 0 ? buildRanking(members, predictions, koFin)[0] : null;

    // Goles del torneo + goles predichos por cada uno
    const totalGoals = finished.reduce((s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const goalsList = members.map((mem) => {
      let g = 0;
      for (const p of predictions.filter((x) => x.userId === mem.userId)) {
        if (resultMap.has(p.matchId)) g += p.homeScore + p.awayScore;
      }
      return { name: mem.displayName, diff: Math.abs(g - totalGoals), g };
    }).sort((a, b) => a.diff - b.diff);
    const closest = goalsList[0];

    // Partido más loco (más goles)
    const wildest = [...finished].sort((a, b) => ((b.homeScore ?? 0) + (b.awayScore ?? 0)) - ((a.homeScore ?? 0) + (a.awayScore ?? 0)))[0];

    // Campeón del Mundial (final finalizada)
    const finalMatch = liveMatches.find((m) => m.phase === 'final' && m.status === 'finished');
    let champion: string | null = null;
    if (finalMatch && finalMatch.homeScore != null && finalMatch.awayScore != null) {
      if (finalMatch.homeScore > finalMatch.awayScore) champion = finalMatch.homeTeam;
      else if (finalMatch.awayScore > finalMatch.homeScore) champion = finalMatch.awayTeam;
      else if (finalMatch.penaltyWinner) champion = finalMatch.penaltyWinner === 'home' ? finalMatch.homeTeam : finalMatch.awayTeam;
    }

    return { nostra, zeros, best, bestDayLabel, kingGroup, kingKo, totalGoals, closest, goalsList, wildest, champion, playedCount: finished.length };
  }, [members, predictions, finished, ranking, liveMatches]);

  // ---- Definición de slides ----
  const slides = useMemo(() => {
    if (!stats || ranking.length === 0) return [] as { key: string; render: () => React.ReactNode }[];
    const podium = ranking.slice(0, 3);

    const arr: { key: string; render: () => React.ReactNode }[] = [];

    arr.push({ key: 'intro', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.big}>🏆</Text></FadeIn>
        <FadeIn delay={200}><Text style={styles.title}>Resumen del Mundial</Text></FadeIn>
        <FadeIn delay={400}><Text style={styles.subtitle}>{selectedGroup?.name}</Text></FadeIn>
        <FadeIn delay={700}><Text style={styles.hint}>Desliza para empezar →</Text></FadeIn>
      </View>
    )});

    arr.push({ key: 'podium', render: () => <PodiumSlide podium={podium} active={index === 1} /> });

    if (stats.nostra && stats.nostra.exactHits > 0) arr.push({ key: 'nostra', render: () => (
      <SlideCard emoji="🔮" label="El Nostradamus" value={stats.nostra.displayName}
        sub={`${stats.nostra.exactHits} marcadores exactos clavados`} />
    )});

    if (stats.zeros && stats.zeros.z > 0) arr.push({ key: 'pupas', render: () => (
      <SlideCard emoji="🫠" label="El pupas" value={stats.zeros.name}
        sub={`${stats.zeros.z} predicciones falladas de pleno`} />
    )});

    if (stats.best.pts > 0) arr.push({ key: 'jornada', render: () => (
      <SlideCard emoji="🔥" label="La mejor jornada" value={stats.best.name}
        sub={`${stats.best.pts} pts el ${cap(stats.bestDayLabel)}`} />
    )});

    if (stats.kingGroup) arr.push({ key: 'reyes', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.emoji}>👑</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>Rey de la fase de grupos</Text></FadeIn>
        <FadeIn delay={250}><Text style={styles.value}>{stats.kingGroup.displayName}</Text></FadeIn>
        <FadeIn delay={300}><Text style={styles.sub}>{stats.kingGroup.totalPoints} pts en la liguilla</Text></FadeIn>
        {stats.kingKo && (
          <>
            <View style={{ height: 28 }} />
            <FadeIn delay={450}><Text style={styles.label}>Rey de la eliminatoria</Text></FadeIn>
            <FadeIn delay={550}><Text style={styles.value}>{stats.kingKo.displayName}</Text></FadeIn>
            <FadeIn delay={600}><Text style={styles.sub}>{stats.kingKo.totalPoints} pts en los cruces</Text></FadeIn>
          </>
        )}
      </View>
    )});

    arr.push({ key: 'goles', render: () => (
      <View style={[styles.slideInner, { paddingTop: 40, justifyContent: 'center' }]}>
        <FadeIn><Text style={[styles.emoji, { textAlign: 'center' }]}>⚽</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>Goles del torneo</Text></FadeIn>
        <FadeIn delay={250}><Text style={[styles.bigNum, { textAlign: 'center' }]}>{stats.totalGoals}</Text></FadeIn>
        <FadeIn delay={350}><Text style={styles.sub}>en {stats.playedCount} partidos jugados</Text></FadeIn>
        <FadeIn delay={550} style={{ width: '100%', marginTop: 18 }}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Goles que predijo cada uno</Text>
          <ScrollView style={{ maxHeight: 260, width: '100%' }} contentContainerStyle={{ gap: 6 }}>
            {stats.goalsList.map((it, i) => (
              <View key={it.name} style={[styles.rankRow, i === 0 && { borderColor: T.color.accent, backgroundColor: T.color.soft }]}>
                <Text style={styles.rankName} numberOfLines={1}>{it.name}{i === 0 ? '  🎯' : ''}</Text>
                <Text style={styles.rankPts}>{it.g}</Text>
                <Text style={styles.golDiff}>{it.diff === 0 ? 'clavado' : `±${it.diff}`}</Text>
              </View>
            ))}
          </ScrollView>
        </FadeIn>
      </View>
    )});

    if (stats.wildest) arr.push({ key: 'loco', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.emoji}>🤯</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>El partido más loco</Text></FadeIn>
        <FadeIn delay={300}>
          <View style={styles.matchRow}>
            <Flag team={stats.wildest.homeTeam} size={26} />
            <Text style={styles.matchScore}>{stats.wildest.homeScore} – {stats.wildest.awayScore}</Text>
            <Flag team={stats.wildest.awayTeam} size={26} />
          </View>
        </FadeIn>
        <FadeIn delay={400}><Text style={styles.sub}>{stats.wildest.homeTeam} vs {stats.wildest.awayTeam} · {(stats.wildest.homeScore ?? 0) + (stats.wildest.awayScore ?? 0)} goles</Text></FadeIn>
      </View>
    )});

    if (stats.champion) arr.push({ key: 'campeon', render: () => (
      <View style={styles.center}>
        <FadeIn><Text style={styles.emoji}>🌍</Text></FadeIn>
        <FadeIn delay={150}><Text style={styles.label}>Campeón del Mundo</Text></FadeIn>
        <FadeIn delay={350}><Flag team={stats.champion!} size={72} /></FadeIn>
        <FadeIn delay={500}><Text style={styles.value}>{stats.champion}</Text></FadeIn>
      </View>
    )});

    arr.push({ key: 'final', render: () => (
      <View style={[styles.slideInner, { paddingTop: 60 }]}>
        <Text style={styles.title}>Clasificación final</Text>
        <ScrollView style={{ marginTop: 16, width: '100%' }} contentContainerStyle={{ gap: 8, paddingBottom: 40 }}>
          {ranking.map((e, i) => (
            <View key={e.userId} style={styles.rankRow}>
              <Text style={[styles.rankPos, i < 3 && { color: T.color.accent }]}>{i + 1}</Text>
              <Text style={styles.rankName} numberOfLines={1}>{e.displayName}</Text>
              <Text style={styles.rankPts}>{e.totalPoints}</Text>
            </View>
          ))}
        </ScrollView>
        <Text style={styles.hint}>¡Gracias por jugar! 🏆</Text>
      </View>
    )});

    return arr;
  }, [stats, ranking, index, selectedGroup]);

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, i));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }

  if (!isAdmin(user?.uid)) return <Redirect href="/(tabs)" />;

  return (
    <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Barra superior: cerrar + progreso + selector de grupo */}
      <View style={styles.topBar}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {allGroups.length > 1 && (
        <View style={styles.groupChips}>
          {allGroups.map((g) => (
            <Pressable key={g.id} onPress={() => { setSelectedGroup(g); setIndex(0); listRef.current?.scrollToIndex({ index: 0, animated: false }); }}
              style={[styles.chip, selectedGroup?.id === g.id && styles.chipActive]}>
              <Text style={[styles.chipTxt, selectedGroup?.id === g.id && styles.chipTxtActive]}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading || !stats || slides.length === 0 ? (
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={T.color.accent} size="large" />
            : <Text style={styles.sub}>Aún no hay datos suficientes para el resumen.</Text>}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={slides}
            keyExtractor={(s) => s.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={() => {}}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width }]}>{item.render()}</View>
            )}
          />
          {index > 0 && (
            <Pressable style={[styles.arrow, styles.arrowLeft]} onPress={() => goTo(index - 1)} hitSlop={10}>
              <Text style={styles.arrowTxt}>‹</Text>
            </Pressable>
          )}
          {index < slides.length - 1 && (
            <Pressable style={[styles.arrow, styles.arrowRight]} onPress={() => goTo(index + 1)} hitSlop={10}>
              <Text style={styles.arrowTxt}>›</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Slide genérica de "dato curioso"
function SlideCard({ emoji, label, value, sub }: { emoji: string; label: string; value: string; sub: string }) {
  return (
    <View style={styles.center}>
      <FadeIn><Text style={styles.emoji}>{emoji}</Text></FadeIn>
      <FadeIn delay={150}><Text style={styles.label}>{label}</Text></FadeIn>
      <FadeIn delay={300}><Text style={styles.value}>{value}</Text></FadeIn>
      <FadeIn delay={450}><Text style={styles.sub}>{sub}</Text></FadeIn>
    </View>
  );
}

// Slide del podio con revelación 3º → 2º → 1º
function PodiumSlide({ podium, active }: { podium: RankingEntry[]; active: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 500);
    const t2 = setTimeout(() => setStep(2), 1500);
    const t3 = setTimeout(() => setStep(3), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active]);

  const third = podium[2], second = podium[1], first = podium[0];
  return (
    <View style={styles.center}>
      <Text style={[styles.label, { marginBottom: 24 }]}>El podio</Text>
      <View style={{ minHeight: 240, justifyContent: 'flex-end', gap: 14 }}>
        {step >= 1 && third && (
          <FadeIn><PodRow pos="🥉" name={third.displayName} pts={third.totalPoints} sub={`${third.exactHits} exactos · ${third.resultHits} correctos`} /></FadeIn>
        )}
        {step >= 2 && second && (
          <FadeIn><PodRow pos="🥈" name={second.displayName} pts={second.totalPoints} sub={`${second.exactHits} exactos · ${second.resultHits} correctos`} /></FadeIn>
        )}
        {step >= 3 && first && (
          <FadeIn><PodRow pos="🥇" name={first.displayName} pts={first.totalPoints} sub={`${first.exactHits} exactos · ${first.resultHits} correctos`} big /></FadeIn>
        )}
      </View>
      {step >= 3 && <FadeIn delay={200}><Text style={styles.hint}>🎉 ¡Campeón de la porra! 🎉</Text></FadeIn>}
    </View>
  );
}

function PodRow({ pos, name, pts, sub, big }: { pos: string; name: string; pts: number; sub: string; big?: boolean }) {
  return (
    <View style={[styles.podRow, big && styles.podRowBig]}>
      <Text style={styles.podMedal}>{pos}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.podName, big && { fontSize: 22 }]} numberOfLines={1}>{name}</Text>
        <Text style={styles.podSub}>{sub}</Text>
      </View>
      <Text style={[styles.podPts, big && { fontSize: 26 }]}>{pts}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 8, gap: 12 },
  dots: { flex: 1, flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: T.color.line },
  dotActive: { backgroundColor: T.color.accent },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: T.color.ink2, fontSize: 20, fontFamily: 'HankenGrotesk_700Bold' },
  groupChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipTxt: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  chipTxtActive: { color: '#fff' },
  slide: { flex: 1 },
  slideInner: { flex: 1, alignItems: 'center', paddingHorizontal: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 6 },
  big: { fontSize: 72 },
  emoji: { fontSize: 56, marginBottom: 6 },
  title: { color: T.color.ink, fontSize: 26, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  subtitle: { color: T.color.accent, fontSize: 18, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center' },
  label: { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  value: { color: T.color.ink, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  bigNum: { color: T.color.accent, fontSize: 64, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  sub: { color: T.color.ink2, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },
  hint: { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textAlign: 'center', marginTop: 14 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  matchScore: { color: T.color.ink, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.color.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: T.color.line, width: 320, maxWidth: '100%' },
  podRowBig: { backgroundColor: T.color.soft, borderColor: T.color.accent },
  podMedal: { fontSize: 26 },
  podName: { color: T.color.ink, fontSize: 17, fontFamily: 'HankenGrotesk_700Bold' },
  podSub: { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },
  podPts: { color: T.color.accent, fontSize: 20, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.color.surface, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: T.color.line },
  rankPos: { width: 22, color: T.color.ink3, fontSize: 14, fontFamily: 'SchibstedGrotesk_700Bold' },
  rankName: { flex: 1, color: T.color.ink, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
  rankPts: { color: T.color.accent, fontSize: 16, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  golDiff: { width: 60, textAlign: 'right', color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_700Bold' },
  arrow: { position: 'absolute', top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: T.color.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  arrowTxt: { color: T.color.accent, fontSize: 30, fontFamily: 'SchibstedGrotesk_800ExtraBold', lineHeight: 34, marginTop: -2 },
});
