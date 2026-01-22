import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { parseMeitavPdf } from '@/lib/pdf/meitav-parser';

// Extend timeout for PDF parsing which can be slow
export const maxDuration = 30;

/**
 * POST /api/pension/parse-pdf
 * Upload and parse a pension PDF file to extract deposit data
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided or invalid file' },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'File must be a PDF' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate PDF magic number (%PDF-)
    const magicBytes = buffer.slice(0, 5).toString('ascii');
    if (magicBytes !== '%PDF-') {
      return NextResponse.json(
        { success: false, error: 'Invalid PDF file format' },
        { status: 400 }
      );
    }

    // Parse the PDF
    const result = await parseMeitavPdf(buffer);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse PDF',
          details: result.errors,
        },
        { status: 400 }
      );
    }

    // Convert dates to ISO strings for JSON response
    const deposits = result.deposits.map((d) => ({
      depositDate: d.depositDate.toISOString().split('T')[0],
      salaryMonth: d.salaryMonth.toISOString().split('T')[0],
      amount: d.amount,
      employer: d.employer,
    }));

    return NextResponse.json({
      success: true,
      data: {
        deposits,
        providerName: result.providerName,
        reportDate: result.reportDate?.toISOString().split('T')[0] ?? null,
        memberName: result.memberName,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    console.error('Error parsing PDF:', error);
    return NextResponse.json({ success: false, error: 'Failed to parse PDF' }, { status: 500 });
  }
}
