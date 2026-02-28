'use client';

import { useState, useCallback, useMemo } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  useCreatePensionAccount,
  useUpdatePensionAccount,
  type ParsedDepositFromPdf,
  type ParsePdfResult,
  type AccountSummaryFromPdf,
} from '@/lib/hooks/use-pension';
import type { PensionAccountSummary } from '@/lib/utils/pension';
import { formatCurrency } from '@/lib/utils/pension';
import { UploadDepositsPreview } from './upload-deposits-preview';

type DialogStep = 'upload' | 'create-account' | 'preview' | 'importing' | 'success';

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
  const [updateValue, setUpdateValue] = useState(true);
  const [updateFee, setUpdateFee] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  const parsePdf = useParsePensionPdf();
  const bulkCreate = useBulkCreateDeposits();
  const createAccount = useCreatePensionAccount();
  const updateAccount = useUpdatePensionAccount();

  const hasAccountSummary = parseResult?.accountSummary?.currentValue != null;
  const hasDeposits = previewDeposits.length > 0;

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

      // If no matching account found and we have a provider name, offer to create one
      if (!autoSelectedAccountId && result.providerName && result.accountSummary) {
        setStep('create-account');
        return;
      }

      setSelectedAccountId(autoSelectedAccountId);

      // Initialize preview deposits
      const preview: PreviewDeposit[] = result.deposits.map((d) => ({
        ...d,
        isSelected: true,
        isDuplicate: false,
      }));

      const updatedPreview = autoSelectedAccountId
        ? updateDepositsWithDuplicateStatus(preview, autoSelectedAccountId)
        : preview;

      setPreviewDeposits(updatedPreview);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDF');
    }
  };

  const handleCreateAccount = async () => {
    if (!parseResult?.providerName) return;

    setError('');
    try {
      const newAccount = await createAccount.mutateAsync({
        type: 'hishtalmut',
        providerName: parseResult.providerName,
        accountName: `${parseResult.providerName} Hishtalmut`,
        currentValue: parseResult.accountSummary?.currentValue ?? 0,
        feeFromDeposit: 0,
        feeFromTotal: parseResult.accountSummary?.feeFromTotal ?? 0,
      });

      setSelectedAccountId(newAccount.id);

      // Initialize preview deposits (likely empty for Harel)
      const preview: PreviewDeposit[] = parseResult.deposits.map((d) => ({
        ...d,
        isSelected: true,
        isDuplicate: false,
      }));

      setPreviewDeposits(preview);
      // For newly created account with summary data and no deposits, go straight to success
      if (preview.length === 0 && parseResult.accountSummary?.currentValue != null) {
        setSuccessMessage('Account created with data from PDF');
        setStep('success');
      } else {
        setStep('preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
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
    const willUpdateAccount = hasAccountSummary && (updateValue || updateFee);

    if (depositsToImport.length === 0 && !willUpdateAccount) {
      setError('No changes to apply');
      return;
    }

    setStep('importing');
    setError('');

    try {
      let depositsImported = 0;
      let accountUpdated = false;

      // Import deposits if any selected
      if (depositsToImport.length > 0) {
        const result = await bulkCreate.mutateAsync({
          accountId: selectedAccountId,
          deposits: depositsToImport.map((d) => ({
            depositDate: d.depositDate,
            salaryMonth: d.salaryMonth,
            amount: d.amount,
            employer: d.employer,
          })),
        });
        depositsImported = result.count;
        // Mark imported deposits so they won't be re-imported on retry
        setPreviewDeposits((prev) =>
          prev.map((d) => (d.isSelected ? { ...d, isSelected: false, isDuplicate: true } : d))
        );
      }

      // Update account values from summary if checked
      if (willUpdateAccount) {
        const updateData: { id: string; currentValue?: number; feeFromTotal?: number } = {
          id: selectedAccountId,
        };
        if (updateValue && parseResult?.accountSummary?.currentValue != null) {
          updateData.currentValue = parseResult.accountSummary.currentValue;
        }
        if (updateFee && parseResult?.accountSummary?.feeFromTotal != null) {
          updateData.feeFromTotal = parseResult.accountSummary.feeFromTotal;
        }
        await updateAccount.mutateAsync(updateData);
        accountUpdated = true;
      }

      setImportedCount(depositsImported);

      const parts: string[] = [];
      if (depositsImported > 0) {
        parts.push(`${depositsImported} deposit${depositsImported !== 1 ? 's' : ''} imported`);
      }
      if (accountUpdated) {
        parts.push('Account updated');
      }
      setSuccessMessage(parts.join('. ') || 'Changes applied');
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep('upload');
      setParseResult(null);
      setPreviewDeposits([]);
      setSelectedAccountId('');
      setError('');
      setImportedCount(0);
      setUpdateValue(true);
      setUpdateFee(true);
      setSuccessMessage('');
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
                Upload a Meitav or Harel quarterly report (PDF) to import data
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
                <span className="text-muted-foreground text-xs">
                  Meitav or Harel quarterly report
                </span>
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

        {step === 'create-account' && parseResult && (
          <CreateAccountStep
            parseResult={parseResult}
            error={error}
            isPending={createAccount.isPending}
            onCreateAccount={handleCreateAccount}
            onBack={() => setStep('upload')}
          />
        )}

        {step === 'preview' && parseResult && (
          <>
            <DialogHeader>
              <DialogTitle>{hasDeposits ? 'Review Deposits' : 'Review Account Data'}</DialogTitle>
              <DialogDescription>
                {hasDeposits
                  ? `Found ${previewDeposits.length} deposits in the PDF`
                  : 'Account summary extracted from the PDF'}
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

              {parseResult.warnings.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {parseResult.warnings.join('. ')}
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
                <Label htmlFor="account">
                  {hasDeposits ? 'Import to Account *' : 'Update Account *'}
                </Label>
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

              {hasAccountSummary && (
                <AccountSummaryCard
                  summary={parseResult.accountSummary!}
                  updateValue={updateValue}
                  updateFee={updateFee}
                  onUpdateValueChange={setUpdateValue}
                  onUpdateFeeChange={setUpdateFee}
                />
              )}

              {hasDeposits && (
                <UploadDepositsPreview
                  deposits={previewDeposits}
                  onToggleDeposit={handleToggleDeposit}
                  onToggleAll={handleToggleAll}
                />
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              {hasDeposits ? (
                <Button onClick={handleImport} disabled={selectedCount === 0 || !selectedAccountId}>
                  Import {selectedCount} Deposit{selectedCount !== 1 ? 's' : ''}
                  {hasAccountSummary && (updateValue || updateFee) ? ' & Update Account' : ''}
                </Button>
              ) : (
                <Button
                  onClick={handleImport}
                  disabled={!selectedAccountId || (!updateValue && !updateFee)}
                >
                  Update Account
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>Applying Changes</DialogTitle>
              <DialogDescription>Please wait...</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center py-12">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle>Complete</DialogTitle>
              <DialogDescription>Changes have been applied successfully</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="mb-4 h-16 w-16 text-green-500" />
              <p className="text-lg font-medium">{successMessage}</p>
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

function CreateAccountStep({
  parseResult,
  error,
  isPending,
  onCreateAccount,
  onBack,
}: {
  parseResult: ParsePdfResult;
  error: string;
  isPending: boolean;
  onCreateAccount: () => void;
  onBack: () => void;
}) {
  const summary = parseResult.accountSummary;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Account</DialogTitle>
        <DialogDescription>
          No {parseResult.providerName} account found. Create one with the data from this PDF?
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

        <div className="bg-muted/50 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="text-muted-foreground h-4 w-4" />
            <span className="font-medium">{parseResult.providerName} Hishtalmut</span>
          </div>
          <div className="text-muted-foreground grid grid-cols-2 gap-y-2 text-sm">
            {summary?.currentValue != null && (
              <>
                <span>Current Value</span>
                <span className="text-foreground font-medium">
                  {formatCurrency(summary.currentValue)}
                </span>
              </>
            )}
            {summary?.feeFromTotal != null && (
              <>
                <span>Fee from Total</span>
                <span className="text-foreground font-medium">{summary.feeFromTotal}%</span>
              </>
            )}
            {summary?.investmentTrack && (
              <>
                <span>Investment Track</span>
                <span className="text-foreground font-medium">
                  {summary.investmentTrack}
                  {summary.trackReturn != null && ` (${summary.trackReturn}%)`}
                </span>
              </>
            )}
            {parseResult.reportDate && (
              <>
                <span>Report Date</span>
                <span className="text-foreground font-medium">{parseResult.reportDate}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <DialogFooter className="flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={onCreateAccount} disabled={isPending}>
          {isPending ? 'Creating...' : 'Create & Continue'}
        </Button>
      </DialogFooter>
    </>
  );
}

function AccountSummaryCard({
  summary,
  updateValue,
  updateFee,
  onUpdateValueChange,
  onUpdateFeeChange,
}: {
  summary: AccountSummaryFromPdf;
  updateValue: boolean;
  updateFee: boolean;
  onUpdateValueChange: (checked: boolean) => void;
  onUpdateFeeChange: (checked: boolean) => void;
}) {
  return (
    <div className="bg-muted/50 mb-4 rounded-lg border p-4">
      <h4 className="mb-3 text-sm font-medium">Account Summary from PDF</h4>
      <div className="space-y-3">
        {summary.investmentTrack && (
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span>
              Investment Track: {summary.investmentTrack}
              {summary.trackReturn != null && ` (${summary.trackReturn}% return)`}
            </span>
          </div>
        )}
        {summary.currentValue != null && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="update-value"
              checked={updateValue}
              onCheckedChange={(checked) => onUpdateValueChange(checked === true)}
            />
            <label htmlFor="update-value" className="cursor-pointer text-sm">
              Update account value to {formatCurrency(summary.currentValue)}
            </label>
          </div>
        )}
        {summary.feeFromTotal != null && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="update-fee"
              checked={updateFee}
              onCheckedChange={(checked) => onUpdateFeeChange(checked === true)}
            />
            <label htmlFor="update-fee" className="cursor-pointer text-sm">
              Update management fee to {summary.feeFromTotal}%
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
