import { requireAuth } from '@/lib/auth/protect'
import Link from 'next/link'
import { Briefcase, Bookmark, Bell, Settings } from 'lucide-react'

export const metadata = {
  title: 'Dashboard | PMHNP Jobs',
}

export default async function DashboardPage() {
  const { user, profile } = await requireAuth()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{profile?.firstName ? `, ${profile.firstName}` : ''}!
        </h1>
        <p className="text-gray-600 mt-1">
          Manage your job search from your dashboard
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link
          href="/jobs"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <Briefcase className="w-8 h-8 text-blue-600 mb-3" />
          <h3 className="font-semibold text-gray-900">Browse Jobs</h3>
          <p className="text-sm text-gray-500 mt-1">Find your next opportunity</p>
        </Link>

        <Link
          href="/saved"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <Bookmark className="w-8 h-8 text-green-600 mb-3" />
          <h3 className="font-semibold text-gray-900">Saved Jobs</h3>
          <p className="text-sm text-gray-500 mt-1">View bookmarked positions</p>
        </Link>

        <Link
          href="/job-alerts/manage"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <Bell className="w-8 h-8 text-purple-600 mb-3" />
          <h3 className="font-semibold text-gray-900">Job Alerts</h3>
          <p className="text-sm text-gray-500 mt-1">Manage your notifications</p>
        </Link>

        <Link
          href="/settings"
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <Settings className="w-8 h-8 text-gray-600 mb-3" />
          <h3 className="font-semibold text-gray-900">Settings</h3>
          <p className="text-sm text-gray-500 mt-1">Update your profile</p>
        </Link>
      </div>

      {/* Profile Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <p className="text-gray-900">{user.email}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Name</label>
            <p className="text-gray-900">
              {profile?.firstName && profile?.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : 'Not set'}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Account Type</label>
            <p className="text-gray-900 capitalize">
              {profile?.role.replace('_', ' ') || 'Job Seeker'}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Resume</label>
            <p className="text-gray-900">
              {profile?.resumeUrl ? (
                <a href={profile.resumeUrl} className="text-blue-600 hover:underline">
                  View resume
                </a>
              ) : (
                'Not uploaded'
              )}
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
        >
          Edit profile →
        </Link>
      </div>
    </div>
  )
}

