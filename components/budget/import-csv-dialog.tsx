'use client';

import { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  UserPlus,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useImportTransactions,
  useCategoryGroups,
  usePayees,
  useRiseupCategories,
} from '@/lib/hooks/use-budget';
import {
  parseRiseupCSV,
  getDuplicateKey,
  type ParsedRiseupTransaction,
} from '@/lib/utils/riseup-csv-parser';
import { formatCurrencyILS } from '@/lib/utils/budget';

type DialogStep = 'upload' | 'preview' | 'importing' | 'success' | 'error';

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const [step, setStep] = useState<DialogStep>('upload');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedRiseupTransaction[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    created: number;
    duplicatesSkipped: number;
    payeesCreated: string[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportTransactions();
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: riseupCategories = [] } = useRiseupCategories();

  // Build lookup maps for preview
  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of categoryGroups) {
      for (const cat of group.categories) {
        map.set(cat.id, cat.name);
      }
    }
    return map;
  }, [categoryGroups]);

  // Build Riseup category name → budget category name lookup from DB mapping
  const riseupToCategoryName = useMemo(() => {
    const map = new Map<string, string>();
    for (const rc of riseupCategories) {
      if (rc.budgetCategoryId) {
        const catName = categoryById.get(rc.budgetCategoryId);
        if (catName) {
          map.set(rc.name.trim(), catName);
        }
      }
    }
    return map;
  }, [riseupCategories, categoryById]);

  // Resolve a Riseup category to an app category name via DB mapping
  const resolveCategory = (riseupCategory: string | null): string | null => {
    if (!riseupCategory) return null;
    return riseupToCategoryName.get(riseupCategory.trim()) ?? null;
  };

  const payeeSet = useMemo(() => {
    return new Set(payees.map((p) => p.name.toLowerCase().trim()));
  }, [payees]);

  // Detect duplicates within the parsed batch
  const duplicateKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const tx of parsedTransactions) {
      const key = getDuplicateKey(tx);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return seen;
  }, [parsedTransactions]);

  const resetState = () => {
    setStep('upload');
    setParsedTransactions([]);
    setParseErrors([]);
    setImportResult(null);
    setErrorMessage('');
    setImportProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 5MB file size limit
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File is too large. Maximum size is 5MB.');
      setStep('error');
      return;
    }

    try {
      const text = await file.text();
      const result = parseRiseupCSV(text);

      setParsedTransactions(result.transactions);
      setParseErrors(result.errors);

      if (result.transactions.length > 0) {
        setStep('preview');
      } else if (result.errors.length > 0) {
        setErrorMessage(`Failed to parse CSV: ${result.errors[0]}`);
        setStep('error');
      }
    } catch {
      setErrorMessage('Failed to read the CSV file');
      setStep('error');
    }
  };

  const handleImport = async () => {
    setStep('importing');

    const BATCH_SIZE = 500;
    const allTx = parsedTransactions.map((tx) => ({
      type: tx.type,
      transactionDate: tx.transactionDate,
      paymentDate: tx.paymentDate,
      amountIls: tx.amountIls,
      currency: tx.currency,
      amountOriginal: tx.amountOriginal,
      payeeName: tx.payeeName,
      riseupCategory: tx.riseupCategory,
      paymentMethod: tx.paymentMethod,
      paymentNumber: tx.paymentNumber,
      totalPayments: tx.totalPayments,
      notes: tx.notes,
      source: tx.source,
      paymentIdentifier: tx.paymentIdentifier,
      excludedFromFlow: tx.excludedFromFlow,
    }));

    const totalBatches = Math.ceil(allTx.length / BATCH_SIZE);
    setImportProgress({ current: 0, total: totalBatches });

    let totalCreated = 0;
    let totalDuplicatesSkipped = 0;
    const allPayeesCreated: string[] = [];

    try {
      for (let i = 0; i < totalBatches; i++) {
        const batch = allTx.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        const result = await importMutation.mutateAsync({ transactions: batch });
        totalCreated += result.created;
        totalDuplicatesSkipped += result.duplicatesSkipped;
        allPayeesCreated.push(...result.payeesCreated);
        setImportProgress({ current: i + 1, total: totalBatches });
      }

      setImportResult({
        created: totalCreated,
        duplicatesSkipped: totalDuplicatesSkipped,
        payeesCreated: allPayeesCreated,
      });
      setStep('success');
    } catch (err) {
      // If we partially succeeded, still show success with partial results
      if (totalCreated > 0) {
        setImportResult({
          created: totalCreated,
          duplicatesSkipped: totalDuplicatesSkipped,
          payeesCreated: allPayeesCreated,
        });
        setStep('success');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Import failed');
        setStep('error');
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after dialog close animation
    setTimeout(resetState, 200);
  };

  // Summary stats for preview
  const incomeCount = parsedTransactions.filter((t) => t.type === 'income').length;
  const expenseCount = parsedTransactions.filter((t) => t.type === 'expense').length;
  const totalIncome = parsedTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amountIls, 0);
  const totalExpense = parsedTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amountIls, 0);
  const newPayees = parsedTransactions.filter(
    (t) => !payeeSet.has(t.payeeName.toLowerCase().trim())
  );
  const uniqueNewPayees = [...new Set(newPayees.map((t) => t.payeeName.trim()))];
  const matchedCategories = parsedTransactions.filter(
    (t) => resolveCategory(t.riseupCategory) !== null
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {/* Upload Step */}
        {step === 'upload' && (
          <>
            <DialogHeader>
              <DialogTitle>Import Transactions</DialogTitle>
              <DialogDescription>
                Upload a Riseup CSV export to import transactions
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
                <Upload className="text-muted-foreground h-8 w-8" />
              </div>
              <p className="text-muted-foreground text-sm">Select a CSV file from Riseup</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <FileText className="mr-2 h-4 w-4" />
                Choose CSV File
              </Button>
            </div>
          </>
        )}

        {/* Preview Step */}
        {step === 'preview' && (
          <>
            <DialogHeader>
              <DialogTitle>Preview Import</DialogTitle>
              <DialogDescription>
                {parsedTransactions.length} transactions parsed from CSV
              </DialogDescription>
            </DialogHeader>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-green-500">{incomeCount}</div>
                <div className="text-muted-foreground text-xs">Income</div>
                <div className="text-xs text-green-500">{formatCurrencyILS(totalIncome)}</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-red-500">{expenseCount}</div>
                <div className="text-muted-foreground text-xs">Expenses</div>
                <div className="text-xs text-red-500">{formatCurrencyILS(totalExpense)}</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-lg font-bold">{matchedCategories}</div>
                <div className="text-muted-foreground text-xs">Categories Matched</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-amber-500">{uniqueNewPayees.length}</div>
                <div className="text-muted-foreground text-xs">New Payees</div>
              </div>
            </div>

            {/* New payees warning */}
            {uniqueNewPayees.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <span className="font-medium text-amber-500">
                    {uniqueNewPayees.length} new payees
                  </span>{' '}
                  will be created automatically.
                </div>
              </div>
            )}

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <span className="font-medium text-amber-500">
                    {parseErrors.length} rows skipped
                  </span>{' '}
                  due to parsing errors.
                </div>
              </div>
            )}

            {/* Transaction preview table */}
            <ScrollArea className="h-[300px]">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Date</TableHead>
                    <TableHead className="w-[40%]">Payee</TableHead>
                    <TableHead className="w-[30%]">Category</TableHead>
                    <TableHead className="w-[100px] text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedTransactions.slice(0, 100).map((tx, i) => {
                    const isNewPayee = !payeeSet.has(tx.payeeName.toLowerCase().trim());
                    const matchedCat = resolveCategory(tx.riseupCategory);
                    const key = getDuplicateKey(tx);
                    const isDupInBatch = (duplicateKeys.get(key) ?? 0) > 1;

                    return (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="text-muted-foreground py-2">
                          {tx.transactionDate.slice(5)}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{tx.payeeName}</span>
                            {isNewPayee && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-amber-500/30 text-[10px] text-amber-500"
                              >
                                new
                              </Badge>
                            )}
                            {isDupInBatch && <Copy className="h-3 w-3 shrink-0 text-amber-500" />}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          {matchedCat ? (
                            <span className="truncate text-green-500">{matchedCat}</span>
                          ) : tx.riseupCategory ? (
                            <span className="text-muted-foreground truncate">
                              {tx.riseupCategory}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`py-2 text-right font-mono ${tx.type === 'income' ? 'text-green-500' : 'text-red-500'}`}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatCurrencyILS(tx.amountIls)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {parsedTransactions.length > 100 && (
                <div className="text-muted-foreground py-2 text-center text-xs">
                  ... and {parsedTransactions.length - 100} more transactions
                </div>
              )}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={resetState}>
                Back
              </Button>
              <Button onClick={handleImport}>
                Import {parsedTransactions.length} Transactions
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Importing Step */}
        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>Importing...</DialogTitle>
              <DialogDescription>
                Processing {parsedTransactions.length} transactions
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="text-primary h-12 w-12 animate-spin" />
              <p className="text-muted-foreground text-sm">Creating payees and transactions...</p>
              {importProgress.total > 1 && (
                <div className="w-full max-w-xs">
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{
                        width: `${(importProgress.current / importProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-center text-xs">
                    Batch {importProgress.current} of {importProgress.total}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Success Step */}
        {step === 'success' && importResult && (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
              <DialogDescription>Your transactions have been imported</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>

              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-500">{importResult.created}</div>
                  <div className="text-muted-foreground text-xs">Created</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-amber-500">
                    {importResult.duplicatesSkipped}
                  </div>
                  <div className="text-muted-foreground text-xs">Duplicates Skipped</div>
                </div>
                <div className="bg-muted col-span-2 rounded-lg p-3 text-center sm:col-span-1">
                  <div className="text-lg font-bold">{importResult.payeesCreated.length}</div>
                  <div className="text-muted-foreground text-xs">New Payees</div>
                </div>
              </div>

              {importResult.payeesCreated.length > 0 && (
                <div className="bg-muted w-full rounded-lg p-3">
                  <div className="text-muted-foreground mb-1 text-xs font-medium">
                    New payees created:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {importResult.payeesCreated.slice(0, 20).map((name) => (
                      <Badge key={name} variant="secondary" className="text-[10px]">
                        {name}
                      </Badge>
                    ))}
                    {importResult.payeesCreated.length > 20 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{importResult.payeesCreated.length - 20} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Import Failed</DialogTitle>
              <DialogDescription>An error occurred during import</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-sm text-red-500">{errorMessage}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetState}>
                Try Again
              </Button>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
