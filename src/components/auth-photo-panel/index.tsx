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
    // FROM lg THE PHOTO SITS INSET IN A ROUNDED FRAME WITH A SOFT SHADOW, LIKE A CARD ON THE PAGE.
    <div className='lg:h-full lg:p-3'>
      <div className='relative h-44 overflow-hidden bg-sidebar sm:h-56 lg:h-full lg:rounded-3xl lg:shadow-md'>
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
    </div>
  );
}
