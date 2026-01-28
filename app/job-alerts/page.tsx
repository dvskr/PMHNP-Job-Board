import { Metadata } from 'next';
import { Bell, Mail, MapPin, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import JobAlertSignupForm from './JobAlertSignupForm';

export const metadata: Metadata = {
  title: 'Get PMHNP Job Alerts | PMHNP Jobs',
  description: 'Never miss a job opportunity. Get new PMHNP positions delivered to your inbox daily or weekly. Set your location and preferences.',
};

interface JobAlertsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function JobAlertsPage({ searchParams }: JobAlertsPageProps) {
  const params = await searchParams;
  
  // Extract query params for pre-filling form
  const initialLocation = typeof params.location === 'string' ? params.location : '';
  const initialMode = typeof params.mode === 'string' ? params.mode : '';
  const initialJobType = typeof params.jobType === 'string' ? params.jobType : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-6">
            <Bell className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Get PMHNP Job Alerts
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            Never miss a job opportunity. Get new positions delivered to your inbox based on your preferences.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Form */}
          <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Create Your Job Alert
            </h2>
            <JobAlertSignupForm 
              initialLocation={initialLocation}
              initialMode={initialMode}
              initialJobType={initialJobType}
            />
          </div>

          {/* Right: Benefits */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">
              Why Set Up Job Alerts?
            </h2>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delivered to Your Inbox</h3>
                  <p className="text-gray-600 text-sm">Get matching jobs sent directly to your email daily or weekly.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Location-Specific</h3>
                  <p className="text-gray-600 text-sm">Only see jobs in your preferred state or region.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Be First to Apply</h3>
                  <p className="text-gray-600 text-sm">Get notified as soon as new positions are posted.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Easy to Manage</h3>
                  <p className="text-gray-600 text-sm">Pause, edit, or delete your alerts anytime.</p>
                </div>
              </div>
            </div>

            {/* Already have alerts */}
            <div className="bg-gray-100 rounded-lg p-4 mt-8">
              <p className="text-gray-700 text-sm">
                Already have job alerts?{' '}
                <Link href="/job-alerts/manage" className="text-blue-600 hover:text-blue-700 font-medium">
                  Manage your alerts →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

