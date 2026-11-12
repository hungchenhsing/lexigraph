/**
 * TopicTags — row of gray pills showing topic/domain tags for a word.
 * Source is either seed dict `tags` (offline) or LLM `topics` (online).
 */

const TOPIC_LABEL: Record<string, string> = {
  zk: "中考",
  gk: "高考",
  ky: "考研",
  gre: "GRE",
  ielts: "IELTS",
  gmat: "GMAT",
  awl: "學術詞彙",
  ngsl: "通用高頻",
  cet4: "CET-4",
  cet6: "CET-6",
  toefl: "TOEFL",
  transition: "轉折連接",
  "method-verb": "方法動詞",
  math: "數學",
  stats: "統計",
  statistics: "統計",
  ml: "機器學習",
  "machine-learning": "機器學習",
  ai: "AI",
  cs: "電腦科學",
  "computer-science": "電腦科學",
  biology: "生物",
  bio: "生物",
  chemistry: "化學",
  physics: "物理",
  linguistics: "語言學",
  economics: "經濟",
  "general-academic": "一般學術",
  general: "通用",
};

function labelFor(tag: string): string {
  return TOPIC_LABEL[tag.toLowerCase()] ?? tag;
}

export function TopicTags({ tags, small = false }: { tags: string[] | undefined; small?: boolean }) {
  if (!tags || tags.length === 0) return null;
  const sizeCls = small ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span
          key={t}
          title={t}
          className={`inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-inset ring-slate-200 ${sizeCls}`}
        >
          {labelFor(t)}
        </span>
      ))}
    </div>
  );
}
