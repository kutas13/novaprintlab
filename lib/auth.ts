export const AUTH_EMAIL = "esatis1313@gmail.com";
export const AUTH_PASSWORD = "475013";

export const SESSION_COOKIE = "npl_session";
export const SESSION_VALUE = "authenticated";

export function isValidCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === AUTH_EMAIL && password === AUTH_PASSWORD;
}
