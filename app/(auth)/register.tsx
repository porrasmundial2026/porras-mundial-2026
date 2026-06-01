import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIVACY_URL = 'https://porrasmundial2026.github.io/porras-mundial-2026/privacy.html';

const logo = require('../../assets/portada-logo.png');
import { useAuth } from '../../contexts/AuthContext';
import { useGroups } from '../../hooks/useGroup';
import { T } from '../../constants/theme';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const { joinGroup } = useGroups();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [groupCode, setGroupCode]     = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [notice, setNotice]           = useState('');

  const [nameFocus, setNameFocus]         = useState(false);
  const [emailFocus, setEmailFocus]       = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [codeFocus, setCodeFocus]         = useState(false);
  const [accepted, setAccepted]           = useState(false);

  async function handleRegister() {
    if (!displayName.trim() || !email || !password) {
      setError('Completa todos los campos obligatorios'); return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres'); return;
    }
    if (groupCode && groupCode.trim().length !== 6) {
      setError('El código de grupo debe tener 6 caracteres (o déjalo vacío)'); return;
    }
    if (!accepted) {
      setError('Debes aceptar la política de privacidad'); return;
    }
    setError(''); setLoading(true);
    try {
      await signUp(email, password, displayName.trim());
      if (groupCode.trim()) {
        try {
          await joinGroup(groupCode.trim());
        } catch (joinErr) {
          const msg = joinErr instanceof Error ? joinErr.message : 'No se pudo unir al grupo';
          setNotice(`Cuenta creada, pero ${msg.toLowerCase()}. Únete desde la pestaña Grupos.`);
        }
      }
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
          <Text style={styles.title}>Crear cuenta</Text>

          <Text style={styles.sub}>Únete y predice el Mundial 2026</Text>
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <TextInput
            style={[styles.input, nameFocus && styles.inputFocus]}
            placeholder="Tu nombre"
            placeholderTextColor={T.color.ink3}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            onFocus={() => setNameFocus(true)}
            onBlur={() => setNameFocus(false)}
          />
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
            placeholder="Contraseña (mín. 6 caracteres)"
            placeholderTextColor={T.color.ink3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            onFocus={() => setPasswordFocus(true)}
            onBlur={() => setPasswordFocus(false)}
          />

          <View style={styles.codeWrap}>
            <TextInput
              style={[styles.input, styles.codeInput, codeFocus && styles.inputFocus]}
              placeholder="Código de grupo (opcional)"
              placeholderTextColor={T.color.ink3}
              value={groupCode}
              onChangeText={(t) => setGroupCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              onFocus={() => setCodeFocus(true)}
              onBlur={() => setCodeFocus(false)}
            />
          </View>
          <Text style={styles.codeHint}>Si tienes un código, te unimos al grupo al registrarte.</Text>

          {/* Aceptación política de privacidad (RGPD) */}
          <Pressable style={styles.checkRow} onPress={() => setAccepted((v) => !v)}>
            <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
              {accepted && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.checkText}>
              He leído y acepto la{' '}
              <Text style={styles.checkLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                política de privacidad
              </Text>
            </Text>
          </Pressable>

          {error  ? <Text style={styles.error}>{error}</Text>   : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Crear cuenta</Text>}
          </Pressable>
        </View>

        {/* Pie */}
        <Pressable onPress={() => router.back()} style={styles.footer}>
          <Text style={styles.footerText}>← <Text style={styles.footerCta}>Ya tengo cuenta</Text></Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function mapFirebaseError(e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code === 'auth/email-already-in-use') return 'Ya existe una cuenta con este correo';
  if (code === 'auth/invalid-email')        return 'Correo no válido';
  if (code === 'auth/weak-password')        return 'Contraseña muy débil';
  return 'Error al crear la cuenta';
}

const styles = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: T.color.bg },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 48, gap: 32 },

  header:  { alignItems: 'center', gap: 12 },
  logoImg: { width: '100%', aspectRatio: 1, marginBottom: -8 },
  title:   { color: T.color.ink, fontSize: 26, fontFamily: 'SchibstedGrotesk_800ExtraBold', textAlign: 'center' },
  sub:     { color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },

  form:  { gap: 12 },
  input: {
    backgroundColor: T.color.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: T.color.ink,
    fontSize: 16,
    fontFamily: 'HankenGrotesk_500Medium',
    borderWidth: 1,
    borderColor: T.color.line,
    ...T.shadow,
  },
  inputFocus: { borderColor: T.color.accent },
  codeWrap:   { position: 'relative' },
  codeInput:  { letterSpacing: 4, fontFamily: 'SchibstedGrotesk_700Bold' },
  codeHint:   { color: T.color.ink3, fontSize: 12, fontFamily: 'HankenGrotesk_400Regular', marginTop: -4 },
  checkRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  checkbox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: T.color.line, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: T.color.accent, borderColor: T.color.accent },
  checkText:  { flex: 1, color: T.color.ink2, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium', lineHeight: 19 },
  checkLink:  { color: T.color.accent, fontFamily: 'HankenGrotesk_700Bold' },
  error:      { color: T.color.danger, fontSize: 13, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center' },
  notice:     { color: '#d97706', fontSize: 13, fontFamily: 'HankenGrotesk_500Medium', textAlign: 'center', lineHeight: 18 },

  btn:         { backgroundColor: T.color.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontSize: 16, fontFamily: 'SchibstedGrotesk_700Bold' },

  footer:    { alignItems: 'center' },
  footerText:{ color: T.color.ink2, fontSize: 14, fontFamily: 'HankenGrotesk_500Medium' },
  footerCta: { color: T.color.accent, fontFamily: 'HankenGrotesk_700Bold' },
});
