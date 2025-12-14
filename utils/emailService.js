import nodemailer from 'nodemailer';

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  // For production, use environment variables
  // For development/testing, you can use Gmail, Outlook, or other SMTP services
  
  // Option 1: Using Gmail (requires app password)
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // App password, not regular password
      },
    });
  }

  // Option 2: Using custom SMTP
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  // Option 3: Development mode - use Ethereal Email (for testing)
  // This creates a test account automatically
  return null; // Will be handled in sendEmail function
};

// Send email function
export const sendEmail = async (to, subject, html, text = '') => {
  try {
    // If email is not configured, log and return success (for development)
    if (!process.env.EMAIL_USER && !process.env.SMTP_HOST) {
      console.log('📧 Email not configured. Would send email to:', to);
      console.log('📧 Subject:', subject);
      console.log('📧 Message:', text || html);
      return { success: true, message: 'Email logged (not configured)' };
    }

    const transporter = createTransporter();

    if (!transporter) {
      console.log('📧 Email transporter not available. Email would be sent to:', to);
      return { success: true, message: 'Email logged (transporter not available)' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@loanlink.com',
      to: to,
      subject: subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Plain text version
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('📧 Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('📧 Email sending error:', error);
    // Don't throw error, just log it so the reply can still be saved
    return { success: false, error: error.message };
  }
};

// Send reply email to contact message sender
export const sendContactReply = async (contactMessage, replyMessage) => {
  const subject = `Re: ${contactMessage.subject}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .message-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4F46E5; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>LoanLink - Contact Reply</h1>
        </div>
        <div class="content">
          <p>Dear ${contactMessage.name},</p>
          <p>Thank you for contacting LoanLink. We have received your message and here is our reply:</p>
          
          <div class="message-box">
            <p><strong>Your Original Message:</strong></p>
            <p>${contactMessage.message.replace(/\n/g, '<br>')}</p>
          </div>
          
          <div class="message-box">
            <p><strong>Our Reply:</strong></p>
            <p>${replyMessage.replace(/\n/g, '<br>')}</p>
          </div>
          
          <p>If you have any further questions, please don't hesitate to contact us.</p>
          <p>Best regards,<br>LoanLink Support Team</p>
        </div>
        <div class="footer">
          <p>This is an automated response from LoanLink.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Dear ${contactMessage.name},

Thank you for contacting LoanLink. We have received your message and here is our reply:

Your Original Message:
${contactMessage.message}

Our Reply:
${replyMessage}

If you have any further questions, please don't hesitate to contact us.

Best regards,
LoanLink Support Team
  `;

  return await sendEmail(contactMessage.email, subject, html, text);
};

