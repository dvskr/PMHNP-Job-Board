'use client';

import { useEffect, useState, useCallback } from 'react';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface EditorialTOCProps {
  headings: Heading[];
  readTime?: string;
  wordCount?: number;
}

export default function EditorialTOC({ headings, readTime, wordCount }: EditorialTOCProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [progress, setProgress] = useState(0);

  // Track active heading via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first heading that is intersecting from top
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-90px 0px -70% 0px', threshold: 0 }
    );

    const headingEls = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    headingEls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [headings]);

  // Track scroll progress
  const handleScroll = useCallback(() => {
    const article = document.querySelector('.editorial-prose');
    if (!article) return;
    const rect = article.getBoundingClientRect();
    const total = rect.height;
    const scrolled = Math.max(0, -rect.top);
    setProgress(Math.min(100, (scrolled / total) * 100));
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Find current section name
  const currentSection = headings.find((h) => h.id === activeId)?.text || '';

  if (headings.length === 0) return null;

  // Number only h2 headings
  let h2Count = 0;

  return (
    <nav className="ed-toc" aria-label="Table of contents">
      <div className="ed-toc-label">Contents</div>
      <ul className="ed-toc-list">
        {headings.map((heading) => {
          const isH3 = heading.level === 3;
          if (!isH3) h2Count++;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={`ed-toc-item ${isH3 ? 'ed-toc-h3' : ''} ${activeId === heading.id ? 'ed-toc-active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {!isH3 && (
                  <span className="ed-toc-num">
                    {String(h2Count).padStart(2, '0')}
                  </span>
                )}
                <span className="ed-toc-text">{heading.text}</span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Stats footer */}
      <div className="ed-toc-footer">
        <dl>
          {readTime && (
            <div className="ed-toc-meta-row">
              <dt className="ed-toc-meta-label">Read</dt>
              <dd className="ed-toc-meta-value">{readTime}</dd>
            </div>
          )}
          {wordCount && (
            <div className="ed-toc-meta-row">
              <dt className="ed-toc-meta-label">Words</dt>
              <dd className="ed-toc-meta-value">{wordCount.toLocaleString()}</dd>
            </div>
          )}
          {currentSection && (
            <div className="ed-toc-meta-row">
              <dt className="ed-toc-meta-label">Section</dt>
              <dd className="ed-toc-meta-value ed-toc-section-name">{currentSection}</dd>
            </div>
          )}
        </dl>
        <div className="ed-toc-progress-bar">
          <div className="ed-toc-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </nav>
  );
}
