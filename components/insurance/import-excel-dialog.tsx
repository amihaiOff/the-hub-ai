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
      setError('אנא בחר קובץ Excel (.xlsx)');
      return;
    }

    setError('');
    setStep('importing');

    try {
      const result = await importInsurance.mutateAsync({ file, profileId });
      setImportedCount(result.imported);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בייבוא הקובץ');
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
          ייבוא מ-Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        {step === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle>ייבוא ביטוחים מהר הביטוח</DialogTitle>
              <DialogDescription>
                העלה קובץ Excel שהורדת מפורטל &ldquo;הר הביטוח&rdquo; עבור {profileName}. הייבוא
                יחליף את הנתונים הקיימים עבור פרופיל זה.
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
                <span className="text-muted-foreground mb-2 text-sm">לחץ לבחירת קובץ Excel</span>
                <span className="text-muted-foreground text-xs">.xlsx בלבד</span>
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
                ביטול
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>מייבא נתונים...</DialogTitle>
              <DialogDescription>אנא המתן בזמן עיבוד הקובץ</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>הייבוא הושלם בהצלחה</DialogTitle>
              <DialogDescription>נתוני הביטוחים עודכנו עבור {profileName}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">{importedCount} פוליסות יובאו בהצלחה</p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>סגור</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
