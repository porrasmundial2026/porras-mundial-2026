import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Shell HTML solo para la versión web. No afecta a la app móvil.
 * Carga la fuente de iconos (Ionicons) desde CDN para que se vean en navegador.
 */
const css = `
@font-face {
  font-family: 'Ionicons';
  src: url('https://cdn.jsdelivr.net/npm/react-native-vector-icons@10.0.3/Fonts/Ionicons.ttf') format('truetype');
  font-display: swap;
}
html, body { background-color: #E9ECE8; }
#root { min-height: 100%; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
