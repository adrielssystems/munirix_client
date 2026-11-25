import './globals.css';
import NextAuthProvider from '@/components/ui/SessionProvider';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_CLIENT_URL || 'https://client.munirix.net'),
  title: "Munirix — Workspace de Agentes IA",
  description: 'Panel operativo por organización con Agenda, WhatsApp IA, Pacientes y Google Workspace.',
  icons: {
    icon: '/brand/Logo_Munirix_sin_fondo.png',
    apple: '/brand/Logo_Munirix_sin_fondo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextAuthProvider>{children}</NextAuthProvider>
      </body>
    </html>
  );
}
