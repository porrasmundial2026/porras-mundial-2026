import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Prediction } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { calculatePoints } from '../lib/scoring';
import { MATCH_BY_ID } from '../constants/matches';
import { track } from '../lib/analytics';

export function usePredictions() {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'predictions'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Prediction));
      setPredictions(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const getPrediction = useCallback(
    (matchId: string) => predictions.find((p) => p.matchId === matchId),
    [predictions]
  );

  const savePrediction = useCallback(
    async (matchId: string, homeScore: number, awayScore: number, realStart?: number) => {
      if (!user) throw new Error('Not authenticated');

      const match = MATCH_BY_ID[matchId];
      if (!match) throw new Error('Match not found');
      // Cierre por la hora REAL de inicio (la que pasa la tarjeta desde los datos en vivo)
      if (realStart != null && realStart <= Date.now()) {
        throw new Error('El partido ya ha comenzado');
      }

      const docId = `${user.uid}_${matchId}`;
      const points =
        match.status === 'finished'
          ? calculatePoints({ homeScore, awayScore }, match)
          : undefined;

      await setDoc(
        doc(db, 'predictions', docId),
        {
          userId: user.uid,
          matchId,
          homeScore,
          awayScore,
          ...(points !== undefined && { points }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      track('prediction_saved', { matchId });
    },
    [user]
  );

  return { predictions, loading, getPrediction, savePrediction };
}
