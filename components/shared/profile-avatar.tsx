'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ProfileAvatarProps {
  name: string;
  image?: string | null;
  color?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

const sizePixels = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
};

/**
 * Profile avatar component that shows image or initials with background color
 */
export function ProfileAvatar({
  name,
  image,
  color = '#3b82f6',
  size = 'md',
  className,
}: ProfileAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (image) {
    return (
      <Image
        src={image}
        alt={name}
        width={sizePixels[size]}
        height={sizePixels[size]}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-medium text-white',
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: color || '#3b82f6' }}
      title={name}
    >
      {initials}
    </div>
  );
}
