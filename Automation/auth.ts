import { expect, type APIRequestContext, type Page } from "@playwright/test";

type LoginCredentials = {
  email: string;
  password: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
    role?: string;
    avatar?: string | null;
  };
};

const USER_1: LoginCredentials = {
  email: "user1@example.com",
  password: "pass123",
};

const ADMIN: LoginCredentials = {
  email: "admin@example.com",
  password: "admin123",
};

export async function loginAs(
  page: Page,
  request: APIRequestContext,
  creds: LoginCredentials
): Promise<void> {
  const res = await request.post("http://127.0.0.1:4000/api/login", {
    data: creds,
  });

  const responseText = await res.text();
  expect(res.ok(), `Login API failed: ${res.status()} ${responseText}`).toBeTruthy();

  const data = JSON.parse(responseText) as LoginResponse;

  expect(data.token).toBeTruthy();
  expect(data.user).toBeTruthy();
  expect(data.user.email).toBe(creds.email);

  await page.addInitScript((payload: LoginResponse) => {
    window.localStorage.setItem("authToken", payload.token);
    window.localStorage.setItem("authUser", JSON.stringify(payload.user));
  }, data);

  await page.goto("/home");
}

export async function loginAsUser1(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  await loginAs(page, request, USER_1);
}

export async function loginAsAdmin(
  page: Page,
  request: APIRequestContext
): Promise<void> {
  await loginAs(page, request, ADMIN);
}