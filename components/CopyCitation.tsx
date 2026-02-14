'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyCitationProps {
    citation: string;
}

export default function CopyCitation({ citation }: CopyCitationProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(citation);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy citation:', err);
        }
    };

    return (
        <div className="relative group">
            <div className="bg-white border border-gray-300 rounded p-4 font-mono text-sm text-gray-700 pr-12 break-words">
                {citation}
            </div>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                aria-label="Copy citation"
                title="Copy to clipboard"
            >
                {copied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
            </button>
            {copied && (
                <span className="absolute top-[-25px] right-0 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded shadow-sm animate-fade-in-up">
                    Copied!
                </span>
            )}
        </div>
    );
}
