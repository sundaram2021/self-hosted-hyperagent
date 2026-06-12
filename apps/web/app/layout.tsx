import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';

import './globals.css';

export const metadata: Metadata = {
  title: 'Self-Hosted Hyperagent',
  description:
    'Self-hosted, multi-provider AI agent platform — MCP servers, Skills, Exa search, memory, and observability.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex">
          <Sidebar />
          <main className="h-screen flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
