'use client';

import Link from 'next/link';
import { Home, Users, ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHouseholdContext } from '@/lib/contexts/household-context';

const settingsLinks = [
  {
    href: '/settings/household',
    title: 'Household',
    description: 'Manage household members and roles',
    icon: Home,
  },
  {
    href: '/settings/profiles',
    title: 'Profiles',
    description: 'Manage family member profiles',
    icon: Users,
  },
];

export default function SettingsPage() {
  const { activeHousehold, isLoading } = useHouseholdContext();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        {activeHousehold && <p className="text-muted-foreground">{activeHousehold.name}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="hover:bg-muted/50 h-full transition-colors">
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                    <Icon className="text-primary h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                  <ChevronRight className="text-muted-foreground h-5 w-5" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
