'use client'

interface PillSelectorProps {
    label: string
    options: string[]
    value: string
    onChange: (value: string) => void
}

export default function PillSelector({
    label,
    options,
    value,
    onChange,
}: PillSelectorProps) {
    return (
        <div>
            <label
                style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, marginBottom: '8px', display: 'block' }}
            >
                {label}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {options.map((option) => {
                    const isSelected = value === option
                    return (
                        <button
                            key={option}
                            type="button"
                            onClick={() => onChange(option)}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '24px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: isSelected ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                background: isSelected
                                    ? 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(45,212,191,0.08))'
                                    : 'var(--bg-primary)',
                                color: isSelected ? '#2DD4BF' : 'var(--text-secondary)',
                                boxShadow: isSelected ? '0 0 12px rgba(45,212,191,0.1)' : 'none',
                            }}
                        >
                            {option}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
