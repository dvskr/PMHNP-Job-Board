// Server-side auth guard — settings page requires employer role
import { requireEmployer } from '@/lib/auth/protect';
import { Metadata } from 'next';
import EmployerSettingsClient from './EmployerSettingsClient';

export const metadata: Metadata = {
    title: 'Settings — Employer Portal',
};

export default async function EmployerSettingsPage() {
    await requireEmployer();
    return <EmployerSettingsClient />;
}
