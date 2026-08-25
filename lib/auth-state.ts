export type AuthMode = "login" | "signup";

export type AuthField =
  | "name"
  | "gender"
  | "email"
  | "password"
  | "passwordConfirmation"
  | "currentPassword";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  retryAfter?: number;
};

export const initialAuthState: AuthActionState = { status: "idle", message: "" };
