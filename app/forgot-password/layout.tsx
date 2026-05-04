import { brand } from '@/config/brand';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Forgot Password | PMHNP Hiring',
    description: 'Reset your PMHNP Hiring account password. Enter your email address and we will send you a secure link to create a new password and regain access.',
    alternates: {
        canonical: `${brand.baseUrl}/forgot-password`,
    },
};

export default function ForgotPasswordLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
