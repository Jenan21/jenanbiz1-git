export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
}
export interface AuthSession {
  id: string;
  user: AuthUser;
  expiresAt: Date;
}
export interface Credentials {
  email: string;
  password: string;
}
export interface RegistrationInput extends Credentials {
  displayName?: string;
}
