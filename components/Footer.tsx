import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">PMHNP Jobs</h3>
            <p className="text-sm text-gray-600">
              The #1 job board for psychiatric nurse practitioners
            </p>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/jobs" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Browse Jobs
                </Link>
              </li>
              <li>
                <Link href="/post-job" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Post a Job
                </Link>
              </li>
              <li>
                <Link href="/salary-guide" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Salary Guide
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="#" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="#" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="#" className="text-sm text-gray-600 hover:text-blue-500 transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            © 2024 PMHNP Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

