import type { ScanFilters } from "./types";
import { VerificationError } from "./verification";

function parseParts(value: string): { year: number; monthIndex: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new VerificationError("Choose complete local calendar dates.");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) {
    throw new VerificationError("Choose valid local calendar dates.");
  }
  return { year, monthIndex, day };
}

export function buildScanFilters(
  mode: "all" | "custom",
  keepPinned: boolean,
  startDate: string,
  endDate: string,
): ScanFilters {
  if (mode === "all") return { mode, keepPinned };
  const start = parseParts(startDate);
  const end = parseParts(endDate);
  const startSec = new Date(start.year, start.monthIndex, start.day).getTime() / 1000;
  const endExclusiveSec = new Date(end.year, end.monthIndex, end.day + 1).getTime() / 1000;
  if (startSec >= endExclusiveSec) {
    throw new VerificationError("The start date must be on or before the end date.");
  }
  return { mode, keepPinned, startSec, endExclusiveSec };
}
