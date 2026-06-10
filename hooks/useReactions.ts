import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Reaction {
  id: string;
  groupId: string;
  matchId: string;
  targetUid: string;   // dueño de la predicción reaccionada
  fromUid: string;     // quién reacciona
  fromName: string;
  emoji: string;
}

/** Clave para agrupar reacciones de una predicción concreta. */
export function reactionKey(matchId: string, targetUid: string): string {
  return `${matchId}__${targetUid}`;
}

function docId(matchId: string, targetUid: string, fromUid: string): string {
  return `${matchId}__${targetUid}__${fromUid}`;
}

export function useReactions(groupId: string | null) {
  // Mapa "matchId__targetUid" -> reacciones
  const [byPrediction, setByPrediction] = useState<Record<string, Reaction[]>>({});

  useEffect(() => {
    if (!groupId) { setByPrediction({}); return; }
    const q = query(collection(db, 'reactions'), where('groupId', '==', groupId));
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, Reaction[]> = {};
      snap.docs.forEach((d) => {
        const r = { id: d.id, ...d.data() } as Reaction;
        const k = reactionKey(r.matchId, r.targetUid);
        if (!map[k]) map[k] = [];
        map[k].push(r);
      });
      setByPrediction(map);
    }, () => {});
    return unsub;
  }, [groupId]);

  return byPrediction;
}

/**
 * Alterna la reacción de un usuario sobre una predicción:
 * - Si ya tenía ese mismo emoji → lo quita
 * - Si tenía otro o ninguno → lo pone (una reacción por persona y predicción)
 */
export async function toggleReaction(
  groupId: string,
  matchId: string,
  target: { uid: string; name: string },
  from: { uid: string; name: string },
  emoji: string,
) {
  const ref = doc(db, 'reactions', docId(matchId, target.uid, from.uid));
  const snap = await getDoc(ref);
  if (snap.exists() && (snap.data() as any).emoji === emoji) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    groupId,
    matchId,
    targetUid: target.uid,
    targetName: target.name,
    fromUid: from.uid,
    fromName: from.name,
    emoji,
    createdAt: serverTimestamp(),
  });
}
