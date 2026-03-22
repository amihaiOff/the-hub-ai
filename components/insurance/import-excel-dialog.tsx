'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useImportInsurance } from '@/lib/hooks/use-insurance';

type DialogStep = 'upload' | 'importing' | 'success';

interface ProfileOption {
  id: string;
  name: string;
}

interface ImportExcelDialogProps {
  profileId: string;
  profileName: string;
  allProfiles?: ProfileOption[];
}

export function ImportExcelDialog({ profileId, profileName, allProfiles }: ImportExcelDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('upload');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState(profileId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importInsurance = useImportInsurance();

  const selectedProfile = allProfiles?.find((p) => p.id === selectedProfileId);
  const displayName = selectedProfile?.name ?? profileName;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      setError('Please select an Excel file (.xlsx)');
      return;
    }

    setError('');
    setStep('importing');

    try {
      const result = await importInsurance.mutateAsync({ file, profileId: selectedProfileId });
      setImportedCount(result.imported);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
      setStep('upload');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep('upload');
      setError('');
      setImportedCount(0);
      setSelectedProfileId(profileId);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {step === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle>Import Insurance from הר הביטוח</DialogTitle>
              <DialogDescription>
                Upload the Excel file downloaded from the &ldquo;הר הביטוח&rdquo; portal. This will
                replace existing data for the selected profile.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Profile selector */}
              {allProfiles && allProfiles.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Profile</label>
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {allProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-3 text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <label
                htmlFor="excel-upload"
                className="border-muted-foreground/25 hover:border-muted-foreground/50 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors"
              >
                <FileSpreadsheet className="text-muted-foreground mb-4 h-10 w-10" />
                <span className="text-muted-foreground mb-1 text-sm">
                  Click to select an Excel file
                </span>
                <span className="text-muted-foreground text-xs">.xlsx only</span>
                <input
                  ref={fileInputRef}
                  id="excel-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>Importing...</DialogTitle>
              <DialogDescription>Please wait while the file is being processed</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Import complete</DialogTitle>
              <DialogDescription>Insurance data updated for {displayName}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">
                {importedCount} {importedCount === 1 ? 'policy' : 'policies'} imported
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
