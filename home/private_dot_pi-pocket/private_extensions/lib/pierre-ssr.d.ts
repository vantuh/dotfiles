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

/** HTML for one file's patch, with its own styles, for a shadow root. It throws when the patch is not one file's. */
export function preloadPatchDiff(options: {
    patch: string;
    options?: DiffOptions;
}): Promise<{ prerenderedHTML: string }>;
