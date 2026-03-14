import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryCityPage, { buildCategoryCityMetadata } from '@/lib/pseo/category-city-template';
import { getCityBySlug } from '@/lib/pseo/city-data/cities';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const CATEGORY_KEY = 'part-time';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  return buildCategoryCityMetadata(CATEGORY_KEY, slug, parseInt(sp.page || '1'));
}

export default async function PartTimeCityJobsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!getCityBySlug(slug)) notFound();
  return <CategoryCityPage categoryKey={CATEGORY_KEY} citySlug={slug} page={Math.max(1, parseInt(sp.page || '1'))} />;
}
