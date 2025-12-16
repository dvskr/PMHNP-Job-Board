import Link from 'next/link';
import EmailSignupForm from '@/components/EmailSignupForm';

export default function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      {/* Email Signup */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12">
        <div className="max-w-md">
          <h3 className="text-lg font-semibold text-white mb-4">
            Stay Updated
          </h3>
          <EmailSignupForm 
            source="footer" 
            placeholder="Your email address"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">PMHNP Jobs</h3>
            <p className="text-sm text-gray-300">
              The #1 job board for psychiatric nurse practitioners
            </p>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/jobs" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Browse Jobs
                </Link>
              </li>
              <li>
                <Link href="/for-job-seekers" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  For Job Seekers
                </Link>
              </li>
              <li>
                <Link href="/post-job" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Post a Job
                </Link>
              </li>
              <li>
                <Link href="/for-employers" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  For Employers
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Jobs by Location */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Jobs by Location</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/jobs/state/california" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  California PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/texas" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Texas PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/new-york" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  New York PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/florida" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Florida PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/remote" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Remote PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/locations" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  All Locations
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-400 hover:text-primary-400 transition-colors duration-200">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-400 text-center">
            © 2024 PMHNP Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

