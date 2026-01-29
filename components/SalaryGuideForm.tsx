'use client';

import { useState } from 'react';
import { FileText, Check, Loader2 } from 'lucide-react';

export default function SalaryGuideForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setStatus('error');
      setMessage('Please enter a valid email');
      return;
    }

    setStatus('loading');
    
    try {
      const response = await fetch('/api/salary-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage('Check your email!');
        setEmail('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Check style={{ height: '18px', width: '18px', color: 'white' }} />
        </div>
        <span style={{ fontWeight: 600, color: '#047857', fontSize: '0.875rem' }}>{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'white',
      borderRadius: '8px',
      padding: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '6px',
        background: '#ecfdf5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <FileText style={{ height: '18px', width: '18px', color: '#059669' }} />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === 'error') setStatus('idle');
        }}
        placeholder="Email for free PDF guide"
        style={{
          flex: 1,
          padding: '8px 0',
          border: 'none',
          outline: 'none',
          fontSize: '0.875rem',
          color: '#111',
          minWidth: '140px',
          background: 'transparent',
        }}
        disabled={status === 'loading'}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        style={{
          padding: '8px 14px',
          borderRadius: '6px',
          border: 'none',
          background: '#059669',
          color: 'white',
          fontWeight: 600,
          fontSize: '0.8rem',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          opacity: status === 'loading' ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          whiteSpace: 'nowrap',
        }}
      >
        {status === 'loading' ? (
          <Loader2 style={{ height: '14px', width: '14px', animation: 'spin 1s linear infinite' }} />
        ) : (
          'Get PDF'
        )}
      </button>
      {status === 'error' && (
        <span style={{ 
          position: 'absolute', 
          bottom: '-20px', 
          left: '8px', 
          fontSize: '0.7rem', 
          color: '#ef4444' 
        }}>{message}</span>
      )}
    </form>
  );
}
