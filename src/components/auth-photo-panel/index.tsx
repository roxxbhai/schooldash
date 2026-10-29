import Image from 'next/image';
import { SchoolWordmark } from '@/components/school-wordmark';
import { AUTH_PHOTOS } from '@/constants/auth-photos';

/**
 * THE SCHOOL PHOTOGRAPH FOR THE AUTHENTICATION SCREENS, WITH A LIGHT NAVY WASH
 * THAT TIES IT TO THE PORTAL COLOURS AND THE SCHOOL CREST AND NAME ALONG THE BOTTOM.
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
        {/* NAVY FADE UP FROM THE BOTTOM SO THE GOLD CREST AND WHITE NAME READ ON ANY PART OF THE PHOTO */}
        <div aria-hidden className='absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-sidebar/90 via-sidebar/45 to-transparent lg:h-1/2' />
        <SchoolWordmark tone='inverse' size='md' className='absolute bottom-4 left-5 sm:bottom-5 sm:left-10 lg:hidden' />
        <SchoolWordmark tone='inverse' size='lg' className='absolute bottom-10 left-10 hidden lg:flex' />
      </div>
    </div>
  );
}
