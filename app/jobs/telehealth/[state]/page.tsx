import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SettingStatePage, { buildSettingStateMetadata, buildSettingStateStaticParams } from '@/lib/pseo/setting-state-template';
import { resolveStateSlug } from '@/lib/pseo/setting-state-config';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const SETTING_KEY = 'telehealth';

interface Props {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { state } = await params;
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  return buildSettingStateMetadata(SETTING_KEY, state, page);
}

export default async function TelehealthStateJobsPage({ params, searchParams }: Props) {
  const { state } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1'));

  const stateName = resolveStateSlug(state);
  if (!stateName) notFound();

  return <SettingStatePage settingKey={SETTING_KEY} stateSlug={state} page={page} />;
}
