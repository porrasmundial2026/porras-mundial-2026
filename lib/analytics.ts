import { Platform } from 'react-native';
import app from './firebase';

type Params = Record<string, string | number | boolean>;

// Solo en web. En móvil el SDK JS no envía Analytics (haría falta el módulo
// nativo), así que aquí dejamos un no-op para no tocar el build de Android.
let _log: (name: string, params?: Params) => void = () => {};

if (Platform.OS === 'web') {
  // Carga diferida: 'firebase/analytics' no debe entrar en el bundle nativo.
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported, logEvent }) =>
      isSupported().then((ok) => {
        if (!ok) return;
        const analytics = getAnalytics(app);
        _log = (name, params) => logEvent(analytics, name, params);
      })
    )
    .catch(() => {
      /* sin analytics (p.ej. navegador sin soporte) → seguimos sin romper nada */
    });
}

/** Registra un evento en Analytics (solo web; en móvil no hace nada). */
export function track(name: string, params?: Params) {
  try {
    _log(name, params);
  } catch {
    /* nunca debe romper la app por un evento */
  }
}

/** Registra la visita a una pantalla. */
export function trackScreen(name: string) {
  track('screen_view', { firebase_screen: name, firebase_screen_class: name });
}
