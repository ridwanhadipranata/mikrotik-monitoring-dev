import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMANNA JATIPURO — Network Monitor",
  description: "Real-time Mikrotik router monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var t = localStorage.getItem('theme') || 'system';
            var d = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (d) document.documentElement.classList.add('dark');
          })();
        `}} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
