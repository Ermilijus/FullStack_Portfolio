import { expect, test, type Page, type Response } from "@playwright/test";

const waitForLoginPost = (page: Page): Promise<Response> =>
  page.waitForResponse((res: Response) => {
    const url = new URL(res.url());
    return url.pathname === "/api/login" && res.request().method() === "POST";
  });

const fillLoginForm = async (page: Page, email: string, password: string): Promise<void> => {
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
};

const submitLoginAndGetResponse = async (page: Page): Promise<Response> => {
  const responsePromise = waitForLoginPost(page);
  await page.getByRole("button", { name: "Login" }).click();
  return responsePromise;
};

const expectLoginError = async (response: Response, status = 401, message = "Invalid email or password") => {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body).toHaveProperty("error", message);
};

// ------------------------------------------

test("Login positive - User", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "user1@example.com", "pass123");
    await submitLoginAndGetResponse(page);
    await expect(page).toHaveURL("/home");
    await expect(page.getByRole('link', { name: 'Admin' })).not.toBeVisible();
    await expect(page.getByText('The Hub')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

// ------------------------------------------

test("Login positive - Admin", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "admin@example.com", "admin123");
    await submitLoginAndGetResponse(page);
    await expect(page).toHaveURL("/home");
    await expect(page.getByText('The Hub')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});

// ------------------------------------------

test("Login negative - missing email uses native validation", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByPlaceholder("Email");
  await page.getByPlaceholder("Password").fill("pass123");

  const noLoginPost = page
    .waitForResponse((res) => new URL(res.url()).pathname === "/api/login", { timeout: 800 })
    .then(() => false)
    .catch(() => true);

  await page.getByRole("button", { name: "Login" }).click();

  expect(await noLoginPost).toBe(true);

  const validity = await email.evaluate((el: HTMLInputElement) => ({
    valueMissing: el.validity.valueMissing,
    hasMessage: el.validationMessage.length > 0,
  }));

  expect(validity.valueMissing).toBe(true);
  expect(validity.hasMessage).toBe(true);
});

// ------------------------------------------

test("Login negative - invalid email format uses native validation", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByPlaceholder("Email");
  await email.fill("emailnoat.com");
  await page.getByPlaceholder("Password").fill("pass123");

  const noLoginPost = page
    .waitForResponse((res) => new URL(res.url()).pathname === "/api/login", { timeout: 800 })
    .then(() => false)
    .catch(() => true);

  await page.getByRole("button", { name: "Login" }).click();

  expect(await noLoginPost).toBe(true);

  const validity = await email.evaluate((el: HTMLInputElement) => ({
    typeMismatch: el.validity.typeMismatch,
    hasMessage: el.validationMessage.length > 0,
  }));

  expect(validity.typeMismatch).toBe(true);
  expect(validity.hasMessage).toBe(true);
});

// ------------------------------------------

test("Login negative - Wrong email", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "invalid@example.com", "pass123");
    await expectLoginError(await submitLoginAndGetResponse(page), 401, "Invalid email or password");
    await expect(page).toHaveURL("/login");
});

// ------------------------------------------

test("Login negative - wrong password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "user1@example.com", "wrongpassword");
    await expectLoginError(await submitLoginAndGetResponse(page), 401, "Invalid email or password");
    await expect(page).toHaveURL("/login");
});

// ------------------------------------------

test("Login negative - wrong email and password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "invalid@example.com", "wrongpassword");
    await expectLoginError(await submitLoginAndGetResponse(page), 401, "Invalid email or password");
    await expect(page).toHaveURL("/login");
});

test("Login - Logout test", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".login-container")).toBeVisible();
    await fillLoginForm(page, "user1@example.com", "pass123");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL("/home");
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL("/login");
});