'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProfileAvatar } from './profile-avatar';
import { useHouseholdContext, HouseholdProfile } from '@/lib/contexts/household-context';
import { cn } from '@/lib/utils';

interface OwnerSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  currentOwnerIds?: string[];
  onSave: (profileIds: string[]) => Promise<void>;
}

/**
 * Dialog to select profile owners for an asset
 */
export function OwnerSelectDialog({
  open,
  onOpenChange,
  title = 'Select Owners',
  description = 'Choose which profiles own this asset',
  currentOwnerIds = [],
  onSave,
}: OwnerSelectDialogProps) {
  const { householdProfiles, isLoading: profilesLoading } = useHouseholdContext();
  const [selectedIds, setSelectedIds] = useState<string[]>(currentOwnerIds);
  const [isSaving, setIsSaving] = useState(false);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIds(currentOwnerIds);
    }
  }, [open, currentOwnerIds]);

  const handleToggle = (profileId: string) => {
    setSelectedIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  };

  const handleSave = async () => {
    if (selectedIds.length === 0) return;

    setIsSaving(true);
    try {
      await onSave(selectedIds);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving owners:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {profilesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : householdProfiles.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No profiles found in this household
            </p>
          ) : (
            <div className="space-y-2">
              {householdProfiles.map((profile) => (
                <ProfileSelectItem
                  key={profile.id}
                  profile={profile}
                  selected={selectedIds.includes(profile.id)}
                  onToggle={() => handleToggle(profile.id)}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={selectedIds.length === 0 || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProfileSelectItemProps {
  profile: HouseholdProfile;
  selected: boolean;
  onToggle: () => void;
}

function ProfileSelectItem({ profile, selected, onToggle }: ProfileSelectItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
      )}
    >
      <ProfileAvatar name={profile.name} image={profile.image} color={profile.color} size="md" />
      <div className="flex-1 text-left">
        <div className="font-medium">{profile.name}</div>
        <div className="text-muted-foreground text-xs">
          {profile.hasUser ? 'User account' : 'Family member'}
        </div>
      </div>
      <div
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </div>
    </button>
  );
}
