import { apiFetch } from "./client";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthActionResponse {
  ok: true;
}

export function login(request: LoginRequest): Promise<AuthActionResponse> {
  return apiFetch<AuthActionResponse>("/api/auth/login", {
    method: "POST",
    body: {
      username: request.username,
      password: request.password
    }
  });
}

export function logout(): Promise<AuthActionResponse> {
  return apiFetch<AuthActionResponse>("/api/auth/logout", {
    method: "POST"
  });
}
