import type { DictEntry } from "../data/types";
import { academicInfoFor, formatAcademicLabel } from "../lib/dict/academic";

export function AcademicLabel({
  surface, dict, small = false,
}: {
  surface: string;
  dict?: DictEntry | undefined;
  small?: boolean;
}) {
  const label = formatAcademicLabel(academicInfoFor(surface, dict));
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ring-1 ring-inset ring-indigo-200 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-800 ${
        small ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
      }`}
      title="Academic word list / CEFR, from the bundled dictionary"
    >
      {label}
    </span>
  );
}
