import { AuthPhotoPanel } from '@/components/auth-photo-panel';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className='min-h-dvh bg-card lg:grid lg:h-dvh lg:grid-cols-2'>
      <AuthPhotoPanel />
      <main className='flex flex-col lg:h-dvh lg:overflow-y-auto'>{children}</main>
    </div>
  );
}
