import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useMatchResults } from '../hooks/useMatchResults';
import { isFinalFinished } from '../lib/tournament';
import { T } from '../constants/theme';

/**
 * Aviso de que el Resumen del torneo ya está disponible, cuando termina la
 * final. Solo se muestra UNA vez por usuario (se marca en su perfil en
 * Firestore, así funciona igual en web y en la app).
 */
export function WrappedPopup() {
  const { user } = useAuth();
  const liveMatches = useMatchResults();
  const finalDone = isFinalFinished(liveMatches);
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!finalDone || !user || checked) return;
    setChecked(true);
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!snap.exists() || !(snap.data() as any).wrappedPopupSeen) setVisible(true);
      })
      .catch(() => {});
  }, [finalDone, user, checked]);

  function dismiss(goToResumen: boolean) {
    setVisible(false);
    if (user) setDoc(doc(db, 'users', user.uid), { wrappedPopupSeen: true }, { merge: true }).catch(() => {});
    if (goToResumen) router.push('/resumen' as any);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🏆</Text>
          <Text style={styles.title}>¡El Resumen del Mundial ya está disponible!</Text>
          <Text style={styles.sub}>Podio, motes, curiosidades y más, listos para revivir el torneo.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => dismiss(true)}>
            <Text style={styles.primaryText}>Ver ahora</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => dismiss(false)}>
            <Text style={styles.secondaryText}>Luego</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: T.color.surface, borderRadius: 18, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { color: T.color.ink, fontSize: 19, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  sub: { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', marginTop: 8, marginBottom: 18 },
  primaryBtn: { backgroundColor: T.color.accent, borderRadius: 12, paddingVertical: 13, width: '100%', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
  secondaryBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  secondaryText: { color: T.color.ink3, fontSize: 14, fontFamily: 'HankenGrotesk_700Bold' },
});
