import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { DataProvider } from '@/contexts/data-provider';

export const metadata: Metadata = {
  title: 'Gestor PIV',
  description: 'Gestiona paneles PIV y facturación de forma eficaz.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <DataProvider>
          <MainLayout>
            {children}
          </MainLayout>
          <Toaster />
        </DataProvider>
      </body>
    </html>
  );
}
