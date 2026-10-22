// The part of `@pierre/diffs/ssr` that the Git history module uses. The code is in `pierre-ssr.js`, a bundle of
// @pierre/diffs 1.3.6 built for Node with `bun build --target=node --format=esm --minify`.

export type DiffOptions = {
    themeType?: "system" | "light" | "dark";
    diffStyle?: "unified" | "split";
    overflow?: "scroll" | "wrap";
    hunkSeparators?: "simple" | "metadata" | "line-info" | "line-info-basic";
    disableFileHeader?: boolean;
    disableLineNumbers?: boolean;
};

/**
 * An empty block under one line of a diff. The HTML it renders holds a slot named `annotation-<side>-<line>`, which the
 * page fills from the light DOM, so the diff's own grid makes room for it.
 */
export type Annotation = {
    lineNumber: number;
    side: "additions" | "deletions";
    metadata?: unknown;
};

/** HTML for one file's patch, with its own styles, for a shadow root. It throws when the patch is not one file's. */
export function preloadPatchDiff(options: {
    patch: string;
    options?: DiffOptions;
    annotations?: Annotation[];
}): Promise<{ prerenderedHTML: string }>;
