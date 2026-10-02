import { test, expect } from "@playwright/test";
import { loginAsUser1 } from "./auth";
import { Buffer } from "buffer";
import fs from "node:fs";

const fixtures = {
  png: "Automation/fixtures/AvatarTest.png",
  gif: "Automation/fixtures/AvatarTest.gif",
};

const imageBuffer = fs.readFileSync(fixtures.png);
const expectedSrc = `data:image/png;base64,${imageBuffer.toString("base64")}`;

test.beforeEach(async ({ page, request }) => {
    await loginAsUser1(page, request);
    await page.goto("/profile");
});

test ("Extensive user page contents check", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Open Inventory' })).toBeVisible();
    await expect(page.getByText('Currency$')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await expect(page.getByText('Reputation')).toBeVisible();
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Replies', { exact: true })).toBeVisible();
    await expect(page.getByText('Favorites')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Account Management' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Favorite Lootboxes' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Forum Activity' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Posts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Replies' })).toBeVisible();

});

// ------------------------------------------

test ("Change Avatar - modal opens and present", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upload File' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Or Use Link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Avatar' })).toBeVisible();

});

test ("change avatar modal - upload png", async ({ page }) => {
    const avatar = page.getByRole("img", { name: "User avatar" });
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fixtures.png);
    await expect(page.getByRole('button', { name: 'Save Avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Save Avatar' }).click();

    await page.getByRole('button', { name: 'Close' }).click();
    const imageBuffer = fs.readFileSync(fixtures.png);
    const expectedSrc = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    await expect(avatar).toHaveAttribute("src", expectedSrc);
});


test ("change avatar modal - upload gif", async ({ page }) => {
    const avatar = page.getByRole("img", { name: "User avatar" });
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fixtures.gif);
    await expect(page.getByRole('button', { name: 'Save Avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Save Avatar' }).click();

    const imageBuffer = fs.readFileSync(fixtures.gif);
    const expectedSrc = `data:image/gif;base64,${imageBuffer.toString("base64")}`;

    await expect(avatar).toHaveAttribute("src", expectedSrc);

});

test("change avatar modal - rejects images larger than 5 MB", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles({
        name: "oversized-avatar.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(6 * 1028 * 1028),
    });

    const notification = page.locator(".app-notification-error");

    await expect(notification.getByText("File size exceeds 5MB.", { exact: true })).toBeVisible();
});

test("change avatar modal - rejects non-image files", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();
    
    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles({
        name: "not-an-image.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("This is not an image file."),
    });

    const notification = page.locator(".app-notification-error");

    await expect(notification.getByText("Unsupported file type. Allowed: PNG, JPEG, WEBM, GIF, WEBP.", { exact: true })).toBeVisible();

});

test("Change avatar modal - closes with close button & esc key", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).not.toBeVisible();

});

test("Change avatar modal - Avatar changes using url", async ({ page }) => {
    const avatar = page.getByRole("img", { name: "User avatar" });

    await expect(page.getByRole('button', { name: 'Change avatar' })).toBeVisible();
    await page.getByRole('button', { name: 'Change avatar' }).click();
    await expect(page.getByRole('heading', { name: 'Change Avatar' })).toBeVisible();

    const imageUrl = "https://i.imgur.com/3JjVyds.jpeg";

    await page.getByPlaceholder("https://example.com/avatar.png").fill(imageUrl);
    await page.getByRole('button', { name: 'Save Avatar' }).click();

    await expect(avatar).toHaveAttribute("src", imageUrl);

});
//------------------------------------------

test("Account management modal - opens and present", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Account Management' })).toBeVisible();
    await page.getByRole('button', { name: 'Account Management' }).click();
    await expect(page.getByRole('heading', { name: 'Account Management' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Username' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Username' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Email' })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Password' })).toBeVisible();

});

test("Account management modal - Username change", async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Account Management' })).toBeVisible();
    await page.getByRole('button', { name: 'Account Management' }).click();
    await expect(page.getByRole('heading', { name: 'Account Management' })).toBeVisible();

    const profileUsername = page.locator(".profile-identity-main h3");
    const headerUsername = page.locator(".user-chip > span");
    const originalUsername = await profileUsername.innerText();

    await page.getByRole('textbox', { name: 'Username' }).fill("NewUsername");
    await page.getByRole('button', { name: 'Update Username' }).click();

    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue("NewUsername");
    await page.getByRole('button', { name: 'Close' }).click();


    await expect(profileUsername).toHaveText("NewUsername");
    await expect(headerUsername).toHaveText("NewUsername");

    await page.reload();

    await expect(profileUsername).toHaveText("NewUsername");
    await expect(headerUsername).toHaveText("NewUsername");


    await page.getByRole('button', { name: 'Account Management' }).click();
    await expect(page.getByRole('heading', { name: 'Account Management' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Username' }).fill(originalUsername);
    await page.getByRole('button', { name: 'Update Username' }).click();
    await expect(profileUsername).toHaveText(originalUsername);
    await expect(headerUsername).toHaveText(originalUsername);

    await page.getByRole('button', { name: 'Close' }).click();

});