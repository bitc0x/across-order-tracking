import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Across Order Tracking',
  description:
    'Async order tracking and recovery semantics for cross-chain intents settled via Across. ' +
    'Direct response to ether.fi\'s ask: "Across handles async states and refunds."',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
