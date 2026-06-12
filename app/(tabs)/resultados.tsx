import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, FlatList, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PHASE_LABELS, GROUPS } from '../../constants/matches';
import { useMatchResults } from '../../hooks/useMatchResults';
import { Flag } from '../../components/Flag';
import { Match } from '../../types';
import { T } from '../../constants/theme';
import { computeAllStandings } from '../../lib/standings';
import { GroupStandingTable } from '../../components/GroupStandingTable';
import { BracketView } from '../../components/BracketView';

// Lista de los 48 equipos, ordenada alfabéticamente
const ALL_TEAMS = Object.values(GROUPS).flatMap((g) => g.teams).sort((a, b) => a.localeCompare(b));

type ViewMode = 'matches' | 'standings' | 'bracket';
type Filter   = 'finished' | 'upcoming' | 'all';

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'matches',   label: 'Partidos' },
  { key: 'standings', label: 'Grupos' },
  { key: 'bracket',   label: 'Cuadro' },
];
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'all',      label: 'Todos' },
];

export default function ResultadosScreen() {
  const liveMatches = useMatchResults();
  const [view,   setView]   = useState<ViewMode>('matches');
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [country, setCountry] = useState<string | null>(null);
  const [countryModal, setCountryModal] = useState(false);

  const sections = useMemo(() => {
    const filtered = liveMatches.filter((m) => {
      if (country && m.homeTeam !== country && m.awayTeam !== country) return false;
      if (filter === 'finished') return m.status === 'finished';
      if (filter === 'upcoming') return m.status === 'upcoming' || m.status === 'live';
      return true;
    });
    // Ordenar por fecha y agrupar por día
    const sorted = [...filtered].sort((a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
    const byDay = new Map<string, Match[]>();
    for (const match of sorted) {
      const d = new Date(match.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(match);
    }
    return Array.from(byDay.values()).map((data) => {
      const d = new Date(data[0].scheduledAt);
      let title = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      title = title.charAt(0).toUpperCase() + title.slice(1);
      return { title, data };
    });
  }, [filter, country, liveMatches]);

  const standings    = useMemo(() => computeAllStandings(liveMatches), [liveMatches]);
  const groupLetters = Object.keys(GROUPS);

  // Equipos que están jugando ahora mismo (para el punto verde en la tabla)
  const liveTeams = useMemo(() => {
    const set = new Set<string>();
    for (const m of liveMatches) {
      if (m.status === 'live') { set.add(m.homeTeam); set.add(m.awayTeam); }
    }
    return set;
  }, [liveMatches]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Resultados</Text>

        <View style={styles.segmented}>
          {VIEW_TABS.map((t) => (
            <Pressable key={t.key} style={[styles.segment, view === t.key && styles.segmentActive]} onPress={() => setView(t.key)}>
              <Text style={[styles.segmentText, view === t.key && styles.segmentTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {view === 'matches' && (
          <>
            <View style={styles.filters}>
              {FILTERS.map((f) => (
                <Pressable key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
                  <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Filtro por país */}
            <Pressable style={styles.countryBtn} onPress={() => setCountryModal(true)}>
              {country ? <Flag team={country} size={20} /> : <Ionicons name="earth" size={18} color={T.color.accent} />}
              <Text style={styles.countryBtnText}>{country ?? 'Todos los países'}</Text>
              {country
                ? <Pressable onPress={() => setCountry(null)} hitSlop={8}><Ionicons name="close-circle" size={18} color={T.color.ink3} /></Pressable>
                : <Ionicons name="chevron-down" size={16} color={T.color.ink3} />}
            </Pressable>
          </>
        )}
      </View>

      {view === 'bracket' ? (
        <BracketView matches={liveMatches} />
      ) : view === 'matches' ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionTitle}>{title}</Text>
          )}
          renderItem={({ item }) => <ResultCard match={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{filter === 'finished' ? '⏳' : '📅'}</Text>
              <Text style={styles.emptyText}>
                {filter === 'finished' ? 'Todavía no hay partidos finalizados' : 'No hay partidos próximos'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={groupLetters}
          keyExtractor={(g) => g}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: T.color.good }]} /><Text style={styles.legendText}>Clasifica (1º-2º)</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#D97706' }]} /><Text style={styles.legendText}>Posible mejor 3º</Text></View>
            </View>
          }
          renderItem={({ item }) => (
            <GroupStandingTable groupLetter={item} standings={standings.byGroup[item]} liveTeams={liveTeams} />
          )}
        />
      )}

      {/* Modal de selección de país */}
      <Modal visible={countryModal} transparent animationType="slide" onRequestClose={() => setCountryModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCountryModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Filtrar por país</Text>
            <FlatList
              data={['__all__', ...ALL_TEAMS]}
              keyExtractor={(t) => t}
              renderItem={({ item }) => {
                if (item === '__all__') {
                  return (
                    <Pressable style={styles.countryRow} onPress={() => { setCountry(null); setCountryModal(false); }}>
                      <Ionicons name="earth" size={24} color={T.color.accent} />
                      <Text style={styles.countryRowText}>Todos los países</Text>
                      {!country && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
                    </Pressable>
                  );
                }
                return (
                  <Pressable style={styles.countryRow} onPress={() => { setCountry(item); setCountryModal(false); }}>
                    <Flag team={item} size={24} />
                    <Text style={styles.countryRowText}>{item}</Text>
                    {country === item && <Ionicons name="checkmark" size={18} color={T.color.accent} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function ResultCard({ match }: { match: Match }) {
  const isFinished = match.status === 'finished';
  const isLive     = match.status === 'live';
  const dateStr = new Date(match.scheduledAt).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = new Date(match.scheduledAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
      <View style={styles.matchRow}>
        <View style={styles.teamSide}>
          <Flag team={match.homeTeam} size={32} />
          <Text style={styles.teamName} numberOfLines={2}>{match.homeTeam}</Text>
        </View>
        <View style={styles.scoreCenter}>
          {isFinished || isLive ? (
            <Text style={[styles.score, isFinished && styles.scoreFinal, isLive && styles.scoreLive]}>{match.homeScore} – {match.awayScore}</Text>
          ) : (
            <Text style={styles.timeLarge}>{timeStr}</Text>
          )}
          {isLive
            ? <View style={styles.liveBadge}><Text style={styles.liveText}>EN VIVO</Text></View>
            : isFinished
              ? <Text style={styles.finText}>FIN</Text>
              : <Text style={styles.dateSub}>{dateStr}</Text>}
          {isFinished && match.penaltyWinner && (
            <Text style={styles.penText} numberOfLines={1}>
              {match.penaltyHome != null && match.penaltyAway != null
                ? `Pen. ${match.penaltyHome}–${match.penaltyAway}`
                : 'Penaltis'}
            </Text>
          )}
        </View>
        <View style={[styles.teamSide, styles.teamSideRight]}>
          <Flag team={match.awayTeam} size={32} />
          <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={2}>{match.awayTeam}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.venue} numberOfLines={1}>{match.venue}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  header: { paddingHorizontal: T.space.xl, paddingTop: 56, paddingBottom: T.space.lg, gap: T.space.md, backgroundColor: T.color.bg },
  title:  { color: T.color.ink, fontSize: 27, fontFamily: 'SchibstedGrotesk_800ExtraBold' },
  segmented: { flexDirection: 'row', backgroundColor: T.color.line, borderRadius: 12, padding: 3, gap: 3 },
  segment:   { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: T.color.surface, ...T.shadow },
  segmentText:       { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  segmentTextActive: { color: T.color.accent },
  filters: { flexDirection: 'row', gap: T.space.sm },
  chip:       { paddingHorizontal: T.space.md, paddingVertical: T.space.xs, borderRadius: T.radius.chip, borderWidth: 1, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  chipText:       { color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  chipTextActive: { color: '#fff' },
  countryBtn:     { flexDirection: 'row', alignItems: 'center', gap: T.space.sm, backgroundColor: T.color.surface, borderRadius: T.radius.chip, paddingHorizontal: T.space.md, paddingVertical: T.space.sm, borderWidth: 1, borderColor: T.color.line, alignSelf: 'flex-start' },
  countryBtnText: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: T.color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: T.space.xl, paddingTop: T.space.md, paddingBottom: 40, maxHeight: '75%' },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: T.color.line, alignSelf: 'center', marginBottom: T.space.lg },
  modalTitle:     { color: T.color.ink, fontSize: 17, fontFamily: 'SchibstedGrotesk_700Bold', marginBottom: T.space.sm },
  countryRow:     { flexDirection: 'row', alignItems: 'center', gap: T.space.md, paddingVertical: T.space.sm, borderBottomWidth: 1, borderBottomColor: T.color.line },
  countryRowText: { flex: 1, color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  list:         { paddingHorizontal: T.space.lg, paddingBottom: 32 },
  sectionTitle: { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: T.space.xl, marginBottom: T.space.sm },
  legend:     { flexDirection: 'row', gap: 16, paddingVertical: 8, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 4, height: 14, borderRadius: 2 },
  legendText: { color: T.color.ink2, fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  card: { backgroundColor: T.color.surface, borderRadius: T.radius.card, padding: 14, marginVertical: 5, borderWidth: 1, borderColor: T.color.line, gap: 10, ...T.shadow },
  matchRow:    { flexDirection: 'row', alignItems: 'center' },
  teamSide:    { flex: 1, alignItems: 'flex-start', gap: 4 },
  teamSideRight: { alignItems: 'flex-end' },
  teamName:    { color: T.color.ink, fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', lineHeight: 18 },
  scoreCenter: { width: 80, alignItems: 'center', gap: 2 },
  score:       { color: T.color.ink, fontSize: 22, fontFamily: 'SchibstedGrotesk_700Bold' },
  scoreFinal:  { color: T.color.good },
  scoreLive:   { color: T.color.danger },
  penText:     { color: T.color.ink2, fontSize: 11, fontFamily: 'HankenGrotesk_700Bold' },
  timeLarge:   { color: T.color.ink, fontSize: 18, fontFamily: 'SchibstedGrotesk_700Bold' },
  finText:     { color: T.color.ink3, fontSize: 10, fontFamily: 'HankenGrotesk_500Medium', letterSpacing: 0.8 },
  dateSub:     { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_500Medium' },
  liveBadge:   { backgroundColor: '#FEE2E2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveText:    { color: T.color.danger, fontSize: 10, fontFamily: 'HankenGrotesk_700Bold', letterSpacing: 0.5 },
  cardFooter:  { borderTopWidth: 1, borderTopColor: T.color.line, paddingTop: 8 },
  venue:       { color: T.color.ink3, fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },
  empty:       { paddingTop: 60, alignItems: 'center', gap: 10 },
  emptyEmoji:  { fontSize: 40 },
  emptyText:   { color: T.color.ink2, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },
});
