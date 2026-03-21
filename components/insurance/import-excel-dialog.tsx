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
import { useImportInsurance } from '@/lib/hooks/use-insurance';

type DialogStep = 'upload' | 'importing' | 'success';

interface ImportExcelDialogProps {
  profileId: string;
  profileName: string;
}

export function ImportExcelDialog({ profileId, profileName }: ImportExcelDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('upload');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importInsurance = useImportInsurance();

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
      const result = await importInsurance.mutateAsync({ file, profileId });
      setImportedCount(result.imported);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
      setStep('upload');
    }

    // Reset file input
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
                Upload the Excel file downloaded from the &ldquo;הר הביטוח&rdquo; portal for{' '}
                {profileName}. This will replace existing data for this profile.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              {error && (
                <div
                  role="alert"
                  className="bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded-md p-3 text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <label
                htmlFor="excel-upload"
                className="border-muted-foreground/25 hover:border-muted-foreground/50 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors"
              >
                <FileSpreadsheet className="text-muted-foreground mb-4 h-12 w-12" />
                <span className="text-muted-foreground mb-2 text-sm">
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
              <DialogDescription>Insurance data updated for {profileName}</DialogDescription>
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
