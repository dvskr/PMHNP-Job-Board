import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PMHNP Salary Guide 2024 | Average Pay by State',
  description: 'Comprehensive salary data for psychiatric nurse practitioners. Compare PMHNP salaries by state, work mode, and top employers.',
};

export default function SalaryGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

