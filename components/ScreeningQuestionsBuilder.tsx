'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, GripVertical, Lightbulb } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Screening Questions Builder — Used on the post-job form
// Stores questions in localStorage alongside the rest of the form data
// ═══════════════════════════════════════════════════════════════

interface ScreeningQuestion {
  id: string;
  text: string;
  type: 'boolean' | 'text' | 'select' | 'number';
  options: string[];
  required: boolean;
  knockout: boolean;
  knockoutAnswer: string;
}

const PRESET_QUESTIONS: { text: string; type: ScreeningQuestion['type']; knockout?: boolean; knockoutAnswer?: string }[] = [
  { text: 'Do you have an active PMHNP-BC certification?', type: 'boolean', knockout: true, knockoutAnswer: 'no' },
  { text: 'Do you hold an active DEA license?', type: 'boolean' },
  { text: 'How many years of psychiatric NP experience do you have?', type: 'number' },
  { text: 'Are you licensed to practice in the state where this position is located?', type: 'boolean', knockout: true, knockoutAnswer: 'no' },
  { text: 'Do you have prescriptive authority?', type: 'boolean' },
  { text: 'Are you open to weekend or on-call shifts?', type: 'boolean' },
  { text: 'What is your earliest available start date?', type: 'text' },
  { text: 'Do you have telehealth/telepsychiatry experience?', type: 'boolean' },
];

export default function ScreeningQuestionsBuilder() {
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customType, setCustomType] = useState<ScreeningQuestion['type']>('boolean');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('jobScreeningQuestions');
      if (stored) {
        setQuestions(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage when questions change
  const saveQuestions = useCallback((qs: ScreeningQuestion[]) => {
    setQuestions(qs);
    localStorage.setItem('jobScreeningQuestions', JSON.stringify(qs));
  }, []);

  const addPreset = (preset: typeof PRESET_QUESTIONS[0]) => {
    if (questions.length >= 5) return;
    if (questions.some(q => q.text === preset.text)) return; // no duplicates

    const newQ: ScreeningQuestion = {
      id: crypto.randomUUID(),
      text: preset.text,
      type: preset.type,
      options: [],
      required: true,
      knockout: preset.knockout || false,
      knockoutAnswer: preset.knockoutAnswer || '',
    };
    saveQuestions([...questions, newQ]);
  };

  const addCustom = () => {
    if (questions.length >= 5 || !customText.trim()) return;

    const newQ: ScreeningQuestion = {
      id: crypto.randomUUID(),
      text: customText.trim(),
      type: customType,
      options: [],
      required: false,
      knockout: false,
      knockoutAnswer: '',
    };
    saveQuestions([...questions, newQ]);
    setCustomText('');
  };

  const removeQuestion = (id: string) => {
    saveQuestions(questions.filter(q => q.id !== id));
  };

  const toggleRequired = (id: string) => {
    saveQuestions(questions.map(q => q.id === id ? { ...q, required: !q.required } : q));
  };

  const toggleKnockout = (id: string) => {
    saveQuestions(questions.map(q =>
      q.id === id
        ? { ...q, knockout: !q.knockout, knockoutAnswer: !q.knockout ? 'no' : '' }
        : q
    ));
  };

  return (
    <div className="mt-5 rounded-xl p-5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Screening Questions <span className="font-normal text-xs" style={{ color: 'var(--text-tertiary)' }}>(optional, max 5)</span>
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Add questions to pre-screen candidates before they apply
          </p>
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>
          {questions.length}/5
        </span>
      </div>

      {/* Current questions */}
      {questions.length > 0 && (
        <div className="space-y-2 mb-4">
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <GripVertical size={14} className="mt-1 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {i + 1}. {q.text}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(107,114,128,0.1)', color: 'var(--text-tertiary)' }}>
                    {q.type === 'boolean' ? 'Yes/No' : q.type === 'number' ? 'Number' : q.type === 'select' ? 'Dropdown' : 'Short Text'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRequired(q.id)}
                    className="text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                    style={q.required
                      ? { background: 'rgba(13,148,136,0.12)', color: '#0d9488' }
                      : { background: 'rgba(107,114,128,0.1)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {q.required ? '✓ Required' : 'Optional'}
                  </button>
                  {q.type === 'boolean' && (
                    <button
                      type="button"
                      onClick={() => toggleKnockout(q.id)}
                      className="text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                      style={q.knockout
                        ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
                        : { background: 'rgba(107,114,128,0.1)', color: 'var(--text-tertiary)' }
                      }
                    >
                      {q.knockout ? '🚫 Auto-reject if "No"' : 'Knockout'}
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                className="p-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add from presets */}
      {questions.length < 5 && (
        <>
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-teal-600 mb-3"
            style={{ color: '#0d9488' }}
          >
            <Lightbulb size={14} />
            {showPresets ? 'Hide suggested questions' : 'Choose from suggested questions'}
          </button>

          {showPresets && (
            <div className="space-y-1.5 mb-4 max-h-52 overflow-y-auto">
              {PRESET_QUESTIONS.filter(p => !questions.some(q => q.text === p.text)).map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => addPreset(preset)}
                  className="w-full text-left flex items-center gap-2 p-2.5 rounded-lg text-sm transition-all hover:bg-teal-50"
                  style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                >
                  <Plus size={14} className="flex-shrink-0" style={{ color: '#0d9488' }} />
                  {preset.text}
                  <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {preset.type === 'boolean' ? 'Yes/No' : preset.type === 'number' ? 'Number' : 'Text'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Add custom question */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Type a custom question..."
              maxLength={200}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-all"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            />
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as ScreeningQuestion['type'])}
              className="rounded-lg px-2 py-2 text-xs"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            >
              <option value="boolean">Yes/No</option>
              <option value="text">Text</option>
              <option value="number">Number</option>
            </select>
            <button
              type="button"
              onClick={addCustom}
              disabled={!customText.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#0d9488' }}
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
