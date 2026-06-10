import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Poke {
  id: string;
  groupId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  emoji: string;
  createdAt?: { seconds: number } | null;
}

export function usePokes(groupId: string | null) {
  const [pokes, setPokes] = useState<Poke[]>([]);

  useEffect(() => {
    if (!groupId) { setPokes([]); return; }
    const q = query(collection(db, 'pokes'), where('groupId', '==', groupId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Poke));
      // Ordenar por fecha desc en cliente (evita índice compuesto)
      list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setPokes(list.slice(0, 40));
    }, () => {});
    return unsub;
  }, [groupId]);

  return pokes;
}

export async function sendPoke(
  groupId: string,
  from: { uid: string; name: string },
  to: { uid: string; name: string },
  emoji: string,
) {
  await addDoc(collection(db, 'pokes'), {
    groupId,
    fromUid: from.uid,
    fromName: from.name,
    toUid: to.uid,
    toName: to.name,
    emoji,
    createdAt: serverTimestamp(),
  });
}
