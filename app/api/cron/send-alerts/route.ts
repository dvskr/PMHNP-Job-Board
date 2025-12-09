import { NextRequest, NextResponse } from 'next/server'
import { sendJobAlerts } from '@/lib/job-alerts-service'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Use the job alerts service (GAP FIX 2)
    const results = await sendJobAlerts()
    
    console.log('Job alerts complete:', results)
    
    return NextResponse.json({ 
      success: true, 
      alertsSent: results.sent,
      alertsSkipped: results.skipped,
      errors: results.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Cron send-alerts error:', error)
    return NextResponse.json({ error: 'Alert sending failed' }, { status: 500 })
  }
}
