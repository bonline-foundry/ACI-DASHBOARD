import { ValidationError } from "./errors";

export type ActionState = { error: string | null; ok?: boolean };

export function toActionError(e: unknown): ActionState {
  if (e instanceof ValidationError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}
