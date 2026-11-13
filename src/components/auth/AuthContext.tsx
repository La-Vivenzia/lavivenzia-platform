"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the visitor is signed in, for client components deep in the tree.
 *
 * Resolved once on the server (`getPrincipal`) by the shell that mounts the
 * provider, so nothing flashes a signed-out state at someone who is signed in.
 * This decides only what a control *offers* — "Save" versus "Sign in to save".
 * Every gated action is enforced again by the API it calls.
 */
export interface AuthState {
  readonly signedIn: boolean;
  readonly accountHref: string;
  readonly initials?: string;
}

const ANONYMOUS: AuthState = { signedIn: false, accountHref: "/sign-in" };

const AuthContext = createContext<AuthState>(ANONYMOUS);

export function AuthProvider({
  value,
  children,
}: {
  readonly value: AuthState;
  readonly children: ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The visitor's session as the shell resolved it; anonymous outside a provider. */
export function useAuth(): AuthState {
  return useContext(AuthContext);
}
