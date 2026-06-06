import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../contexts/AuthContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { T } from '../constants/theme';
import {
  useFonts,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_800ExtraBold,
} from '@expo-google-fonts/schibsted-grotesk';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#1a1a2e', padding: 24 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: 'bold', marginTop: 60, marginBottom: 12 }}>
            Error al arrancar la app
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>{err.message}</Text>
          <Text style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace' }}>{err.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_700Bold,
  });

  // Arrancar aunque las fuentes fallen (en web a veces no decodifican);
  // se usaría la fuente del sistema como respaldo.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <AuthProvider>
        <View style={styles.root}>
          <OfflineBanner />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.color.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="partido/[id]" options={{ headerShown: true, title: 'Predicción', headerStyle: { backgroundColor: T.color.surface }, headerTintColor: T.color.ink, headerShadowVisible: false }} />
            <Stack.Screen name="grupo/crear" options={{ headerShown: true, title: 'Crear Grupo', headerStyle: { backgroundColor: T.color.surface }, headerTintColor: T.color.ink, headerShadowVisible: false }} />
            <Stack.Screen name="grupo/unirse" options={{ headerShown: true, title: 'Unirse a Grupo', headerStyle: { backgroundColor: T.color.surface }, headerTintColor: T.color.ink, headerShadowVisible: false }} />
            <Stack.Screen name="grupo/[id]" options={{ headerShown: true, title: 'Grupo', headerStyle: { backgroundColor: T.color.surface }, headerTintColor: T.color.ink, headerShadowVisible: false }} />
            <Stack.Screen name="admin" options={{ headerShown: true, title: 'Administrador', headerStyle: { backgroundColor: T.color.surface }, headerTintColor: T.color.ink, headerShadowVisible: false }} />
          </Stack>
          <StatusBar style="dark" />
        </View>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.color.bg,
    // En web: columna centrada tipo móvil, no a pantalla completa
    ...(Platform.OS === 'web'
      ? ({ width: '80%', maxWidth: 520, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: T.color.line } as object)
      : {}),
  },
});
