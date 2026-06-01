import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Prediction } from '../types';

/**
 * Carga las predicciones de una lista de usuarios (los miembros de un grupo).
 * Devuelve un mapa matchId -> predicciones de ese partido.
 */
export function useGroupPredictions(uids: string[]) {
  const [byMatch, setByMatch] = useState<Record<string, Prediction[]>>({});
  const [loading, setLoading] = useState(false);

  const key = uids.slice().sort().join(',');

  useEffect(() => {
    if (!uids.length) { setByMatch({}); return; }
    setLoading(true);

    // Firestore 'in' admite hasta 30 valores; los grupos son pequeños.
    const q = query(collection(db, 'predictions'), where('userId', 'in', uids.slice(0, 30)));
    getDocs(q).then((snap) => {
      const map: Record<string, Prediction[]> = {};
      snap.docs.forEach((d) => {
        const p = { id: d.id, ...d.data() } as Prediction;
        if (!map[p.matchId]) map[p.matchId] = [];
        map[p.matchId].push(p);
      });
      setByMatch(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [key]);

  return { byMatch, loading };
}
