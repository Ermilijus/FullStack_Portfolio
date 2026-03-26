export const DEFAULT_USER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%232b3445'/%3E%3Cstop offset='100%25' stop-color='%231b2230'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='48' cy='48' r='47' fill='url(%23g)'/%3E%3Ccircle cx='48' cy='37' r='16' fill='%239aa7bb'/%3E%3Cpath d='M20 77c4-13 15-21 28-21s24 8 28 21' fill='%239aa7bb'/%3E%3C/svg%3E";

export const resolveAvatarUrl = (avatar: string | null | undefined) => {
  const trimmed = avatar?.trim();
  return trimmed ? trimmed : DEFAULT_USER_AVATAR;
};