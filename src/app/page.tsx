import { redirect } from 'next/navigation';
import { ROUTES } from '@/constants/routes';

/** THE SIGN-IN PAGE SENDS ANYONE ALREADY SIGNED IN ON TO THEIR OWN HOME PAGE. */
export default function HomePage() {
  redirect(ROUTES.studentSignIn);
}
