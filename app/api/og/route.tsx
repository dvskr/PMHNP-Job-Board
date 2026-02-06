import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    // Get dynamic parameters
    const title = searchParams.get('title') || 'PMHNP Job Opportunity';
    const company = searchParams.get('company') || '';
    const salary = searchParams.get('salary') || '';
    const location = searchParams.get('location') || '';
    const jobType = searchParams.get('jobType') || '';
    const isNew = searchParams.get('isNew') === 'true';

    // Truncate title if too long
    const displayTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#0D9488',
                    padding: '40px',
                }}
            >
                {/* Main Card */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        padding: '50px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                    }}
                >
                    {/* Header with Logo and Badge */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '30px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                            }}
                        >
                            {/* Simple text logo instead of image to avoid fetch issues */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '60px',
                                    height: '60px',
                                    backgroundColor: '#0D9488',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '28px',
                                    fontWeight: 800,
                                }}
                            >
                                P
                            </div>
                            <div
                                style={{
                                    fontSize: '28px',
                                    fontWeight: 700,
                                    color: '#0D9488',
                                }}
                            >
                                PMHNP Hiring
                            </div>
                        </div>
                        {isNew && (
                            <div
                                style={{
                                    display: 'flex',
                                    backgroundColor: '#059669',
                                    color: 'white',
                                    padding: '8px 20px',
                                    borderRadius: '20px',
                                    fontSize: '20px',
                                    fontWeight: 600,
                                }}
                            >
                                NEW
                            </div>
                        )}
                    </div>

                    {/* Job Title */}
                    <div
                        style={{
                            fontSize: '52px',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.2,
                            marginBottom: '16px',
                        }}
                    >
                        {displayTitle}
                    </div>

                    {/* Company */}
                    {company && (
                        <div
                            style={{
                                fontSize: '32px',
                                fontWeight: 600,
                                color: '#4B5563',
                                marginBottom: '24px',
                            }}
                        >
                            at {company}
                        </div>
                    )}

                    {/* Spacer */}
                    <div style={{ display: 'flex', flex: 1 }} />

                    {/* Bottom Info Row */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '40px',
                            flexWrap: 'wrap',
                        }}
                    >
                        {/* Salary - prominent */}
                        {salary && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '18px',
                                        color: '#6B7280',
                                        fontWeight: 500,
                                    }}
                                >
                                    SALARY
                                </div>
                                <div
                                    style={{
                                        fontSize: '36px',
                                        fontWeight: 800,
                                        color: '#059669',
                                    }}
                                >
                                    {salary}
                                </div>
                            </div>
                        )}

                        {/* Location */}
                        {location && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '18px',
                                        color: '#6B7280',
                                        fontWeight: 500,
                                    }}
                                >
                                    LOCATION
                                </div>
                                <div
                                    style={{
                                        fontSize: '28px',
                                        fontWeight: 600,
                                        color: '#111827',
                                    }}
                                >
                                    {location}
                                </div>
                            </div>
                        )}

                        {/* Job Type */}
                        {jobType && (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '18px',
                                        color: '#6B7280',
                                        fontWeight: 500,
                                    }}
                                >
                                    TYPE
                                </div>
                                <div
                                    style={{
                                        fontSize: '28px',
                                        fontWeight: 600,
                                        color: '#111827',
                                    }}
                                >
                                    {jobType}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    );
}
