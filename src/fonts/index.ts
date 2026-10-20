import { Geist, Geist_Mono } from 'next/font/google';

/** PRIMARY FACE FOR ALL INTERFACE TEXT. EXPOSED AS --font-geist-sans (font-sans). */
export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

/** SECONDARY FACE FOR IDS, CODES, DATES, TIMES AND OTHER TECHNICAL VALUES. EXPOSED AS --font-geist-mono (font-mono). */
export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});
