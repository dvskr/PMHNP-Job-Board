'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    User,
    Mail,
    Phone,
    MapPin,
    Briefcase,
    GraduationCap,
    Award,
    Shield,
    FileText,
    Heart,
    DollarSign,
    Eye,
    ArrowRight,
    ArrowLeft,
    Check,
    Upload,
} from 'lucide-react';

const SPECIALTIES = [
    'Adult Psychiatry',
    'Child & Adolescent',
    'Geriatric Psychiatry',
    'Addiction/Substance Abuse',
    'Forensic Psychiatry',
    'Emergency Psychiatry',
    'Consultation-Liaison',
    'Neuropsychiatry',
    'Mood Disorders',
    'Anxiety Disorders',
    'PTSD/Trauma',
    'Eating Disorders',
];

const SETTINGS = [
    'Outpatient',
    'Inpatient',
    'Telehealth',
    'Community Mental Health',
    'Private Practice',
    'Hospital',
    'Correctional',
    'VA/Government',
    'Academic',
];

const STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
    'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
    'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
    'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    'District of Columbia',
];

type StepKey = 'personal' | 'professional' | 'preferences' | 'visibility';

const STEPS: { key: StepKey; label: string; icon: typeof User }[] = [
    { key: 'personal', label: 'Personal Info', icon: User },
    { key: 'professional', label: 'Professional', icon: Briefcase },
    { key: 'preferences', label: 'Preferences', icon: Heart },
    { key: 'visibility', label: 'Visibility', icon: Eye },
];

export default function CreateProfilePage() {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // Personal
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zipCode, setZipCode] = useState('');

    // Professional
    const [npiNumber, setNpiNumber] = useState('');
    const [licenseState, setLicenseState] = useState('');
    const [yearsExperience, setYearsExperience] = useState('');
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [certifications, setCertifications] = useState('');
    const [education, setEducation] = useState('');
    const [bio, setBio] = useState('');

    // Preferences
    const [desiredSettings, setDesiredSettings] = useState<string[]>([]);
    const [desiredSalaryMin, setDesiredSalaryMin] = useState('');
    const [desiredSalaryMax, setDesiredSalaryMax] = useState('');
    const [openToRelocation, setOpenToRelocation] = useState(false);
    const [openToRemote, setOpenToRemote] = useState(false);
    const [availableDate, setAvailableDate] = useState('');

    // Visibility
    const [openToOffers, setOpenToOffers] = useState(true);
    const [profileVisible, setProfileVisible] = useState(true);

    const toggleArrayItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
        setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMsg('');

        try {
            const res = await fetch('/api/candidate-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    phone,
                    city,
                    state,
                    zipCode,
                    npiNumber,
                    licenseState,
                    yearsExperience: yearsExperience ? parseInt(yearsExperience) : null,
                    specialties,
                    certifications,
                    education,
                    bio,
                    desiredSettings,
                    desiredSalaryMin: desiredSalaryMin ? parseInt(desiredSalaryMin) : null,
                    desiredSalaryMax: desiredSalaryMax ? parseInt(desiredSalaryMax) : null,
                    openToRelocation,
                    openToRemote,
                    availableDate: availableDate || null,
                    openToOffers,
                    profileVisible,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create profile');
            }

            setStatus('done');
            setTimeout(() => router.push('/for-job-seekers'), 2000);
        } catch (err) {
            setStatus('error');
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: '6px',
    };

    const chipStyle = (selected: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: selected ? '1px solid #2DD4BF' : '1px solid var(--border-color)',
        backgroundColor: selected ? 'rgba(45,212,191,0.1)' : 'var(--bg-tertiary)',
        color: selected ? '#2DD4BF' : 'var(--text-secondary)',
    });

    const renderStep = () => {
        switch (STEPS[step].key) {
            case 'personal':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}><User size={13} style={{ display: 'inline', marginRight: '4px' }} />First Name *</label>
                                <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required />
                            </div>
                            <div>
                                <label style={labelStyle}>Last Name *</label>
                                <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" required />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}><Mail size={13} style={{ display: 'inline', marginRight: '4px' }} />Email *</label>
                            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" required />
                        </div>
                        <div>
                            <label style={labelStyle}><Phone size={13} style={{ display: 'inline', marginRight: '4px' }} />Phone</label>
                            <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}><MapPin size={13} style={{ display: 'inline', marginRight: '4px' }} />City</label>
                                <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="New York" />
                            </div>
                            <div>
                                <label style={labelStyle}>State</label>
                                <select style={inputStyle} value={state} onChange={(e) => setState(e.target.value)}>
                                    <option value="">Select</option>
                                    {STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>ZIP</label>
                                <input style={inputStyle} value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="10001" />
                            </div>
                        </div>
                    </div>
                );

            case 'professional':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}><Shield size={13} style={{ display: 'inline', marginRight: '4px' }} />NPI Number</label>
                                <input style={inputStyle} value={npiNumber} onChange={(e) => setNpiNumber(e.target.value)} placeholder="1234567890" />
                            </div>
                            <div>
                                <label style={labelStyle}>License State</label>
                                <select style={inputStyle} value={licenseState} onChange={(e) => setLicenseState(e.target.value)}>
                                    <option value="">Select</option>
                                    {STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}><Briefcase size={13} style={{ display: 'inline', marginRight: '4px' }} />Years of Experience</label>
                            <input style={inputStyle} type="number" min="0" value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} placeholder="5" />
                        </div>
                        <div>
                            <label style={labelStyle}><Award size={13} style={{ display: 'inline', marginRight: '4px' }} />Specialties</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {SPECIALTIES.map((sp) => (
                                    <button
                                        type="button"
                                        key={sp}
                                        style={chipStyle(specialties.includes(sp))}
                                        onClick={() => toggleArrayItem(specialties, sp, setSpecialties)}
                                    >
                                        {specialties.includes(sp) && <Check size={12} />}
                                        {sp}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}><GraduationCap size={13} style={{ display: 'inline', marginRight: '4px' }} />Education</label>
                            <input style={inputStyle} value={education} onChange={(e) => setEducation(e.target.value)} placeholder="MSN, DNP, PhD..." />
                        </div>
                        <div>
                            <label style={labelStyle}><FileText size={13} style={{ display: 'inline', marginRight: '4px' }} />Bio / Summary</label>
                            <textarea
                                style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Brief professional summary..."
                            />
                        </div>
                    </div>
                );

            case 'preferences':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={labelStyle}>Desired Practice Settings</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {SETTINGS.map((s) => (
                                    <button
                                        type="button"
                                        key={s}
                                        style={chipStyle(desiredSettings.includes(s))}
                                        onClick={() => toggleArrayItem(desiredSettings, s, setDesiredSettings)}
                                    >
                                        {desiredSettings.includes(s) && <Check size={12} />}
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label style={labelStyle}><DollarSign size={13} style={{ display: 'inline', marginRight: '4px' }} />Desired Min Salary</label>
                                <input style={inputStyle} type="number" value={desiredSalaryMin} onChange={(e) => setDesiredSalaryMin(e.target.value)} placeholder="120000" />
                            </div>
                            <div>
                                <label style={labelStyle}>Desired Max Salary</label>
                                <input style={inputStyle} type="number" value={desiredSalaryMax} onChange={(e) => setDesiredSalaryMax(e.target.value)} placeholder="180000" />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Available Start Date</label>
                            <input style={inputStyle} type="date" value={availableDate} onChange={(e) => setAvailableDate(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ ...chipStyle(openToRemote), cursor: 'pointer' }} onClick={() => setOpenToRemote(!openToRemote)}>
                                {openToRemote && <Check size={12} />} Open to Remote Work
                            </label>
                            <label style={{ ...chipStyle(openToRelocation), cursor: 'pointer' }} onClick={() => setOpenToRelocation(!openToRelocation)}>
                                {openToRelocation && <Check size={12} />} Open to Relocation
                            </label>
                        </div>
                    </div>
                );

            case 'visibility':
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div
                            style={{
                                padding: '24px',
                                borderRadius: '16px',
                                backgroundColor: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Profile Visible to Employers</span>
                                <button
                                    type="button"
                                    onClick={() => setProfileVisible(!profileVisible)}
                                    style={{
                                        width: '48px',
                                        height: '28px',
                                        borderRadius: '14px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: profileVisible ? '#2DD4BF' : 'var(--border-color)',
                                        position: 'relative',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            backgroundColor: '#fff',
                                            position: 'absolute',
                                            top: '3px',
                                            left: profileVisible ? '23px' : '3px',
                                            transition: 'left 0.2s',
                                        }}
                                    />
                                </button>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                When enabled, employers can find your profile in candidate search.
                            </p>
                        </div>

                        <div
                            style={{
                                padding: '24px',
                                borderRadius: '16px',
                                backgroundColor: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Open to Job Offers</span>
                                <button
                                    type="button"
                                    onClick={() => setOpenToOffers(!openToOffers)}
                                    style={{
                                        width: '48px',
                                        height: '28px',
                                        borderRadius: '14px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: openToOffers ? '#2DD4BF' : 'var(--border-color)',
                                        position: 'relative',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            backgroundColor: '#fff',
                                            position: 'absolute',
                                            top: '3px',
                                            left: openToOffers ? '23px' : '3px',
                                            transition: 'left 0.2s',
                                        }}
                                    />
                                </button>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                Let employers know you&apos;re actively looking for opportunities.
                            </p>
                        </div>

                        <div
                            style={{
                                padding: '20px',
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(45,212,191,0.02))',
                                border: '1px solid rgba(45,212,191,0.15)',
                                fontSize: '13px',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.6,
                            }}
                        >
                            <strong style={{ color: '#2DD4BF' }}>Privacy Note:</strong> Your contact details (email, phone)
                            are only visible to Pro-tier employers. All other employers see your specialties, location, and
                            experience without identifying information.
                        </div>
                    </div>
                );
        }
    };

    if (status === 'done') {
        return (
            <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div
                        style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px',
                        }}
                    >
                        <Check size={32} style={{ color: '#fff' }} />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        Profile Created!
                    </h2>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Redirecting you to your dashboard...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100vh', padding: '48px 16px 80px' }}>
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h1
                        style={{
                            fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            marginBottom: '8px',
                        }}
                    >
                        Create Your PMHNP Profile
                    </h1>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                        Let employers find you. It only takes a few minutes.
                    </p>
                </div>

                {/* Step Indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '36px' }}>
                    {STEPS.map((s, i) => {
                        const Icon = s.icon;
                        const active = i === step;
                        const completed = i < step;
                        return (
                            <button
                                type="button"
                                key={s.key}
                                onClick={() => i < step && setStep(i)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 16px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    cursor: i <= step ? 'pointer' : 'default',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    backgroundColor: active
                                        ? 'rgba(45,212,191,0.15)'
                                        : completed
                                            ? 'rgba(45,212,191,0.05)'
                                            : 'var(--bg-secondary)',
                                    color: active ? '#2DD4BF' : completed ? '#2DD4BF' : 'var(--text-muted)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {completed ? <Check size={14} /> : <Icon size={14} />}
                                <span className="hidden sm:inline">{s.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Step Content */}
                <form onSubmit={handleSubmit}>
                    <div
                        style={{
                            padding: '32px 28px',
                            borderRadius: '20px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            marginBottom: '24px',
                        }}
                    >
                        <h2
                            style={{
                                fontSize: '18px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                marginBottom: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                        >
                            {(() => { const Icon = STEPS[step].icon; return <Icon size={18} style={{ color: '#2DD4BF' }} />; })()}
                            {STEPS[step].label}
                        </h2>

                        {renderStep()}
                    </div>

                    {/* Error message */}
                    {status === 'error' && (
                        <div
                            style={{
                                padding: '12px 16px',
                                borderRadius: '10px',
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: '#EF4444',
                                fontSize: '13px',
                                marginBottom: '16px',
                            }}
                        >
                            {errorMsg}
                        </div>
                    )}

                    {/* Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        {step > 0 ? (
                            <button
                                type="button"
                                onClick={() => setStep(step - 1)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '12px 24px',
                                    borderRadius: '12px',
                                    backgroundColor: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                <ArrowLeft size={16} /> Back
                            </button>
                        ) : (
                            <div />
                        )}

                        {step < STEPS.length - 1 ? (
                            <button
                                type="button"
                                onClick={() => setStep(step + 1)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '12px 28px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(45,212,191,0.25)',
                                }}
                            >
                                Continue <ArrowRight size={16} />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '12px 28px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                                    opacity: status === 'loading' ? 0.7 : 1,
                                    boxShadow: '0 4px 12px rgba(45,212,191,0.25)',
                                }}
                            >
                                {status === 'loading' ? 'Creating...' : 'Create Profile'} <Check size={16} />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
