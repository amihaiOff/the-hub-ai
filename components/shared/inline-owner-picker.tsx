'use client';

import { Check, Loader2 } from 'lucide-react';
import { ProfileAvatar } from './profile-avatar';
import { useHouseholdContext, HouseholdProfile } from '@/lib/contexts/household-context';
import { cn } from '@/lib/utils';

interface InlineOwnerPickerProps {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Inline component for selecting profile owners within forms
 * Displays all household profiles as selectable items
 */
export function InlineOwnerPicker({
  selectedIds,
  onSelectionChange,
  disabled = false,
  className,
}: InlineOwnerPickerProps) {
  const { householdProfiles, isLoading } = useHouseholdContext();

  const handleToggle = (profileId: string) => {
    if (disabled) return;

    if (selectedIds.includes(profileId)) {
      // Don't allow deselecting the last owner
      if (selectedIds.length > 1) {
        onSelectionChange(selectedIds.filter((id) => id !== profileId));
      }
    } else {
      onSelectionChange([...selectedIds, profileId]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (householdProfiles.length === 0) {
    return (
      <p className="text-muted-foreground py-2 text-sm">No profiles found in this household</p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {householdProfiles.map((profile) => (
        <ProfileSelectItem
          key={profile.id}
          profile={profile}
          selected={selectedIds.includes(profile.id)}
          onToggle={() => handleToggle(profile.id)}
          disabled={disabled}
          isLastSelected={selectedIds.length === 1 && selectedIds.includes(profile.id)}
        />
      ))}
    </div>
  );
}

interface ProfileSelectItemProps {
  profile: HouseholdProfile;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  isLastSelected?: boolean;
}

function ProfileSelectItem({
  profile,
  selected,
  onToggle,
  disabled,
  isLastSelected,
}: ProfileSelectItemProps) {
  const isDisabled = disabled || (isLastSelected && selected);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-2.5 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
        isDisabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <ProfileAvatar name={profile.name} image={profile.image} color={profile.color} size="sm" />
      <div className="flex-1 text-left">
        <div className="text-sm font-medium">{profile.name}</div>
        <div className="text-muted-foreground text-xs">
          {profile.hasUser ? 'User account' : 'Family member'}
        </div>
      </div>
      <div
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" />}
      </div>
    </button>
  );
}
