import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';

// Known bot/crawler user-agent patterns to exclude from view counting
const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i, /scraper/i,
  /googlebot/i, /bingbot/i, /yandex/i, /baiduspider/i, /duckduckbot/i,
  /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i, /whatsapp/i,
  /telegrambot/i, /discordbot/i, /slackbot/i,
  /semrush/i, /ahrefs/i, /moz/i, /majestic/i, /serpstat/i,
  /headlesschrome/i, /puppeteer/i, /playwright/i, /phantomjs/i,
  /lighthouse/i, /pagespeed/i, /gtmetrix/i,
  /uptimerobot/i, /pingdom/i, /statuspage/i, /monitoring/i,
  /curl/i, /wget/i, /axios/i, /node-fetch/i, /python-requests/i,
  /go-http-client/i, /java\//i, /ruby/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // No user-agent = likely bot
  if (userAgent.length < 20) return true; // Too short = likely automated
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const jobId = resolvedParams.id;

    // Find job by exact ID
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Only count views from real users — filter out bots/crawlers
    const userAgent = request.headers.get('user-agent');
    if (!isBot(userAgent)) {
      await prisma.job.update({
        where: { id: job.id },
        data: { viewCount: { increment: 1 } },
      });
    }

    return NextResponse.json(job);
  } catch (error) {
    logger.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

