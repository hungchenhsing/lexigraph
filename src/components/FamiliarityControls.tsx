import type { FamiliarityLevel } from "../data/types";
import { IGNORED_LEVEL, isLearningLevel, KNOWN_LEVEL, LEARNING_LEVEL } from "../data/familiarity";

interface Props {
  level: FamiliarityLevel | undefined;
  onChange: (level: FamiliarityLevel) => void;
}

/**
 * Two familiarity actions, plus ignore.
 * 不認識 stores the single learning status (legacy 1–4 count as the same).
 * 認識 and 忽略 are not colored on the page.
 */
export function FamiliarityControls({ level, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Choice
        label="不認識"
        hint="U"
        title="學習中"
        active={isLearningLevel(level)}
        activeClass="bg-pink-600 text-white border-pink-600"
        onClick={() => onChange(LEARNING_LEVEL)}
      />
      <Choice
        label="認識"
        hint="K"
        active={level === KNOWN_LEVEL}
        activeClass="bg-emerald-600 text-white border-emerald-600"
        onClick={() => onChange(KNOWN_LEVEL)}
      />
      <Choice
        label="忽略"
        active={level === IGNORED_LEVEL}
        activeClass="bg-slate-500 text-white border-slate-500"
        onClick={() => onChange(IGNORED_LEVEL)}
      />
    </div>
  );
}

function Choice({
  label, hint, title, active, activeClass, onClick,
}: {
  label: string;
  hint?: string;
  title?: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex-1 min-w-[5.5rem] py-1.5 text-xs rounded border transition-colors ${
        active
          ? `${activeClass} font-semibold`
          : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
      }`}
    >
      {label}
      {hint && <span className="ml-1 text-[10px] opacity-60">{hint}</span>}
    </button>
  );
}
