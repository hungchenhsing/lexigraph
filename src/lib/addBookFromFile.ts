/**
 * Add a dropped / picked PDF file to the library.
 *
 * Stores the blob in IndexedDB, writes a Book record via Repo, and returns
 * the Book so the caller can immediately open it.
 */
import { getRepo } from "../data/repo";
import { putBlob, uuid } from "./blobStore";
import type { Book } from "../data/types";

export async function addBookFromFile(file: File): Promise<Book> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`Not a PDF: ${file.name}`);
  }

  const id = uuid();
  const fileRef = `pdf:${id}`;
  await putBlob(fileRef, file);

  // Strip ".pdf" and underscores for a readable default title.
  const title = file.name.replace(/\.pdf$/i, "").replace(/[_\-]+/g, " ").trim();

  const book: Book = {
    id,
    title: title || "Untitled PDF",
    addedAt: Date.now(),
    source: "pdf",
    fileRef,
    currentPage: 1,
    totalTokens: 0,
  };

  await getRepo().addBook(book);
  return book;
}
