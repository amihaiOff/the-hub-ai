import { SharedPageView } from '@/components/pages/shared-page-view';

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedPageView token={token} />;
}
