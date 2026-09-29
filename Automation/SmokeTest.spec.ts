import { expect, test } from "@playwright/test";
import { loginAsUser1 } from "./auth";



test("Auth-Login smokeTest", async ({ page, request }) => {
    await loginAsUser1(page, request);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("main")).toBeVisible();
});
