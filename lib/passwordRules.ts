// One set of password rules for sign-up and for choosing a new password after a reset, so the two can't drift apart.
// Supabase enforces its own minimum as well; this is what the forms check before they ask.
export const PASSWORD_MIN_LENGTH = 6;

/** What is wrong with a new password and its confirmation, in words for the person, or null when it's fine. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords don't match. Type the same password in both boxes.";
  return null;
}
