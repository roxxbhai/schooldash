import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SCHOOL } from '@/constants/school';
import { geistMono, geistSans } from '@/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SCHOOL.name} · ${SCHOOL.portalName}`, template: `%s · ${SCHOOL.name}` },
  description: `${SCHOOL.fullName}, ${SCHOOL.location}: school management portal.`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='en' className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className='min-h-full'>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position='top-right' closeButton />
      </body>
    </html>
  );
}
