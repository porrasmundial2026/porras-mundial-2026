import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../../contexts/AuthContext';
import { T } from '../../constants/theme';

const logo = require('../../assets/portada-logo.png');

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [emailFocus, setEmailFocus]       = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  });

  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.params;
      handleGoogleLogin(id_token);
    }
  }, [googleResponse]);

  async function handleGoogleLogin(idToken: string) {
    setError(''); setLoading(true);
    try {
      await signInWithGoogle(idToken);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error con Google');
    } finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!email || !password) { setError('Completa todos los campos'); return; }
    setError(''); setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      setError(mapFirebaseError(e));
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.header}>
          <Image source={logo} style={styles.logoImg} resizeMode="contain" />
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <TextInput
            style={[styles.input, emailFocus && styles.inputFocus]}
            placeholder="Correo electrónico"
            placeholderTextColor={T.color.ink3}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            onFocus={() => setEmailFocus(true)}
            onBlur={() => setEmailFocus(false)}
          />
          <TextInput
            style={[styles.input, passwordFocus && styles.inputFocus]}
            placeholder="Contraseña"
            placeholderTextColor={T.color.ink3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onFocus={() => setPasswordFocus(true)}
            onBlur={() => setPasswordFocus(false)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Entrar</Text>}
          </Pressable>

          {/* Separador */}
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>o</Text>
            <View style={styles.line} />
          </View>

          {/* Google */}
          <Pressable style={styles.googleBtn} onPress={() => promptGoogleAsync()} disabled={loading}>
            <Image
              source={{ uri: 'https://www.google.com/favicon.ico' }}
              style={styles.googleIcon}
            />
            <Text style={styles.googleText}>Continuar con Google</Text>
          </Pressable>
        </View>

        {/* Pie */}
        <Link href="/(auth)/register" asChild>
          <Pressable style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? <Text style={styles.footerCta}>Regístrate</Text></Text>
          </Pressable>
        </Link>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function mapFirebaseError(e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code === 'auth/invalid-credential') return 'Correo o contraseña incorrectos';
  if (code === 'auth/user-not-found')     return 'No existe una cuenta con este correo';
  if (code === 'auth/wrong-password')     return 'Contraseña incorrecta';
  if (code === 'auth/too-many-requests')  return 'Demasiados intentos. Intenta más tarde';
  if (code === 'auth/user-banned')        return 'Tu cuenta ha sido bloqueada. Contacta con el administrador.';
  return 'Error al iniciar sesión';
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: T.color.bg },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 24, gap: 20 },

  // Header
  header:  { alignItems: 'center', gap: 12 },
  logoImg: { width: '100%', aspectRatio: 1, marginBottom: -8 },
  title:   { color: T.color.ink, fontSize: 26, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  sub:     { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },

  // Form
  form:  { gap: 10 },
  input: {
    backgroundColor: T.color.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: T.color.ink,
    fontSize: 16,
    fontFamily: 'HankenGrotesk_500Medium',
    borderWidth: 1,
    borderColor: T.color.line,
    ...T.shadow,
  },
  inputFocus: { borderColor: T.color.accent },
  error: { color: T.color.danger, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },

  // Botón entrar
  btn:         { backgroundColor: T.color.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold' },

  // Separador
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line:    { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: T.color.line },
  or:      { color: T.color.ink3, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium' },

  // Google
  googleBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.color.surface, borderRadius: 14, paddingVertical: 15, borderWidth: 1, borderColor: T.color.line, ...T.shadow },
  googleIcon: { width: 20, height: 20 },
  googleText: { color: T.color.ink, fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },

  // Pie
  footer:    { alignItems: 'center' },
  footerText:{ color: T.color.ink2, fontSize: 18, fontFamily: 'HankenGrotesk_500Medium' },
  footerCta: { color: T.color.accent, fontFamily: 'HankenGrotesk_700Bold' },
});
