/**
 * 把字串中的 `\n`（literal 兩字元）或真實換行切成多行顯示。
 * ECDICT translation/definition 常包 `\nn.` `\nv.` `\nadv.` 等 POS 分段。
 *
 * 用法：
 *   <MultilineText text={dict.translation} className="text-sm" />
 */
import type { ReactNode } from "react";

interface Props {
  text: string;
  className?: string;
  asList?: boolean;  // if true, render as <ul> list (default: stacked <div>)
}

export function MultilineText({ text, className, asList = false }: Props): ReactNode {
  const lines = splitLines(text);
  if (lines.length <= 1) {
    return <div className={className}>{text}</div>;
  }
  if (asList) {
    return (
      <ul className={className ? className + " list-disc list-inside" : "list-disc list-inside"}>
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    );
  }
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <div key={i} className={i > 0 ? "mt-0.5" : ""}>{line}</div>
      ))}
    </div>
  );
}

/** Split on both literal backslash-n and real newline. */
export function splitLines(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\\n|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
