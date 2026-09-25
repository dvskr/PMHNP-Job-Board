/**
 * uploadAvatar hardening (hunt 2026-09-03).
 *
 * Two defects, one function:
 *   1. The storage key took its extension from `fileName.split('.').pop()`,
 *      so a multipart filename of `a.png/../../otheruser/evil` traversed out
 *      of the caller's own folder inside a PUBLIC bucket, and a dot-less
 *      filename produced the literal key `<prefix>/<uid>/<ts>.undefined`.
 *   2. uploadResume virus-scans before writing; uploadAvatar did not, so the
 *      public bucket was the one unscanned sink.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const scanMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}));

vi.mock('@/lib/virus-scan', () => ({
  scanFileForViruses: (...args: unknown[]) => scanMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  uploadMock.mockResolvedValue({ data: { path: 'stored/path.png' }, error: null });
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.example/stored/path.png' } });
  scanMock.mockResolvedValue({ clean: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function upload(fileName: string, fileType = 'image/png') {
  const { uploadAvatar } = await import('@/lib/supabase-storage');
  return uploadAvatar(PNG, fileName, fileType, 'user-123');
}

describe('uploadAvatar storage key', () => {
  it('ignores a traversal payload hidden in the filename extension', async () => {
    await upload('a.png/../../otheruser/evil');
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key).not.toContain('..');
    expect(key).not.toContain('otheruser');
    expect(key).toMatch(/\/user-123\/\d+\.png$/);
  });

  it('never emits ".undefined" for a filename with no dot', async () => {
    await upload('avatar');
    const key = uploadMock.mock.calls[0][0] as string;
    expect(key).not.toContain('undefined');
    expect(key.endsWith('.png')).toBe(true);
  });

  it('derives the extension from the validated MIME type, not the name', async () => {
    await upload('portrait.png', 'image/webp');
    expect(uploadMock.mock.calls[0][0]).toMatch(/\.webp$/);
  });
});

describe('uploadAvatar virus scan', () => {
  it('scans before writing to the public bucket', async () => {
    await upload('avatar.png');
    expect(scanMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(scanMock.mock.invocationCallOrder[0])
      .toBeLessThan(uploadMock.mock.invocationCallOrder[0]);
  });

  it('throws and never uploads when the scanner rejects the file', async () => {
    scanMock.mockResolvedValue({ clean: false, threats: ['Eicar-Test'], message: 'File rejected by virus scanner.' });
    await expect(upload('avatar.png')).rejects.toThrow(/virus scanner/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
