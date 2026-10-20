import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** MERGES CONDITIONAL CLASS NAMES; LATER TAILWIND CLASSES OVERRIDE EARLIER CONFLICTING ONES. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
