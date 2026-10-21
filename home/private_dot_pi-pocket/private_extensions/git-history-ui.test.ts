// The Git history page in a real Chromium: its top bar button, the commits it lists, and a commit opening into its diff.
// Run it with `node --test git-history-ui.test.ts` in the drop-in folder.
import {
    cleanUp,
    newSession,
    openApp,
    owner,
    root,
    scriptedModel,
    until,
} from "/Users/vantuh/projects/opensource-test/pi-pocket/test/helpers.ts";
import { Browsers } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/browser.ts";
import { findBrowser } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/browser/discovery.ts";
import type { BrowserPage } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/browser/page.ts";
import { createHandler } from "/Users/vantuh/projects/opensource-test/pi-pocket/src/server/http.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";

const chromium = findBrowser();
const real = {
    skip: chromium === undefined ? "no Chromium-based browser on this machine" : false,
} as const;
const DESKTOP = { width: 1440, height: 900, scale: 1, mobile: false };

const dataDir = join(root, "data");
const dropIns = join(dataDir, "extensions");
const project = join(root, "project");

let app: Awaited<ReturnType<typeof openApp>>;
let server: Server;
let browsers: Browsers;
let page: BrowserPage;
let base = "";
let session: number;

async function inPage<T>(script: string): Promise<T> {
    return JSON.parse(await page.evaluate(script)) as T;
}

const has = (selector: string) =>
    inPage<boolean>(
        `return JSON.stringify(document.querySelector(${JSON.stringify(selector)}) !== null)`,
    );

const text = (selector: string) =>
    inPage<string>(
        `return JSON.stringify(document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? "")`,
    );

before(async () => {
    mkdirSync(dropIns, { recursive: true });
    // As in the data folder: the module is a link to where it lives, and its browser module is beside it. The diff
    // renderer is not copied: the module finds it beside its real file.
    symlinkSync(join(import.meta.dirname, "git-history.ts"), join(dropIns, "git-history.ts"));
    cpSync(join(import.meta.dirname, "history-ui"), join(dropIns, "history-ui"), {
        recursive: true,
    });

    const identity = {
        GIT_AUTHOR_NAME: "Tess",
        GIT_AUTHOR_EMAIL: "tess@example.com",
        GIT_COMMITTER_NAME: "Tess",
        GIT_COMMITTER_EMAIL: "tess@example.com",
    };
    const git = (...args: string[]) =>
        execFileSync("git", args, {
            cwd: project,
            stdio: "pipe",
            env: { ...process.env, ...identity },
        });

    mkdirSync(project, { recursive: true });
    git("init", "-q", "-b", "main");
    const lines = (tag: string) =>
        `${Array.from({ length: 150 }, (_, index) => `${tag} line ${index + 1}`).join("\n")}\n`;

    writeFileSync(join(project, "a.txt"), lines("one"));
    git("add", ".");
    git("commit", "-q", "-m", "first commit");
    writeFileSync(join(project, "a.txt"), lines("two"));
    git("commit", "-q", "-am", "second commit");
    // A remote with the two commits, and a third one that is not pushed yet: the header says ↑1.
    execFileSync("git", ["init", "--bare", "-q", join(root, "origin.git")], { stdio: "pipe" });
    git("remote", "add", "origin", join(root, "origin.git"));
    git("push", "-q", "-u", "origin", "main");
    writeFileSync(join(project, "a.txt"), lines("three"));
    git("commit", "-q", "-am", "third commit");

    app = await openApp(scriptedModel(), dataDir);
    server = createServer(
        createHandler({ app, listen: { host: "127.0.0.1", port: 0 }, restart: () => {} }),
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await app.setExtensionEnabled(owner(app), "git-history.ts", true);
    session = await newSession(app, project);

    browsers = new Browsers({
        dataDir: mkdtempSync(join(root, "git-history-ui-")),
        load: async () => undefined,
        save: () => {},
    });
    page = await browsers.open(1);
    await page.setViewport(DESKTOP);
    await page.navigate(`${base}/login?token=${encodeURIComponent(app.config.ownerToken)}`);
});

after(async () => {
    await browsers?.closeAll({ final: true });
    server?.closeAllConnections();
    server?.close();
    await app?.close();
    cleanUp();
});

test(
    "the top bar button opens the page, which lists the commits and opens one into its diff",
    real,
    async () => {
        await page.navigate(`${base}/s/${session}`);

        const button = '.ext-top-button[title="Git history"]';

        await until(() => has(button), "the history button");
        await page.click({ selector: button });

        await until(async () => (await has(".gh-chip")) && (await has(".gh-row")), "the commits");
        // The page fades in: a click while it does is let go (back.js), as the app's own UI tests wait it out.
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.match(await text(".gh-chip"), /main/);
        assert.equal(await text(".gh-subject"), "third commit");
        assert.equal(await text(".gh-track"), "↑1");
        assert.equal(
            await inPage<number>(
                `return JSON.stringify(document.querySelectorAll(".gh-row").length)`,
            ),
            3,
        );

        await page.click({ selector: ".gh-row" });

        await until(() => has(".gh-file .gh-diff-view"), "the diff");
        assert.equal(await text(".gh-path"), "a.txt");
        // The diff is in a shadow root, where the app's own query cannot reach it.
        await until(
            async () =>
                await inPage<boolean>(
                    `return JSON.stringify([...document.querySelectorAll(".gh-diff-view")].some((each) => (each.shadowRoot?.textContent ?? "").includes("three line 1")))`,
                ),
            "the added line",
        );

        // The row glides to the top when the commit opens: a click waits for the view to stop moving.
        let was = -1;

        await until(async () => {
            const now = await inPage<number>(
                `return JSON.stringify(document.querySelector(".ext-page-body").scrollTop)`,
            );
            const still = now === was;

            was = now;

            return still;
        }, "the view to stop moving");

        // The file's header folds its diff away, and opens it again.
        await page.click({ selector: ".gh-file-head" });
        await until(
            () =>
                inPage<boolean>(
                    `return JSON.stringify(document.querySelector(".gh-file-head").getAttribute("aria-expanded") === "false")`,
                ),
            "the file to fold",
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        assert.ok(
            (await inPage<number>(
                `return JSON.stringify(document.querySelector(".gh-fold").getBoundingClientRect().height)`,
            )) < 1,
            "a folded diff takes no height",
        );

        await page.click({ selector: ".gh-file-head" });
        await until(
            async () =>
                (await inPage<number>(
                    `return JSON.stringify(document.querySelector(".gh-fold").getBoundingClientRect().height)`,
                )) > 10,
            "the diff to open again",
        );

        // A commit opened while the page is scrolled far down starts at the top of the view, not in the middle of
        // its own diff: the commit above it closes, and the row takes the place its changes start from.
        await page.evaluate(`document.querySelector(".ext-page-body").scrollTop = 2500; return "ok";`);
        await new Promise((resolve) => setTimeout(resolve, 200));

        await page.click({ selector: ".gh-item:nth-child(2) .gh-row" });
        await until(
            () =>
                inPage<boolean>(
                    `return JSON.stringify(document.querySelectorAll('.gh-row[aria-expanded="true"]').length === 1 && document.querySelector(".gh-item:nth-child(2) .gh-row").getAttribute("aria-expanded") === "true")`,
                ),
            "the other commit to open",
        );

        // The row glides there, so the check waits for it to settle.
        const offset = () =>
            inPage<number>(`
                const body = document.querySelector(".ext-page-body");
                const row = document.querySelector(".gh-item:nth-child(2) .gh-row");
                return JSON.stringify(
                    Math.round(row.getBoundingClientRect().top - body.getBoundingClientRect().top),
                );
            `);

        await until(async () => (await offset()) < 12, "the opened row to reach the top of the view");
    },
);
