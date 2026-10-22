import Image from 'next/image';
import { AUTH_PHOTOS } from '@/constants/auth-photos';

/**
 * THE SCHOOL PHOTOGRAPH FOR THE AUTHENTICATION SCREENS, WITH A LIGHT NAVY WASH
 * THAT TIES IT TO THE PORTAL COLOURS.
 * DESKTOP: THE FULL-HEIGHT LEFT HALF. TABLET AND MOBILE: ONE BAND ABOVE THE FORM.
 */
export function AuthPhotoPanel() {
  const photo = AUTH_PHOTOS.juniorClassroom;

  return (
    <div className='relative h-44 overflow-hidden bg-sidebar sm:h-56 lg:h-full'>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes='(min-width: 1024px) 50vw, 100vw'
        loading='eager'
        className='object-cover'
        style={{ objectPosition: photo.position }}
      />
      <div aria-hidden className='absolute inset-0 bg-sidebar/15' />
    </div>
  );
}
