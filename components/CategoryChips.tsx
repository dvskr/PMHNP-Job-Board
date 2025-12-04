'use client';

import Link from 'next/link';

interface Category {
  label: string;
  count: number;
  href: string;
}

interface CategoryChipsProps {
  categories: Category[];
  layout?: 'row' | 'wrap';
}

export default function CategoryChips({ categories, layout = 'row' }: CategoryChipsProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div
      className={
        layout === 'row'
          ? 'flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0'
          : 'flex flex-wrap gap-3'
      }
    >
      {categories.map((category) => (
        <Link
          key={category.label}
          href={category.href}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <span>{category.label}</span>
          <span className="text-gray-400 text-xs">({category.count})</span>
        </Link>
      ))}
    </div>
  );
}

