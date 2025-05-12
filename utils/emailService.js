const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'mail.ariessportswear.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

exports.sendOtpEmail = async (to, otp) => {
  if (typeof to !== 'string') return false;

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 30px;">
      <div style="max-width: 500px; margin: auto; background: #ffffff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h2 style="color: #222; text-align: center;">Email Verification</h2>
        <p style="font-size: 15px; color: #555;">Please use the following code to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #000;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #888; text-align: center;">Do not share this code with anyone.</p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 20px;">
        &copy; ${new Date().getFullYear()} Aries Sportswear. All rights reserved.
      </p>
    </div>
  `;

  return transporter.sendMail({
    from: `"Aries Sportswear" <${process.env.EMAIL_USER}>`,
    to: to.trim(),
    subject: 'Your Aries Sportswear OTP Code',
    html
  });

};