'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar } from '@/components/shared/profile-avatar';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { useIsHouseholdAdmin } from '@/lib/contexts/household-context';
import { useCreateProfile, useUpdateProfile, useDeleteProfile } from '@/lib/hooks/use-profiles';

const PROFILE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function ProfilesSettingsPage() {
  const { householdProfiles, profile, refetch, isLoading } = useHouseholdContext();
  const isAdmin = useIsHouseholdAdmin();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editProfile, setEditProfile] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0]);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    try {
      await createProfile.mutateAsync({
        name: newName.trim(),
        color: newColor,
      });
      setShowAddDialog(false);
      setNewName('');
      setNewColor(PROFILE_COLORS[0]);
      refetch();
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editProfile || !editProfile.name.trim()) return;

    try {
      await updateProfile.mutateAsync({
        id: editProfile.id,
        name: editProfile.name.trim(),
        color: editProfile.color,
      });
      setEditProfile(null);
      refetch();
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const handleDelete = async (profileId: string) => {
    try {
      await deleteProfile.mutateAsync(profileId);
      setDeleteConfirm(null);
      refetch();
    } catch (error) {
      console.error('Error deleting profile:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Profiles</h1>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Profiles</h1>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Profile
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Family Members</CardTitle>
          <CardDescription>
            Profiles in your household. Each profile can own assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {householdProfiles.map((p) => {
            const isOwnProfile = p.id === profile?.id;
            const canEdit = isOwnProfile || (isAdmin && !p.hasUser);
            const canDelete = isAdmin && !p.hasUser && !isOwnProfile;

            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                <ProfileAvatar name={p.name} image={p.image} color={p.color} size="md" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {isOwnProfile && (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {p.hasUser ? 'Has login' : 'No login (family member)'}
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEditProfile({
                          id: p.id,
                          name: p.name,
                          color: p.color || PROFILE_COLORS[0],
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add Profile Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Family Member</DialogTitle>
            <DialogDescription>
              Create a profile for a family member who doesn&apos;t need their own login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Family member name"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-8 w-8 rounded-full transition-transform ${
                      newColor === color
                        ? 'ring-offset-background scale-110 ring-2 ring-offset-2'
                        : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createProfile.isPending}>
              {createProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editProfile} onOpenChange={() => setEditProfile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update profile details</DialogDescription>
          </DialogHeader>
          {editProfile && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editProfile.name}
                  onChange={(e) => setEditProfile({ ...editProfile, name: e.target.value })}
                  placeholder="Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-full transition-transform ${
                        editProfile.color === color
                          ? 'ring-offset-background scale-110 ring-2 ring-offset-2'
                          : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditProfile({ ...editProfile, color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!editProfile?.name.trim() || updateProfile.isPending}
            >
              {updateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this profile? This action cannot be undone. Any assets
              owned by this profile will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteProfile.isPending}
            >
              {deleteProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
