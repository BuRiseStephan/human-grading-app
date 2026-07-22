import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Human Grading — Qwen Abbreviation Study",
  description: "Blinded human grading for the 10% validation sample",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <span className="brand">Human Grading — Abbreviation Study</span>
            <nav>
              <Link href="/">Graders</Link>
              <Link href="/rubric">Rubric</Link>
              <Link href="/results">Progress</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
