const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return EMAIL_RE.test(value) && value.length <= 254;
}

function isValidUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validateSignup({ displayName, email, password, confirmPassword }) {
  const name = cleanText(displayName, 40);
  const mail = normalizeEmail(email);

  if (name.length < 2) return { error: 'Display name must be at least 2 characters.' };
  if (!isValidEmail(mail)) return { error: 'Please enter a valid email address.' };
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return { error: 'Password must be between 8 and 128 characters.' };
  }
  if (password !== confirmPassword) return { error: 'Passwords do not match.' };

  return { value: { displayName: name, email: mail, password } };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  isValidUuid,
  cleanText,
  validateSignup,
};
