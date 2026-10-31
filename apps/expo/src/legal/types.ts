/**
 * Shape of the bundled legal documents in `documents.ts`, mirrored from
 * airmeishi-web `src/content/legal/index.ts` (the one source for both).
 */
export type LegalLocale = 'en' | 'zh-Hant';
export type LegalDocumentId = 'privacy' | 'terms';

/** A paragraph, a subheading inside a section, or a bulleted list. */
export type LegalBlock = string | { readonly heading: string } | { readonly list: readonly string[] };

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

/** A group of numbered sections; numbering runs on across parts. */
export interface LegalPart {
  readonly title: string;
  readonly sections: readonly LegalSection[];
}

export interface LegalDocument {
  readonly intro: string;
  /** Summary shown before the full text; the numbered sections govern. */
  readonly highlights: readonly string[];
  readonly parts: readonly LegalPart[];
}

export type LegalDocuments = Readonly<Record<LegalLocale, Readonly<Record<LegalDocumentId, LegalDocument>>>>;
