import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking, Modal } from 'react-native';
import Constants from 'expo-constants';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { T } from '../constants/theme';

const STORE_URL = 'https://play.google.com/store/apps/details?id=com.porrasmundial.app';

function isOutdated(current: string, latest: string): boolean {
  const c = current.split('.').map((n) => parseInt(n, 10) || 0);
  const l = latest.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    if ((c[i] ?? 0) < (l[i] ?? 0)) return true;
    if ((c[i] ?? 0) > (l[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Pantalla bloqueante de actualización. Si hay una versión más nueva publicada
 * (solo Android), obliga a actualizar con un botón que abre Google Play.
 */
export function UpdateBanner() {
  const [needsUpdate, setNeedsUpdate] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        const latest = snap.exists() ? (snap.data() as any).latestVersion : null;
        const current = Constants.expoConfig?.version ?? '0.0.0';
        if (latest && isOutdated(current, latest)) setNeedsUpdate(true);
      } catch {
        // sin conexión / permisos: no bloqueamos
      }
    })();
  }, []);

  return (
    <Modal visible={needsUpdate} transparent={false} animationType="fade" onRequestClose={() => {}}>
      <View style={styles.screen}>
        <Text style={styles.emoji}>🚀</Text>
        <Text style={styles.title}>Actualización necesaria</Text>
        <Text style={styles.text}>
          Hay una versión nueva de Porras Mundial 2026. Actualiza para seguir jugando con las últimas mejoras.
        </Text>
        <Pressable style={styles.btn} onPress={() => Linking.openURL(STORE_URL)}>
          <Text style={styles.btnText}>Actualizar ahora</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  emoji: { fontSize: 56 },
  title: { color: T.color.ink, fontSize: 22, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  text:  { color: T.color.ink2, fontSize: 15, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  btn:   { backgroundColor: T.color.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32 },
  btnText: { color: '#fff', fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold' },
});
