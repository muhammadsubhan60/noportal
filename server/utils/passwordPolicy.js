const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
const PIN_RE = /^\d{6}$/;

/**
 * Password strength for self-serve accounts (signup, forgot-password).
 * Every route on that path must call this so the rule can't drift out of sync.
 */
function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (!SPECIAL_CHAR_RE.test(password)) return 'Password must contain at least one special character';
  return null;
}

/**
 * Admin/reseller-created client accounts use a 6-digit numeric PIN instead of
 * a real password — it's assigned by staff and communicated directly to the
 * client, not self-chosen, so length/complexity rules don't apply here.
 */
function validatePin(pin) {
  if (!pin || !PIN_RE.test(pin)) return 'PIN must be exactly 6 digits';
  return null;
}

module.exports = { validatePassword, validatePin };
