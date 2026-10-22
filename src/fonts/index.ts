import { Geist } from 'next/font/google';

/** THE ONLY FACE IN THE PORTAL, FOR ALL TEXT (CODES, DATES AND NUMBERS USE tabular-nums). EXPOSED AS --font-geist-sans (font-sans). */
export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});
