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

exports.sendOrderConfirmationEmail = async (to, orderDetails) => {
  if (typeof to !== 'string' || !to.trim()) {
    return false;
  }

  const { orderId, items } = orderDetails;

  if (!orderId || !Array.isArray(items) || items.length === 0) {
    return false;
  }

  // Generate HTML for items
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        ${item.img_path ? `
          <img src="${item.img_path}" alt="${item.product_name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; vertical-align: middle; margin-right: 12px;" />
        ` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="font-size: 14px; font-weight: 500; color: #202124;">
          ${item.product_name} (${item.variant_name})
        </div>
        <div style="font-size: 12px; color: #5f6368;">
          Size: ${item.size || 'N/A'}, Color: ${item.color || 'N/A'}
        </div>
        <div style="font-size: 12px; color: #5f6368;">
          Quantity: ${item.quantity}
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
        <div style="font-size: 14px; font-weight: 500; color: #202124;">
          ₹${(item.unit_price * item.quantity).toFixed(2)}
        </div>
      </td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: 'Google Sans', Roboto, Arial, sans-serif; background: #f4f4f5; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: #1a73e8; padding: 16px; text-align: center;">
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 500; margin: 0;">Order Confirmation</h1>
        </div>
        <!-- Body -->
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #202124; margin: 0 0 16px;">
            Thank you for your purchase! Your order #${orderId} has been successfully placed.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="padding: 12px; text-align: left; font-size: 14px; color: #5f6368;">Item</th>
                <th style="padding: 12px; text-align: left;"></th>
                <th style="padding: 12px; text-align: right; font-size: 14px; color: #5f6368;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div style="text-align: right; font-size: 16px; font-weight: 500; color: #202124; margin-bottom: 24px;">
            Total: ₹${total.toFixed(2)}
          </div>
          <div style="text-align: center;">
            <a href="https://ariessportswear.com/track-order?orderid=${orderId}" style="display: inline-block; background: #1a73e8; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              Track Order
            </a>
          </div>
        </div>
        <!-- Footer -->
        <div style="background: #f4f4f5; padding: 16px; text-align: center; font-size: 12px; color: #5f6368;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Aries Sportswear. All rights reserved.</p>
          <p style="margin: 8px 0 0;">Questions? Contact us at <a href="mailto:support@ariessportswear.com" style="color: #1a73e8; text-decoration: none;">support@ariessportswear.com</a></p>
        </div>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Aries Sportswear" <${process.env.EMAIL_USER}>`,
      to: to.trim(),
      subject: `Your Order #${orderId} Confirmation - Aries Sportswear`,
      html
    });
    return true;
  } catch (error) {
    console.error('sendOrderConfirmationEmail error:', error);
    return false;
  }
};

exports.sendOtpEmail = async (to, otp) => {
  if (typeof to !== 'string') return false;

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 30px;">
      <div style="max-width: 500px; margin: auto; background: #ffffff; border-radius: 8px; padding: 20px; box-shadow: 0 Dance 2px 8px rgba(0,0,0,0.05);">
        <h2 style="color: #222; text-align: center;">Email Verification</h2>
        <p style="font-size: 15px; color: #555;">Please use the following code to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #000;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #888; text-align: center;">Do not share this code with anyone.</p>
      </div>
      <p style="text-align: center; font-size: 12px; color: #aaa; margin-top: 20px;">
        © ${new Date().getFullYear()} Aries Sportswear. All rights reserved.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Aries Sportswear" <${process.env.EMAIL_USER}>`,
      to: to.trim(),
      subject: 'Your Aries Sportswear OTP Code',
      html
    });
    return true;
  } catch (error) {
    console.error('sendOtpEmail error:', error);
    return false;
  }
};