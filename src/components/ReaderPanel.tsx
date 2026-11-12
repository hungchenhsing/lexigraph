import type { Book, PageToken } from "../data/types";
import { PdfDropZone } from "./PdfDropZone";
import { PdfViewer } from "./PdfViewer";

interface Props {
  book: Book | undefined;
  llmEnabled: boolean;
  jumpToPage?: number | undefined;
  jumpTick?: number | undefined;
  onJumpConsumed?: (() => void) | undefined;
  onTokenSelect: (
    tokenNormalized: string | undefined,
    token?: PageToken,
    sentence?: string,
  ) => void;
  onBookAdded: (book: Book) => void;
  onOpenSettings?: (() => void) | undefined;
}

export function ReaderPanel({
  book, llmEnabled, jumpToPage, jumpTick, onJumpConsumed, onTokenSelect, onBookAdded, onOpenSettings,
}: Props) {
  if (!book) {
    return <PdfDropZone onBookAdded={onBookAdded} variant="full" />;
  }
  return (
    <PdfViewer
      book={book}
      llmEnabled={llmEnabled}
      jumpToPage={jumpToPage}
      jumpTick={jumpTick}
      onJumpConsumed={onJumpConsumed}
      onTokenSelect={onTokenSelect}
      onOpenSettings={onOpenSettings}
    />
  );
}
