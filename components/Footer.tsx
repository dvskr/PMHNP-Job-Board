import Link from 'next/link';
import { Twitter, Facebook, Instagram, Linkedin, AtSign } from 'lucide-react';

export default function Footer() {
  const socialLinks = [
    { icon: Twitter, href: "https://x.com/pmhnphiring", label: "X" },
    { icon: Facebook, href: "https://www.facebook.com/profile.php?id=61585484949012", label: "Facebook" },
    { icon: Instagram, href: "https://www.instagram.com/pmhnphiring", label: "Instagram" },
    { icon: Linkedin, href: "https://www.linkedin.com/company/pmhnp-hiring", label: "LinkedIn" },
    { icon: AtSign, href: "https://www.threads.com/@pmhnphiring", label: "Threads" },
  ];

  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-8 mb-8">

          {/* For Job Seekers */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">For Job Seekers</h3>
            <ul className="space-y-1.5">
              <li>
                <Link href="/jobs" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Browse Jobs
                </Link>
              </li>
              <li>
                <Link href="/saved" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Saved Jobs
                </Link>
              </li>
              <li>
                <Link href="/job-alerts" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Job Alerts
                </Link>
              </li>
              <li>
                <Link href="/resources" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Resources
                </Link>
              </li>
            </ul>
          </div>

          {/* For Employers */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">For Employers</h3>
            <ul className="space-y-1.5">
              <li>
                <Link href="/post-job" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Post a Job
                </Link>
              </li>
              <li>
                <Link href="/post-job" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/for-employers" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Why PMHNP Jobs
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Resources</h3>
            <ul className="space-y-1.5">
              <li>
                <Link href="/salary-guide" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Salary Guide
                </Link>
              </li>
              <li>
                <Link href="/jobs/remote" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Remote Jobs
                </Link>
              </li>
              <li>
                <Link href="/jobs/travel" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Travel Jobs
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm text-gray-400 hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Company</h3>
            <ul className="space-y-1.5">
              <li>
                <Link href="/about" className="text-sm text-gray-400 hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-6 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">PMHNP Jobs</span>
            <span className="text-xs text-gray-500 hidden sm:inline border-l border-gray-700 pl-2 ml-1">
              The #1 job board for psychiatric NPs
            </span>
          </div>
          
          {/* Social Links */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-white transition-colors"
                aria-label={social.label}
              >
                <social.icon size={18} />
              </a>
            ))}
          </div>

          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} PMHNP Jobs
          </p>
        </div>
      </div>
    </footer>
  );
}
