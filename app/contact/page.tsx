'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { Mail, Clock, HelpCircle, CheckCircle, AlertCircle } from 'lucide-react';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSubmitStatus('success');
        reset(); // Clear form
      } else {
        setSubmitStatus('error');
        setErrorMessage(result.error || 'Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Contact form error:', error);
      setSubmitStatus('error');
      setErrorMessage('Failed to send message. Please try again or email us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Contact', url: 'https://pmhnphiring.com/contact' },
      ]} />
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-teal-600 to-teal-800 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <Mail className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Contact Us
          </h1>
          <p className="text-xl text-teal-100 max-w-2xl mx-auto">
            We&apos;re here to help. Reach out with any questions.
          </p>
        </div>
      </section>

      {/* Main Content - Two Column Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Contact Form (2/3 width on desktop) */}
          <div className="lg:col-span-2">
            <Card padding="lg" variant="elevated">
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Send Us a Message
              </h2>

              {/* Success Message */}
              {submitStatus === 'success' && (
                <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg animate-fade-in">
                  <div className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-900">
                        Message sent successfully!
                      </p>
                      <p className="text-sm text-green-800 mt-1">
                        Thanks! We&apos;ll respond within 24-48 hours.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {submitStatus === 'error' && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg animate-fade-in">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        Error sending message
                      </p>
                      <p className="text-sm text-red-800 mt-1">
                        {errorMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Name Field */}
                <Input
                  label="Name"
                  type="text"
                  placeholder="Your full name"
                  {...register('name', {
                    required: 'Name is required',
                    minLength: {
                      value: 2,
                      message: 'Name must be at least 2 characters'
                    }
                  })}
                  error={errors.name?.message}
                />

                {/* Email Field */}
                <Input
                  label="Email"
                  type="email"
                  placeholder="your.email@example.com"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Please enter a valid email address'
                    }
                  })}
                  error={errors.email?.message}
                />

                {/* Subject Dropdown */}
                <div>
                  <label htmlFor="subject" className="block mb-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Subject
                  </label>
                  <select
                    id="subject"
                    {...register('subject', { required: 'Please select a subject' })}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors duration-200 ${errors.subject ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
                      }`}
                    style={{ color: 'var(--text-primary)', background: 'var(--bg-primary)', borderColor: errors.subject ? undefined : 'var(--border-color)' }}
                  >
                    <option value="">Select a subject...</option>
                    <option value="General Inquiry">General Inquiry</option>
                    <option value="Job Seeker Support">Job Seeker Support</option>
                    <option value="Employer Support">Employer Support</option>
                    <option value="Technical Issue">Technical Issue</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.subject && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {errors.subject.message}
                    </p>
                  )}
                </div>

                {/* Message Textarea */}
                <div>
                  <label htmlFor="message" className="block mb-1.5 text-sm font-medium text-gray-700">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    placeholder="Tell us how we can help..."
                    {...register('message', {
                      required: 'Message is required',
                      minLength: {
                        value: 10,
                        message: 'Message must be at least 10 characters'
                      }
                    })}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors duration-200 resize-vertical ${errors.message ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
                      }`}
                    style={{ color: 'var(--text-primary)', background: 'var(--bg-primary)', borderColor: errors.message ? undefined : 'var(--border-color)' }}
                  />
                  {errors.message && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {errors.message.message}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </Card>
          </div>

          {/* Right Column - Contact Info (1/3 width on desktop) */}
          <div className="space-y-6">
            {/* Contact Information Card */}
            <Card padding="lg" variant="elevated">
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Contact Information
              </h3>

              <div className="space-y-4">
                {/* Email */}
                <div className="flex items-start">
                  <Mail className="w-5 h-5 text-teal-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Email
                    </p>
                    <a
                      href="mailto:support@pmhnphiring.com"
                      className="text-sm text-teal-600 hover:text-teal-700 underline"
                    >
                      support@pmhnphiring.com
                    </a>
                  </div>
                </div>

                {/* Response Time */}
                <div className="flex items-start">
                  <Clock className="w-5 h-5 text-teal-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Response Time
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      We typically respond within 24-48 hours
                    </p>
                  </div>
                </div>

                {/* FAQ Link */}
                <div className="flex items-start">
                  <HelpCircle className="w-5 h-5 text-teal-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Quick Answers
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      Check our FAQ for instant answers
                    </p>
                    <Link
                      href="/faq"
                      className="text-sm text-teal-600 hover:text-teal-700 underline"
                    >
                      Visit FAQ →
                    </Link>
                  </div>
                </div>
              </div>
            </Card>

            {/* Additional Help Card */}
            <Card padding="lg" variant="bordered">
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Looking for Something Else?
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/faq" className="text-teal-700 hover:text-teal-800 underline">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="text-teal-700 hover:text-teal-800 underline">
                    About PMHNP Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-teal-700 hover:text-teal-800 underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-teal-700 hover:text-teal-800 underline">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

