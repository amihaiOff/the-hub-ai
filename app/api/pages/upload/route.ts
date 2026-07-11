import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getCurrentContext } from '@/lib/auth-utils';

// Accept common raster web image types only. SVG is intentionally excluded —
// it can embed scripts, and a direct blob-URL visit would execute them.
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/pages/upload
 * Uploads a single image (multipart form field `file`) to Vercel Blob and
 * returns its public URL for embedding in a page. Requires a
 * `BLOB_READ_WRITE_TOKEN` in the environment; without it we return a clear
 * error the editor surfaces (and falls back to URL-embed).
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        success: false,
        error: 'Image uploads are not configured (missing BLOB_READ_WRITE_TOKEN).',
      },
      { status: 501 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ success: false, error: 'Unsupported image type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Image is too large (max 10 MB)' },
      { status: 400 }
    );
  }

  try {
    // Namespace by household so blobs are easy to attribute; addRandomSuffix
    // keeps same-named uploads from colliding.
    const blob = await put(`pages/${context.activeHousehold.id}/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ success: true, data: { url: blob.url } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}
