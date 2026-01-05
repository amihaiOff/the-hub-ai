'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MoreHorizontal, Shield, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  useHousehold,
  useUpdateHousehold,
  useUpdateHouseholdMember,
  useRemoveHouseholdMember,
} from '@/lib/hooks/use-households';

export default function HouseholdSettingsPage() {
  const { activeHousehold, profile, refetch } = useHouseholdContext();
  const {
    data: household,
    isLoading,
    refetch: refetchHousehold,
  } = useHousehold(activeHousehold?.id || '');
  const updateHousehold = useUpdateHousehold();
  const updateMember = useUpdateHouseholdMember();
  const removeMember = useRemoveHouseholdMember();

  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const isOwner = activeHousehold?.role === 'owner';
  const isAdmin = activeHousehold?.role === 'admin' || isOwner;

  const handleSaveName = async () => {
    if (!activeHousehold || !name.trim()) return;

    try {
      await updateHousehold.mutateAsync({
        id: activeHousehold.id,
        name: name.trim(),
      });
      setEditName(false);
      refetch();
    } catch (error) {
      console.error('Error updating household name:', error);
    }
  };

  const handleChangeRole = async (profileId: string, newRole: 'admin' | 'member') => {
    if (!activeHousehold) return;

    try {
      await updateMember.mutateAsync({
        householdId: activeHousehold.id,
        profileId,
        role: newRole,
      });
      refetchHousehold();
    } catch (error) {
      console.error('Error updating member role:', error);
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!activeHousehold) return;

    try {
      await removeMember.mutateAsync({
        householdId: activeHousehold.id,
        profileId,
      });
      setConfirmRemove(null);
      refetchHousehold();
    } catch (error) {
      console.error('Error removing member:', error);
    }
  };

  if (isLoading || !activeHousehold) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Household Settings</h1>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-32 rounded-lg" />
          <div className="bg-muted h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Household Settings</h1>
      </div>

      {/* Household Name */}
      <Card>
        <CardHeader>
          <CardTitle>Household Name</CardTitle>
          <CardDescription>The name of your household</CardDescription>
        </CardHeader>
        <CardContent>
          {editName ? (
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Household name"
                autoFocus
              />
              <Button onClick={handleSaveName} disabled={updateHousehold.isPending}>
                {updateHousehold.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setEditName(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-lg font-medium">{activeHousehold.name}</span>
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setName(activeHousehold.name);
                    setEditName(true);
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People who belong to this household</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {household?.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
              <ProfileAvatar
                name={member.name}
                image={member.image}
                color={member.color}
                size="md"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{member.name}</span>
                  {member.id === profile?.id && (
                    <Badge variant="outline" className="text-xs">
                      You
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Badge
                    variant={member.role === 'owner' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {member.role}
                  </Badge>
                  {!member.hasUser && <span className="text-xs">No login</span>}
                </div>
              </div>
              {isAdmin && member.id !== profile?.id && member.role !== 'owner' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.role === 'member' && (
                      <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'admin')}>
                        <Shield className="mr-2 h-4 w-4" />
                        Make Admin
                      </DropdownMenuItem>
                    )}
                    {member.role === 'admin' && (
                      <DropdownMenuItem onClick={() => handleChangeRole(member.id, 'member')}>
                        <Shield className="mr-2 h-4 w-4" />
                        Remove Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setConfirmRemove(member.id)}
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove from Household
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the household? Their assets will
              remain but they won&apos;t be part of this household anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmRemove && handleRemoveMember(confirmRemove)}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
