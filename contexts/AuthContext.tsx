import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  deleteUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, arrayRemove } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Camino crítico SIN awaits: la app deja de cargar de inmediato.
      if (firebaseUser) {
        setUser(firebaseUser);
        setProfile({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName ?? 'Usuario',
          email: firebaseUser.email ?? '',
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);

      // Tareas de Firestore en segundo plano (no bloquean la carga).
      if (firebaseUser) {
        (async () => {
          try {
            const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (snap.exists() && (snap.data() as any).banned) {
              await signOut(auth);
              setUser(null);
              setProfile(null);
              return;
            }
            await ensureUserProfile(firebaseUser);
          } catch {
            // sin conexión / permisos: la app sigue funcionando
          }
        })();
      }
    });
    return unsubscribe;
  }, []);

  async function ensureUserProfile(firebaseUser: User) {
    const ref = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: firebaseUser.displayName ?? 'Usuario',
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL ?? null,
        createdAt: serverTimestamp(),
      });
    }
  }

  async function signIn(email: string, password: string) {
    const { user: firebaseUser } = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snap.exists() && (snap.data() as any).banned) {
      await signOut(auth);
      throw { code: 'auth/user-banned' };
    }
  }

  async function signUp(email: string, password: string, displayName: string) {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(newUser, { displayName });
    // Forzamos el displayName correcto en Firestore con merge:true para evitar
    // la race condition con onAuthStateChanged que puede guardar 'Usuario' antes
    await setDoc(doc(db, 'users', newUser.uid), {
      displayName,
      email: newUser.email,
      photoURL: newUser.photoURL ?? null,
      createdAt: serverTimestamp(),
    }, { merge: true });
  }

  async function signInWithGoogle(idToken: string) {
    const credential = GoogleAuthProvider.credential(idToken);
    const { user: googleUser } = await signInWithCredential(auth, credential);
    await ensureUserProfile(googleUser);
  }

  async function logOut() {
    await signOut(auth);
  }

  async function updateDisplayName(name: string) {
    if (!user) return;
    await updateProfile(user, { displayName: name });
    await updateDoc(doc(db, 'users', user.uid), { displayName: name });
    setProfile((prev) => prev ? { ...prev, displayName: name } : null);
  }

  async function deleteAccount() {
    const current = auth.currentUser;
    if (!current) throw new Error('No autenticado');
    const uid = current.uid;

    // Borrar datos del usuario en Firestore
    const batch = writeBatch(db);
    const predsSnap = await getDocs(query(collection(db, 'predictions'), where('userId', '==', uid)));
    predsSnap.docs.forEach((d) => batch.delete(d.ref));
    const groupsSnap = await getDocs(query(collection(db, 'groups'), where('members', 'array-contains', uid)));
    groupsSnap.docs.forEach((d) => batch.update(d.ref, { members: arrayRemove(uid) }));
    batch.delete(doc(db, 'users', uid));
    await batch.commit();

    // Borrar la cuenta de Firebase Auth (requiere sesión reciente)
    await deleteUser(current);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithGoogle, logOut, updateDisplayName, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
