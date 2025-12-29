import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate all required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      );
    }

    // Validate field lengths
    if (name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name cannot be empty.' },
        { status: 400 }
      );
    }

    if (subject.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Subject cannot be empty.' },
        { status: 400 }
      );
    }

    if (message.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Message cannot be empty.' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    // Trim all fields
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    // 1. Send notification email to support team
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: 'support@pmhnphiring.com',
        subject: `Contact Form: ${trimmedSubject}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .header {
                  background: linear-gradient(135deg, #0D9488 0%, #0F766E 100%);
                  color: white;
                  padding: 20px;
                  border-radius: 8px 8px 0 0;
                  margin-bottom: 0;
                }
                .content {
                  background: #ffffff;
                  border: 1px solid #e5e7eb;
                  border-top: none;
                  border-radius: 0 0 8px 8px;
                  padding: 30px;
                }
                .field {
                  margin-bottom: 20px;
                }
                .field-label {
                  font-weight: 600;
                  color: #0D9488;
                  margin-bottom: 5px;
                  font-size: 14px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }
                .field-value {
                  color: #1f2937;
                  font-size: 16px;
                  padding: 12px;
                  background: #f9fafb;
                  border-radius: 6px;
                  border-left: 3px solid #0D9488;
                }
                .message-box {
                  white-space: pre-wrap;
                  word-wrap: break-word;
                }
                .footer {
                  margin-top: 20px;
                  padding-top: 20px;
                  border-top: 1px solid #e5e7eb;
                  font-size: 14px;
                  color: #6b7280;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h2 style="margin: 0; font-size: 20px;">📧 New Contact Form Submission</h2>
              </div>
              <div class="content">
                <div class="field">
                  <div class="field-label">From</div>
                  <div class="field-value">${trimmedName}</div>
                </div>
                
                <div class="field">
                  <div class="field-label">Email</div>
                  <div class="field-value">
                    <a href="mailto:${trimmedEmail}" style="color: #0D9488; text-decoration: none;">
                      ${trimmedEmail}
                    </a>
                  </div>
                </div>
                
                <div class="field">
                  <div class="field-label">Subject</div>
                  <div class="field-value">${trimmedSubject}</div>
                </div>
                
                <div class="field">
                  <div class="field-label">Message</div>
                  <div class="field-value message-box">${trimmedMessage}</div>
                </div>
                
                <div class="footer">
                  <p style="margin: 0;">
                    Reply directly to this email or contact ${trimmedName} at 
                    <a href="mailto:${trimmedEmail}" style="color: #0D9488;">${trimmedEmail}</a>
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
        replyTo: trimmedEmail,
      });

      console.log(`Contact form submission from ${trimmedEmail} - Subject: ${trimmedSubject}`);
    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
      // Continue to send confirmation email even if notification fails
    }

    // 2. Send confirmation email to user
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: trimmedEmail,
        subject: 'We received your message',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .header {
                  background: linear-gradient(135deg, #0D9488 0%, #0F766E 100%);
                  color: white;
                  padding: 30px;
                  border-radius: 8px 8px 0 0;
                  text-align: center;
                }
                .content {
                  background: #ffffff;
                  border: 1px solid #e5e7eb;
                  border-top: none;
                  border-radius: 0 0 8px 8px;
                  padding: 30px;
                }
                .confirmation-icon {
                  font-size: 48px;
                  margin-bottom: 10px;
                }
                .greeting {
                  font-size: 18px;
                  font-weight: 600;
                  color: #1f2937;
                  margin-bottom: 15px;
                }
                .message {
                  color: #4b5563;
                  margin-bottom: 15px;
                  font-size: 16px;
                }
                .info-box {
                  background: #f0fdfa;
                  border-left: 4px solid #0D9488;
                  padding: 15px;
                  border-radius: 6px;
                  margin: 20px 0;
                }
                .footer {
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #e5e7eb;
                  text-align: center;
                  color: #6b7280;
                  font-size: 14px;
                }
                .footer a {
                  color: #0D9488;
                  text-decoration: none;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <div class="confirmation-icon">✓</div>
                <h1 style="margin: 0; font-size: 24px;">Thank You for Contacting Us!</h1>
              </div>
              <div class="content">
                <div class="greeting">Hi ${trimmedName},</div>
                
                <div class="message">
                  Thanks for reaching out to PMHNP Jobs! We've received your message and will get back to you within 24-48 hours.
                </div>
                
                <div class="info-box">
                  <p style="margin: 0 0 10px 0; font-weight: 600; color: #0D9488;">Your message:</p>
                  <p style="margin: 0; font-weight: 600;">"${trimmedSubject}"</p>
                </div>
                
                <div class="message">
                  In the meantime, feel free to:
                </div>
                
                <ul style="color: #4b5563; margin: 15px 0;">
                  <li style="margin-bottom: 8px;">
                    <a href="https://pmhnphiring.com/jobs" style="color: #0D9488; text-decoration: none;">Browse available PMHNP jobs</a>
                  </li>
                  <li style="margin-bottom: 8px;">
                    <a href="https://pmhnphiring.com/faq" style="color: #0D9488; text-decoration: none;">Check out our FAQ</a>
                  </li>
                  <li style="margin-bottom: 8px;">
                    <a href="https://pmhnphiring.com/about" style="color: #0D9488; text-decoration: none;">Learn more about us</a>
                  </li>
                </ul>
                
                <div class="footer">
                  <p style="margin: 0 0 10px 0;">
                    <strong>PMHNP Jobs</strong><br>
                    The #1 job board for psychiatric nurse practitioners
                  </p>
                  <p style="margin: 0;">
                    <a href="mailto:support@pmhnphiring.com">support@pmhnphiring.com</a> | 
                    <a href="https://pmhnphiring.com">pmhnphiring.com</a>
                  </p>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      console.log(`Confirmation email sent to ${trimmedEmail}`);
    } catch (confirmationError) {
      console.error('Error sending confirmation email:', confirmationError);
      // Don't fail the request if confirmation email fails
    }

    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'Message sent! We\'ll get back to you within 24-48 hours.'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send message. Please try again or email us directly at support@pmhnphiring.com.'
      },
      { status: 500 }
    );
  }
}

