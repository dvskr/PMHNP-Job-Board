
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
    // Font loading (optional, using system fonts for simplicity first)
    // const interSemiBold = fetch(
    //   new URL('../../assets/fonts/Inter-SemiBold.ttf', import.meta.url)
    // ).then((res) => res.arrayBuffer());

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#0D9488', // Primary color
                    color: 'white',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        padding: '40px 60px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                    }}
                >
                    {/* Logo Placeholder - fetching external images in edge can be tricky without arrayBuffer, using text/icon for now or simplest img if public */}
                    <img
                        src="https://pmhnphiring.com/pmhnp_logo.png"
                        height="100"
                        width="100"
                        alt="PMHNP Logo"
                        style={{ marginBottom: 20, borderRadius: 12 }}
                    />
                    <div
                        style={{
                            fontSize: 60,
                            fontWeight: 800,
                            color: '#0D9488',
                            marginBottom: 10,
                            letterSpacing: '-0.02em',
                            fontFamily: 'sans-serif',
                        }}
                    >
                        PMHNP Hiring
                    </div>
                    <div
                        style={{
                            fontSize: 30,
                            color: '#333',
                            fontFamily: 'sans-serif',
                            textAlign: 'center',
                            maxWidth: 800,
                        }}
                    >
                        The #1 Job Board for Psychiatric Nurse Practitioners
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
