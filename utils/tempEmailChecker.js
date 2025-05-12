const TEMP_DOMAINS = ['mailinator.com', 'tempmail.com', '10minutemail.com'];

exports.isTemporaryEmail = (email) => {
  if (typeof email !== 'string' || !email.trim()) {
    console.error('Invalid email input:', email);
    return false;
  }

  const parts = email.trim().split('@');
  if (parts.length !== 2 || !parts[1]) {
    console.error('Invalid email format:', email);
    return false;
  }

  const domain = parts[1].toLowerCase();
  return TEMP_DOMAINS.includes(domain);
};