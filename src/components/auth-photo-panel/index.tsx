import Image from 'next/image';
import { SchoolWordmark } from '@/components/school-wordmark';
import { AUTH_PHOTOS } from '@/constants/auth-photos';
import { SCHOOL } from '@/constants/school';
import { cn } from '@/helpers/cn';

/**
 * BOTH LAYOUTS ARE IN THE PAGE AND LOAD EAGERLY; `sizes` MAKES THE BROWSER FETCH
 * ONLY A TINY VERSION OF WHICHEVER LAYOUT IS HIDDEN AT THE CURRENT WIDTH.
 */
const HIDDEN_ON_DESKTOP = '(min-width: 1024px) 1px, 100vw';

interface PhotoTileProps {
  photo: (typeof AUTH_PHOTOS)[keyof typeof AUTH_PHOTOS];
  sizes: string;
  className?: string;
  /** EAGER FOR TILES THAT ARE ON SCREEN AS THE PAGE OPENS. */
  isEager?: boolean;
}

/** ONE CROPPED PHOTO WITH A LIGHT NAVY WASH, SO THE DIFFERENTLY GRADED PHOTOGRAPHS READ AS ONE SET. */
function PhotoTile({ photo, sizes, className, isEager = false }: PhotoTileProps) {
  return (
    <div className={cn('relative overflow-hidden bg-sidebar', className)}>
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        loading={isEager ? 'eager' : 'lazy'}
        className='object-cover'
        style={{ objectPosition: photo.position }}
      />
      <div aria-hidden className='absolute inset-0 bg-sidebar/15' />
    </div>
  );
}

/**
 * SCHOOL PHOTOGRAPHS FOR THE AUTHENTICATION SCREENS.
 * DESKTOP: A FULL-HEIGHT MOSAIC BESIDE THE FORM. TABLET AND MOBILE: ONE BAND ABOVE IT.
 */
export function AuthPhotoPanel() {
  return (
    <>
      {/* TABLET AND MOBILE */}
      <div className='relative h-44 sm:h-56 lg:hidden'>
        <PhotoTile photo={AUTH_PHOTOS.juniorClassroom} sizes={HIDDEN_ON_DESKTOP} className='absolute inset-0' isEager />
        <div aria-hidden className='absolute inset-0 bg-linear-to-t from-sidebar/90 via-sidebar/30 to-transparent' />
        <SchoolWordmark tone='inverse' className='absolute bottom-5 left-5 sm:left-8' />
      </div>

      {/* DESKTOP */}
      <div className='relative hidden h-full grid-cols-6 grid-rows-6 gap-1 bg-sidebar p-1 lg:grid'>
        <div className='relative col-span-4 row-span-4'>
          <PhotoTile photo={AUTH_PHOTOS.juniorClassroom} sizes='(min-width: 1024px) 40vw, 1px' className='absolute inset-0' isEager />
          <div aria-hidden className='absolute inset-0 bg-linear-to-t from-sidebar/90 via-sidebar/20 to-transparent' />
          <div className='absolute right-8 bottom-8 left-8'>
            <SchoolWordmark tone='inverse' size='lg' />
            <p className='mt-4 max-w-md text-base text-white/80'>
              {SCHOOL.fullName}, {SCHOOL.location}
            </p>
          </div>
        </div>
        <PhotoTile photo={AUTH_PHOTOS.sportsDay} sizes='(min-width: 1024px) 20vw, 1px' className='col-span-2 row-span-6' isEager />
        <PhotoTile photo={AUTH_PHOTOS.seniorStudents} sizes='(min-width: 1024px) 20vw, 1px' className='col-span-2 row-span-2' isEager />
        <PhotoTile photo={AUTH_PHOTOS.libraryReader} sizes='(min-width: 1024px) 20vw, 1px' className='col-span-2 row-span-2' isEager />
      </div>
    </>
  );
}
