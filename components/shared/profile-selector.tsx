'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProfileAvatar } from './profile-avatar';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { cn } from '@/lib/utils';

interface ProfileSelectorProps {
  className?: string;
}

/**
 * Multi-select dropdown to filter data by profile
 */
export function ProfileSelector({ className }: ProfileSelectorProps) {
  const {
    householdProfiles,
    selectedProfileIds,
    setSelectedProfileIds,
    selectAllProfiles,
    isProfileSelected,
    isLoading,
  } = useHouseholdContext();

  if (isLoading || householdProfiles.length === 0) {
    return null;
  }

  const allSelected = selectedProfileIds.length === householdProfiles.length;
  const selectedCount = selectedProfileIds.length;

  const handleToggle = (profileId: string) => {
    if (isProfileSelected(profileId)) {
      // Don't allow deselecting the last profile
      if (selectedProfileIds.length > 1) {
        setSelectedProfileIds(selectedProfileIds.filter((id) => id !== profileId));
      }
    } else {
      setSelectedProfileIds([...selectedProfileIds, profileId]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('gap-2', className)}>
          <div className="flex -space-x-1">
            {householdProfiles
              .filter((p) => isProfileSelected(p.id))
              .slice(0, 3)
              .map((profile) => (
                <ProfileAvatar
                  key={profile.id}
                  name={profile.name}
                  image={profile.image}
                  color={profile.color}
                  size="xs"
                  className="ring-background ring-1"
                />
              ))}
          </div>
          <span className="text-sm">
            {allSelected
              ? 'All profiles'
              : `${selectedCount} profile${selectedCount !== 1 ? 's' : ''}`}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Filter by Profile</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={allSelected} onCheckedChange={() => selectAllProfiles()}>
          <div className="flex items-center gap-2">
            <Check className={cn('h-4 w-4', !allSelected && 'opacity-0')} />
            <span>All profiles</span>
          </div>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {householdProfiles.map((profile) => (
          <DropdownMenuCheckboxItem
            key={profile.id}
            checked={isProfileSelected(profile.id)}
            onCheckedChange={() => handleToggle(profile.id)}
          >
            <div className="flex items-center gap-2">
              <ProfileAvatar
                name={profile.name}
                image={profile.image}
                color={profile.color}
                size="xs"
              />
              <span className="truncate">{profile.name}</span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
