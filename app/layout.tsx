import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Text Humanizer Pro',
  description: 'AI Text Humanizer Pro',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
