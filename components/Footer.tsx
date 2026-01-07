import Link from 'next/link';
import { Twitter, Facebook, Instagram, Linkedin, Github, AtSign } from 'lucide-react';

export default function Footer() {
  const socialLinks = [
    { icon: Twitter, href: "https://x.com/pmhnphiring", label: "X (Twitter)" },
    { icon: Facebook, href: "https://www.facebook.com/profile.php?id=61585484949012", label: "Facebook" },
    { icon: Instagram, href: "https://www.instagram.com/pmhnphiring", label: "Instagram" },
    { icon: Linkedin, href: "https://www.linkedin.com/company/pmhnp-hiring", label: "LinkedIn" },
    { icon: AtSign, href: "https://www.threads.com/@pmhnphiring", label: "Threads" },
  ];

  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8 mb-8">

          {/* For Job Seekers */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">For Job Seekers</h3>
            <ul className="space-y-2">
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
              {/* Job Alerts and Salary Guide placeholders if pages don't exist yet, mapped to existing or likely routes */}
              <li>
                <Link href="/jobs" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Job Alerts
                </Link>
              </li>
              <li>
                <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Login
                </Link>
              </li>
            </ul>
          </div>

          {/* For Employers */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">For Employers</h3>
            <ul className="space-y-2">
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
                <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                  Login
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2">
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

          {/* Follow Us */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Follow Us</h3>
            <ul className="space-y-2">
              {socialLinks.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors group"
                  >
                    <social.icon size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                    <span>{social.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Created By */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Created By</h3>
            <div className="flex flex-col space-y-2">
              <span className="text-sm text-gray-400">Sathish</span>
              <div className="flex gap-3">
                <a
                  href="https://x.com/Sathish_Daggula"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-white transition-colors"
                  aria-label="Sathish on X"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="https://www.linkedin.com/in/dvskr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-white transition-colors"
                  aria-label="Sathish on LinkedIn"
                >
                  <Linkedin size={18} />
                </a>
                <a
                  href="https://github.com/dvskr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-white transition-colors"
                  aria-label="Sathish on GitHub"
                >
                  <Github size={18} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">PMHNP Jobs</span>
            <span className="text-xs text-gray-500 border-l border-gray-700 pl-2 ml-2">
              The #1 job board for psychiatric nurse practitioners
            </span>
          </div>
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} PMHNP Jobs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
