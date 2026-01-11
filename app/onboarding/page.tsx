'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@stackframe/stack';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Home, User, Users, Check, Plus, X } from 'lucide-react';

type Step = 'welcome' | 'profile' | 'household' | 'members' | 'complete';

interface FamilyMember {
  name: string;
  color: string;
}

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

export default function OnboardingPage() {
  const user = useUser();
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [profileName, setProfileName] = useState('');
  const [profileColor, setProfileColor] = useState(PROFILE_COLORS[0]);
  const [householdName, setHouseholdName] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [newMemberName, setNewMemberName] = useState('');

  // Update default values when user loads
  useEffect(() => {
    if (user?.displayName && !profileName) {
      setProfileName(user.displayName);
      setHouseholdName(`${user.displayName}'s Household`);
    }
  }, [user?.displayName, profileName]);

  const handleAddMember = () => {
    if (newMemberName.trim()) {
      const usedColors = familyMembers.map((m) => m.color);
      const availableColor =
        PROFILE_COLORS.find((c) => !usedColors.includes(c) && c !== profileColor) ||
        PROFILE_COLORS[familyMembers.length % PROFILE_COLORS.length];

      setFamilyMembers([...familyMembers, { name: newMemberName.trim(), color: availableColor }]);
      setNewMemberName('');
    }
  };

  const handleRemoveMember = (index: number) => {
    setFamilyMembers(familyMembers.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileName: profileName.trim(),
          profileColor,
          householdName: householdName.trim(),
          familyMembers: familyMembers.map((m) => ({
            name: m.name,
            color: m.color,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to complete setup');
      }

      setStep('complete');

      // Redirect to dashboard after short delay
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // In dev mode with SKIP_AUTH, user may be null but onboarding still works
  // The API uses SKIP_AUTH to provide a dev user

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        {step === 'welcome' && (
          <>
            <CardHeader className="text-center">
              <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <Home className="text-primary h-8 w-8" />
              </div>
              <CardTitle className="text-2xl">Welcome to The Hub AI</CardTitle>
              <CardDescription>
                Let&apos;s set up your household to track your family&apos;s finances together.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setStep('profile')}>
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </>
        )}

        {step === 'profile' && (
          <>
            <CardHeader>
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <User className="text-primary h-6 w-6" />
              </div>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>
                Confirm your name and pick a color for your profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profileName">Your Name</Label>
                <Input
                  id="profileName"
                  value={profileName}
                  onChange={(e) => {
                    setProfileName(e.target.value);
                    if (!householdName || householdName.endsWith("'s Household")) {
                      setHouseholdName(`${e.target.value}'s Household`);
                    }
                  }}
                  placeholder="Enter your name"
                />
              </div>

              <div className="space-y-2">
                <Label>Profile Color</Label>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-full transition-transform ${
                        profileColor === color
                          ? 'ring-offset-background scale-110 ring-2 ring-offset-2'
                          : ''
                      }`}
                      style={
                        { backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties
                      }
                      onClick={() => setProfileColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep('welcome')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep('household')}
                  disabled={!profileName.trim()}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'household' && (
          <>
            <CardHeader>
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <Home className="text-primary h-6 w-6" />
              </div>
              <CardTitle>Name Your Household</CardTitle>
              <CardDescription>
                This is where you&apos;ll track finances for yourself and your family.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="householdName">Household Name</Label>
                <Input
                  id="householdName"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="e.g., Smith Family"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep('profile')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep('members')}
                  disabled={!householdName.trim()}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'members' && (
          <>
            <CardHeader>
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <Users className="text-primary h-6 w-6" />
              </div>
              <CardTitle>Add Family Members</CardTitle>
              <CardDescription>
                Add profiles for family members whose finances you want to track. You can skip this
                and add them later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current user */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: profileColor }}
                >
                  {profileName[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{profileName}</div>
                  <div className="text-muted-foreground text-xs">You (Owner)</div>
                </div>
              </div>

              {/* Family members */}
              {familyMembers.map((member, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{member.name}</div>
                    <div className="text-muted-foreground text-xs">Family Member</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRemoveMember(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {/* Add member input */}
              <div className="flex gap-2">
                <Input
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Family member name"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                />
                <Button
                  variant="outline"
                  onClick={handleAddMember}
                  disabled={!newMemberName.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep('household')}>
                  Back
                </Button>
                <Button className="flex-1" onClick={handleComplete} disabled={isSubmitting}>
                  {isSubmitting ? 'Setting up...' : 'Complete Setup'}
                  {!isSubmitting && <Check className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 'complete' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
              <CardDescription>
                Your household has been created. Redirecting to your dashboard...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div className="bg-muted h-1 w-32 overflow-hidden rounded-full">
                  <div className="bg-primary h-full animate-pulse" style={{ width: '100%' }} />
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
