'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  // Log error to console for debugging
  useEffect(() => {
    // Note: logger is server-only, so we use console.error here (client side)
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            padding: '1rem',
          }}
        >
          <div
            style={{
              maxWidth: '32rem',
              width: '100%',
              textAlign: 'center',
              padding: '2rem',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '96px',
                height: '96px',
                margin: '0 auto 1.5rem',
                backgroundColor: '#fef3c7',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
              }}
            >
              ⚠️
            </div>

            {/* Heading */}
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#111827',
                marginBottom: '1rem',
              }}
            >
              Something went wrong
            </h1>

            {/* Subtext */}
            <p
              style={{
                fontSize: '1.125rem',
                color: '#4b5563',
                marginBottom: '2rem',
                lineHeight: '1.6',
              }}
            >
              We&apos;re sorry, a critical error occurred. Please try again or reload the page.
            </p>

            {/* Buttons */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              {/* Try Again Button */}
              <button
                onClick={reset}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'white',
                  backgroundColor: '#0d9488',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#0f766e';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#0d9488';
                }}
              >
                🔄 Try Again
              </button>

              {/* Reload Button */}
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#0d9488',
                  backgroundColor: 'white',
                  border: '2px solid #0d9488',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f0fdfa';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                🏠 Go to Homepage
              </button>
            </div>

            {/* Dev Mode Error Details */}
            {process.env.NODE_ENV === 'development' && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  textAlign: 'left',
                  marginBottom: '1.5rem',
                }}
              >
                <p
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: '#7f1d1d',
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  <strong>Dev Mode Error:</strong>
                  <br />
                  {error.message}
                </p>
                {error.digest && (
                  <p
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: '#991b1b',
                      marginTop: '0.5rem',
                      marginBottom: 0,
                    }}
                  >
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Support Text */}
            <div
              style={{
                paddingTop: '1.5rem',
                borderTop: '1px solid #e5e7eb',
              }}
            >
              <p
                style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  margin: 0,
                }}
              >
                If this keeps happening, please email us at{' '}
                <a
                  href="mailto:support@pmhnphiring.com"
                  style={{
                    color: '#0d9488',
                    textDecoration: 'underline',
                  }}
                >
                  support@pmhnphiring.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

