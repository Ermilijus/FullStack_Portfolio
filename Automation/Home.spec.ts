import { test, expect } from "@playwright/test";
import { loginAsUser1 } from "./auth";

test.beforeEach(async ({ page, request }) => {
    await loginAsUser1(page, request);
    await page.goto("/home");
});

test("Homepage Displaying Correctly", async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible();
    
    const bannerCarousel = page.locator(".banner-carousel");

    await expect(bannerCarousel).toBeVisible();
    await expect(bannerCarousel.getByRole('button', { name: 'Next banner' })).toBeVisible();
    await expect(bannerCarousel.getByRole('button', { name: 'Previous banner' })).toBeVisible();
    
    const trendingSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Trending Discussions" }) });
    const trendingList = trendingSection.locator(".trending-list");
    const trendingRows = trendingList.locator(".trending-row");

    await expect(trendingList).toBeVisible();
    await expect(await trendingRows.count()).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: 'Recent Legendary Drops' })).toBeVisible();

});

test("Homepage Banner modal - Functionality", async ({ page }) => {
    const bannerCarousel = page.locator(".banner-carousel");
    const bannerSlide = bannerCarousel.locator(".banner-slide").first();
    const bannerText = await bannerSlide.locator(".banner-text").textContent();
    const nextButton = bannerCarousel.getByRole('button', { name: 'Next banner' });
    const previousButton = bannerCarousel.getByRole('button', { name: 'Previous banner' });
    const bannerDots = bannerCarousel.locator(".banner-dots");

    await expect(bannerCarousel).toBeVisible();
    await expect(bannerSlide).toBeVisible();
    await expect(bannerText).not.toBeNull();
    await expect(nextButton).toBeVisible();
    await expect(previousButton).toBeVisible();
    await expect(bannerDots).toBeVisible();

    const bannerNavigation = bannerCarousel.getByRole("tablist", {
    name: "Banner navigation",
    });

    const bannerTabs = bannerNavigation.getByRole("tab");

    await expect(bannerTabs).toHaveCount(4);

    const selectedBefore = bannerNavigation.getByRole("tab", {
    selected: true,
    });

    const currentBanner = await selectedBefore.getAttribute("aria-label");

    await nextButton.click();

    const selectedAfter = bannerNavigation.getByRole("tab", {
    selected: true,
    });

    await expect(selectedAfter).not.toHaveAttribute(
    "aria-label",
    currentBanner!
    );
    
    await previousButton.click();

    await expect(
    bannerNavigation.getByRole("tab", { selected: true })
    ).toHaveAttribute("aria-label", currentBanner!);

});

test("Homepage Banner modal - Functionality - Clicking on banner", async ({ page }) => {
    const bannerCarousel = page.locator(".banner-carousel");
    const bannerSlide = bannerCarousel.locator(".banner-slide").first();

    await expect(bannerCarousel).toBeVisible();
    await page.locator(".banner-slide").first().click();
    await expect(page).not.toHaveURL("/home");
    
    await page.goBack();
    await expect(page).toHaveURL("/home");
    
    const nextButton = bannerCarousel.getByRole('button', { name: 'Next banner' });
    await nextButton.click();
    await page.locator(".banner-slide").click();
    await expect(page).not.toHaveURL("/home");

    await page.goBack();
    await expect(page).toHaveURL("/home");

});

test("Homepage Trending Discussions - Functionality", async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Trending Discussions' })).toBeVisible();
    await page.locator("section").filter({ has: page.getByRole("heading", { name: "Trending Discussions" }) }).locator(".trending-list .trending-row").first().click();
    await expect(page).not.toHaveURL("/forum");

});