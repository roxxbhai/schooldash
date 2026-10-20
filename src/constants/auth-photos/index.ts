/**
 * THE FOUR SCHOOL PHOTOGRAPHS SUPPLIED FOR THE SIGN-IN SCREENS. USED ONLY ON
 * AUTHENTICATION PAGES, NEVER INSIDE THE PORTAL.
 */
export const AUTH_PHOTOS = {
  juniorClassroom: {
    src: '/images/school/junior-classroom.jpg',
    alt: 'Junior students smiling at their desks in a classroom',
    position: '50% 45%',
  },
  sportsDay: {
    src: '/images/school/sports-day-ground.jpg',
    alt: 'Students in green house uniforms lined up on the sports ground',
    position: '72% 60%',
  },
  seniorStudents: {
    src: '/images/school/senior-students-classroom.jpg',
    alt: 'Senior students in white shirts and striped ties in class',
    position: '55% 40%',
  },
  libraryReader: {
    src: '/images/school/student-reading-library.jpg',
    alt: 'A student reading a book in the school library',
    position: '35% 40%',
  },
} as const;
