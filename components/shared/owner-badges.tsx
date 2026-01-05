'use client';

import { ProfileAvatar } from './profile-avatar';
import { cn } from '@/lib/utils';

interface Owner {
  id: string;
  name: string;
  image?: string | null;
  color?: string | null;
}

interface OwnerBadgesProps {
  owners: Owner[];
  maxDisplay?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * Display profile avatars for asset owners with overlap effect
 */
export function OwnerBadges({ owners, maxDisplay = 3, size = 'sm', className }: OwnerBadgesProps) {
  if (!owners || owners.length === 0) {
    return null;
  }

  const displayOwners = owners.slice(0, maxDisplay);
  const remaining = owners.length - maxDisplay;

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {displayOwners.map((owner) => (
          <ProfileAvatar
            key={owner.id}
            name={owner.name}
            image={owner.image}
            color={owner.color}
            size={size}
            className="ring-background ring-2"
          />
        ))}
        {remaining > 0 && (
          <div
            className={cn(
              'bg-muted text-muted-foreground ring-background flex items-center justify-center rounded-full font-medium ring-2',
              size === 'xs' && 'h-6 w-6 text-xs',
              size === 'sm' && 'h-8 w-8 text-xs',
              size === 'md' && 'h-10 w-10 text-sm'
            )}
            title={`${remaining} more`}
          >
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}
