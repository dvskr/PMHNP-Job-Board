import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-4">
          {/* About */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">PMHNP Jobs</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              The #1 job board for psychiatric nurse practitioners
            </p>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Resources</h3>
            <ul className="space-y-1">
              <li>
                <Link href="/jobs" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Browse Jobs
                </Link>
              </li>
              <li>
                <Link href="/for-job-seekers" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  For Job Seekers
                </Link>
              </li>
              <li>
                <Link href="/post-job" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Post a Job
                </Link>
              </li>
              <li>
                <Link href="/for-employers" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  For Employers
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Jobs by Location */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Jobs by Location</h3>
            <ul className="space-y-1">
              <li>
                <Link href="/jobs/state/california" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  California PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/texas" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Texas PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/new-york" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  New York PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/state/florida" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Florida PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/remote" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Remote PMHNP Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/locations" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  All Locations
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Legal</h3>
            <ul className="space-y-1">
              <li>
                <Link href="/privacy" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-xs text-gray-300 hover:text-primary-400 transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-400 text-center">
            © 2025 PMHNP Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

