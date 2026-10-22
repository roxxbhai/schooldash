import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SCHOOL } from '@/constants/school';
import { geistSans } from '@/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SCHOOL.name} · ${SCHOOL.portalName}`, template: `%s · ${SCHOOL.name}` },
  description: `${SCHOOL.fullName}, ${SCHOOL.location}: school management portal.`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='en' className={`${geistSans.variable} h-full`}>
      <body className='min-h-full'>
        {/* AFTER ONE TOOLTIP, NEIGHBOURS WITHIN 500MS OPEN INSTANTLY AND UNANIMATED (E.G. RUNNING ALONG THE SIDEBAR RAIL). */}
        <TooltipProvider delayDuration={300} skipDelayDuration={500}>{children}</TooltipProvider>
        <Toaster position='top-right' closeButton />
      </body>
    </html>
  );
}
