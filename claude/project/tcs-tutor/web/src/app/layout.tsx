import type { Metadata } from 'next';
import TopBar from '@/components/TopBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'TCS Tutor',
  description: 'AI tutoring for TCS students',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
