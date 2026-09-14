import type { Metadata } from 'next';
import { LiveRun } from '@/components/LiveRun';

export const metadata: Metadata = { title: 'Live run · Ally' };

export default async function LivePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <LiveRun runId={runId} />;
}
