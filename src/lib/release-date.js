const RELEASE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidAlbumReleaseDate = (value) => {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  const match = RELEASE_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const formatAlbumReleaseDate = (value, locale) => {
  if (!isValidAlbumReleaseDate(value) || !value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
};

const localIsoDate = (date) => {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const albumReleaseDateStatus = (value, today = new Date(), locale) => {
  if (!value) return { kind: "unset", message: "No release date set. This does not affect release readiness." };
  const formattedDate = formatAlbumReleaseDate(value, locale);
  if (!formattedDate) return { kind: "invalid", message: "Choose a valid release date." };
  return value > localIsoDate(today)
    ? { kind: "planned", message: `Planned for ${formattedDate}.` }
    : { kind: "released", message: `Released on ${formattedDate}.` };
};
