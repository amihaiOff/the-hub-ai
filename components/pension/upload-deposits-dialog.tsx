'use client';

import { useState, useCallback, useMemo } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useParsePensionPdf,
  useBulkCreateDeposits,
  type ParsedDepositFromPdf,
  type ParsePdfResult,
} from '@/lib/hooks/use-pension';
import type { PensionAccountSummary } from '@/lib/utils/pension';
import { UploadDepositsPreview } from './upload-deposits-preview';

type DialogStep = 'upload' | 'preview' | 'importing' | 'success';

interface UploadDepositsDialogProps {
  accounts: PensionAccountSummary[];
}

export interface PreviewDeposit extends ParsedDepositFromPdf {
  isSelected: boolean;
  isDuplicate: boolean;
}

export function UploadDepositsDialog({ accounts }: UploadDepositsDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>('upload');
  const [parseResult, setParseResult] = useState<ParsePdfResult | null>(null);
  const [previewDeposits, setPreviewDeposits] = useState<PreviewDeposit[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);

  const parsePdf = useParsePensionPdf();
  const bulkCreate = useBulkCreateDeposits();

  // Check if a deposit is a duplicate
  const checkDuplicate = useCallback(
    (deposit: ParsedDepositFromPdf, accountId: string): boolean => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return false;

      return account.deposits.some((existing) => {
        const existingSalaryMonth = new Date(existing.salaryMonth).toISOString().split('T')[0];
        return existingSalaryMonth === deposit.salaryMonth && existing.amount === deposit.amount;
      });
    },
    [accounts]
  );

  // Auto-select account based on provider name when parsing completes
  const autoSelectAccount = useCallback(
    (providerName: string | null): string => {
      if (providerName && accounts.length > 0) {
        const matchingAccount = accounts.find((a) =>
          a.providerName.toLowerCase().includes(providerName.toLowerCase())
        );
        if (matchingAccount) {
          return matchingAccount.id;
        }
      }
      if (accounts.length === 1) {
        return accounts[0].id;
      }
      return '';
    },
    [accounts]
  );

  // Update deposits with duplicate status for the selected account
  const updateDepositsWithDuplicateStatus = useCallback(
    (deposits: PreviewDeposit[], accountId: string): PreviewDeposit[] => {
      return deposits.map((d) => {
        const isDuplicate = checkDuplicate(d, accountId);
        return {
          ...d,
          isDuplicate,
          // Auto-deselect duplicates
          isSelected: isDuplicate ? false : d.isSelected,
        };
      });
    },
    [checkDuplicate]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Please select a PDF file');
      return;
    }

    setError('');

    try {
      const result = await parsePdf.mutateAsync(selectedFile);
      setParseResult(result);

      // Auto-select account
      const autoSelectedAccountId = autoSelectAccount(result.providerName);
      setSelectedAccountId(autoSelectedAccountId);

      // Initialize preview deposits with selection state and duplicate check
      const preview: PreviewDeposit[] = result.deposits.map((d) => ({
        ...d,
        isSelected: true,
        isDuplicate: false,
      }));

      // Update with duplicate status if we auto-selected an account
      const updatedPreview = autoSelectedAccountId
        ? updateDepositsWithDuplicateStatus(preview, autoSelectedAccountId)
        : preview;

      setPreviewDeposits(updatedPreview);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDF');
    }
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    // Update duplicate status for the new account
    setPreviewDeposits((prev) => updateDepositsWithDuplicateStatus(prev, accountId));
  };

  const handleToggleDeposit = (index: number) => {
    setPreviewDeposits((prev) =>
      prev.map((d, i) => (i === index ? { ...d, isSelected: !d.isSelected } : d))
    );
  };

  const handleToggleAll = () => {
    const nonDuplicates = previewDeposits.filter((d) => !d.isDuplicate);
    const allSelected = nonDuplicates.every((d) => d.isSelected);
    setPreviewDeposits((prev) =>
      prev.map((d) => (d.isDuplicate ? d : { ...d, isSelected: !allSelected }))
    );
  };

  const handleImport = async () => {
    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    const depositsToImport = previewDeposits.filter((d) => d.isSelected);
    if (depositsToImport.length === 0) {
      setError('Please select at least one deposit to import');
      return;
    }

    setStep('importing');
    setError('');

    try {
      const result = await bulkCreate.mutateAsync({
        accountId: selectedAccountId,
        deposits: depositsToImport.map((d) => ({
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: d.amount,
          employer: d.employer,
        })),
      });
      setImportedCount(result.count);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import deposits');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setStep('upload');
      setParseResult(null);
      setPreviewDeposits([]);
      setSelectedAccountId('');
      setError('');
      setImportedCount(0);
    }, 200);
  };

  const selectedCount = useMemo(
    () => previewDeposits.filter((d) => d.isSelected).length,
    [previewDeposits]
  );
  const duplicateCount = useMemo(
    () => previewDeposits.filter((d) => d.isDuplicate).length,
    [previewDeposits]
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Upload PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        {step === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle>Upload Pension Report</DialogTitle>
              <DialogDescription>
                Upload a Meitav quarterly pension report (PDF) to import deposit data
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              {error && (
                <div
                  role="alert"
                  className="bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded-md p-3 text-sm"
                >
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              <label
                htmlFor="pdf-upload"
                className="border-muted-foreground/25 hover:border-muted-foreground/50 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors"
              >
                <FileText className="text-muted-foreground mb-4 h-12 w-12" />
                <span className="text-muted-foreground mb-2 text-sm">
                  {parsePdf.isPending ? 'Parsing PDF...' : 'Click to select PDF file'}
                </span>
                <span className="text-muted-foreground text-xs">Meitav quarterly report only</span>
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={parsePdf.isPending}
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

        {step === 'preview' && parseResult && (
          <>
            <DialogHeader>
              <DialogTitle>Review Deposits</DialogTitle>
              <DialogDescription>
                Found {previewDeposits.length} deposits in the PDF
                {parseResult.memberName && ` for ${parseResult.memberName}`}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {error && (
                <div
                  role="alert"
                  className="bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded-md p-3 text-sm"
                >
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {duplicateCount > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} detected (already
                  imported)
                </div>
              )}

              <div className="mb-4 grid gap-2">
                <Label htmlFor="account">Import to Account *</Label>
                <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                  <SelectTrigger id="account">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountName} ({account.providerName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <UploadDepositsPreview
                deposits={previewDeposits}
                onToggleDeposit={handleToggleDeposit}
                onToggleAll={handleToggleAll}
              />
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={selectedCount === 0 || !selectedAccountId}>
                Import {selectedCount} Deposit{selectedCount !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>Importing Deposits</DialogTitle>
              <DialogDescription>Please wait while we import your deposits...</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
              <DialogDescription>Your deposits have been imported successfully</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">
                {importedCount} deposit{importedCount !== 1 ? 's' : ''} imported
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
