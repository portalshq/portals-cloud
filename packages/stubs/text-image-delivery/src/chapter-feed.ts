/**
 * Generalizes the 25thChapter content model (sequential chapters, each
 * with text + image refs) into a capability, so any channel — not just
 * 25thChapter itself — can compose a text/image narrative feed. This is
 * the formalization step described in the repo README: 25thChapter
 * already proves this works in production, this package is what makes it
 * reusable by a third-party developer's channel.
 */
export interface Chapter {
  chapterId: string;
  order: number;
  title: string;
  text: string;
  imageRefs: string[]; // NAP addresses or object-storage refs
}

export class ChapterFeed {
  async getChapter(narrativeRef: string, chapterId: string): Promise<Chapter> {
    throw new Error("ChapterFeed.getChapter: not yet wired to narrative-engine-adapter");
  }
  async listChapters(narrativeRef: string): Promise<Chapter[]> {
    throw new Error("ChapterFeed.listChapters: not yet wired to narrative-engine-adapter");
  }
}
