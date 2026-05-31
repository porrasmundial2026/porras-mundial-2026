import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useGroups } from '../../hooks/useGroup';
import { C } from '../../constants/theme';

export default function UnirseGrupoScreen() {
  const { joinGroup } = useGroups();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const autoJoined = useRef(false);

  async function handleJoin(codeArg?: string) {
    const c = (codeArg ?? code).trim().toUpperCase();
    if (c.length !== 6) { setError('El código tiene 6 caracteres'); return; }
    setError('');
    setLoading(true);
    try {
      const group = await joinGroup(c);
      router.replace(`/grupo/${group.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al unirse al grupo');
      setLoading(false);
    }
  }

  // Si llega un código por enlace de invitación, intentar unirse automáticamente
  useEffect(() => {
    if (params.code && params.code.length === 6 && !autoJoined.current) {
      autoJoined.current = true;
      handleJoin(params.code);
    }
  }, [params.code]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.subtitle}>Pide el código de 6 letras al creador del grupo</Text>

        <TextInput
          style={styles.input}
          placeholder="ABC123"
          placeholderTextColor={C.textTertiary}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoFocus
          maxLength={6}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.btn, loading && styles.btnDisabled]} onPress={handleJoin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Unirse</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, paddingTop: 24 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 22 },
  input: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: C.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  error: { color: C.miss, fontSize: 13 },
  btn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
