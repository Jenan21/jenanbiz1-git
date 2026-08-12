import type {
  AuthSession,
  AuthUser,
  Credentials,
  RegistrationInput,
} from "@/types/auth";

export interface AuthService {
  signIn(credentials: Credentials): Promise<AuthSession>;
  register(input: RegistrationInput): Promise<AuthSession>;
  signOut(sessionId: string): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
}
