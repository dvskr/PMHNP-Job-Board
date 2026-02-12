'use client'

import { useState, useRef } from 'react'
import { X, Plus } from 'lucide-react'

interface ChipSelectorProps {
    label: string
    presets: string[]
    value: string // comma-separated
    onChange: (value: string) => void
    allowCustom?: boolean
    customPlaceholder?: string
}

export default function ChipSelector({
    label,
    presets,
    value,
    onChange,
    allowCustom = true,
    customPlaceholder = 'Add custom...',
}: ChipSelectorProps) {
    const [customInput, setCustomInput] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const selected = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []

    const toggle = (item: string) => {
        if (selected.includes(item)) {
            onChange(selected.filter((s) => s !== item).join(','))
        } else {
            onChange([...selected, item].join(','))
        }
    }

    const addCustom = () => {
        const trimmed = customInput.trim()
        if (trimmed && !selected.includes(trimmed)) {
            onChange([...selected, trimmed].join(','))
        }
        setCustomInput('')
        inputRef.current?.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addCustom()
        }
    }

    return (
        <div>
            <label
                style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, marginBottom: '8px', display: 'block' }}
            >
                {label}
            </label>

            {/* Preset chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: allowCustom ? '10px' : '0' }}>
                {presets.map((item) => {
                    const isSelected = selected.includes(item)
                    return (
                        <button
                            key={item}
                            type="button"
                            onClick={() => toggle(item)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: isSelected ? '1.5px solid #2DD4BF' : '1.5px solid var(--border-color)',
                                background: isSelected ? 'rgba(45,212,191,0.12)' : 'var(--bg-primary)',
                                color: isSelected ? '#2DD4BF' : 'var(--text-secondary)',
                            }}
                        >
                            {item}
                        </button>
                    )
                })}
            </div>

            {/* Custom entries (non-preset selected items) */}
            {selected.filter((s) => !presets.includes(s)).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {selected
                        .filter((s) => !presets.includes(s))
                        .map((item) => (
                            <span
                                key={item}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    borderRadius: '16px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    background: 'rgba(45,212,191,0.12)',
                                    color: '#2DD4BF',
                                    border: '1px solid rgba(45,212,191,0.3)',
                                }}
                            >
                                {item}
                                <button
                                    type="button"
                                    onClick={() => toggle(item)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#2DD4BF',
                                        cursor: 'pointer',
                                        padding: '0',
                                        display: 'flex',
                                        alignItems: 'center',
                                    }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                </div>
            )}

            {/* Custom input */}
            {allowCustom && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={customPlaceholder}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '10px',
                            border: '1.5px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            outline: 'none',
                        }}
                    />
                    <button
                        type="button"
                        onClick={addCustom}
                        disabled={!customInput.trim()}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid var(--border-color)',
                            background: customInput.trim() ? 'rgba(45,212,191,0.1)' : 'var(--bg-primary)',
                            color: customInput.trim() ? '#2DD4BF' : 'var(--text-muted)',
                            cursor: customInput.trim() ? 'pointer' : 'default',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s',
                        }}
                    >
                        <Plus size={14} />
                        Add
                    </button>
                </div>
            )}
        </div>
    )
}
