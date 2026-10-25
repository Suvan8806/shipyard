import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next, Sofia_Sans_Condensed } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

// Departures type: a condensed board face for flap cells and headings, a hyperlegible UI face that reads from the
// back of a hall, and its mono sibling for specs, assertions, diffs and money.
const board = Sofia_Sans_Condensed({
  variable: "--font-board",
  subsets: ["latin"],
  display: "swap",
});

const ui = Atkinson_Hyperlegible_Next({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const mono = Atkinson_Hyperlegible_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shipyard",
  description: "Crash-test dummies for enterprise agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${board.variable} ${ui.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="sy-theme" disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
