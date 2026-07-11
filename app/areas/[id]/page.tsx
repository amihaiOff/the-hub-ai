import { PageEditor } from '@/components/pages/page-editor';

export default async function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageEditor pageId={id} />;
}
