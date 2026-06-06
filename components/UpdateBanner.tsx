import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { T } from '../constants/theme';

const STORE_URL = 'https://play.google.com/store/apps/details?id=com.porrasmundial.app';

// Compara versiones tipo "1.0.1". Devuelve true si current < latest.
function isOutdated(current: string, latest: string): boolean {
  const c = current.split('.').map((n) => parseInt(n, 10) || 0);
  const l = latest.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    if ((c[i] ?? 0) < (l[i] ?? 0)) return true;
    if ((c[i] ?? 0) > (l[i] ?? 0)) return false;
  }
  return false;
}

export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Solo en Android (la web siempre está actualizada)
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        const latest = snap.exists() ? (snap.data() as any).latestVersion : null;
        const current = Constants.expoConfig?.version ?? '0.0.0';
        if (latest && isOutdated(current, latest)) setShow(true);
      } catch {
        // sin conexión / permisos: no mostramos nada
      }
    })();
  }, []);

  if (!show) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Hay una versión nueva disponible</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => Linking.openURL(STORE_URL)}>
          <Text style={styles.update}>Actualizar</Text>
        </Pressable>
        <Pressable onPress={() => setShow(false)} hitSlop={8}>
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.color.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text:    { color: '#fff', fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  update:  { color: '#fff', fontSize: 13, fontFamily: 'HankenGrotesk_700Bold', textDecorationLine: 'underline' },
  dismiss: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
});
