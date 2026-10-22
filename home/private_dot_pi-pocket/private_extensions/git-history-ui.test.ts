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
const plain = join(root, "plain");

let app: Awaited<ReturnType<typeof openApp>>;
let server: Server;
let browsers: Browsers;
let page: BrowserPage;
let base = "";
let session: number;
let plainSession: number;

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
    mkdirSync(plain, { recursive: true });
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
    plainSession = await newSession(app, plain);

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
        // The commit that waits to be pushed has the small dot; the pushed ones have none.
        assert.equal(
            await inPage<number>(
                `return JSON.stringify(document.querySelectorAll(".gh-dot").length)`,
            ),
            1,
        );
        assert.equal(
            await inPage<number>(
                `return JSON.stringify(document.querySelectorAll(".gh-dot-local").length)`,
            ),
            1,
        );
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

        // The header has no buttons while the page covers the conversation: back to the session first.
        await page.press("Escape");
        await until(async () => !(await has(".ext-page")), "the page to close");
        await new Promise((resolve) => setTimeout(resolve, 500));

        // The header's count of unpushed commits: a tap on it pushes them.
        await until(
            async () =>
                (await inPage<string>(
                    `return JSON.stringify([...document.querySelectorAll(".ext-top-button .badge")].map((each) => each.textContent).join("|"))`,
                )) === "↑1",
            "the count of unpushed commits",
        );

        // Another session, in a folder that is no repository: its own answer, and no count.
        const counts = () =>
            inPage<string>(
                `return JSON.stringify([...document.querySelectorAll(".ext-top-button .badge")].map((each) => each.textContent).join("|"))`,
            );

        const open = (id: number) =>
            page.evaluate(`
                const row = document.querySelector('.session-row[data-id="${id}"] button.session');
                if (row === null) return JSON.stringify("no row");
                row.click();
                return JSON.stringify("ok");
            `);
        const at = () => inPage<string>(`return JSON.stringify(location.pathname)`);

        await open(plainSession);
        await until(async () => (await at()) === `/s/${plainSession}`, "the other session to open");
        await until(async () => (await counts()) === "", "the count to follow the other session");

        await open(session);
        await until(async () => (await at()) === `/s/${session}`, "the first session to open again");
        await until(async () => (await counts()) === "↑1", "the count to come back");

        await page.evaluate(`
            const button = [...document.querySelectorAll(".ext-top-button")].find((each) =>
                (each.querySelector(".badge")?.textContent ?? "").startsWith("↑"),
            );
            button.click();
            return "ok";
        `);

        await until(
            async () =>
                (await inPage<number>(
                    `return JSON.stringify(document.querySelectorAll(".ext-top-button .badge").length)`,
                )) === 0,
            "the count to clear after the push",
        );

        const onRemote = execFileSync(
            "git",
            ["--git-dir", join(root, "origin.git"), "log", "--format=%s", "main"],
            { encoding: "utf8" },
        )
            .trim()
            .split("\n");

        assert.deepEqual(onRemote, ["third commit", "second commit", "first commit"]);
    },
);

test(
    "a comment on an uncommitted line shows in the diff, stays after a fresh load, and goes to Pi as a message",
    real,
    async () => {
        writeFileSync(
            join(project, "a.txt"),
            `${Array.from({ length: 150 }, (_, index) => `three line ${index + 1}`).join("\n")}\nextra line\n`,
        );

        await page.navigate(`${base}/s/${session}`);
        await until(() => has('.ext-top-button[title="Git history"]'), "the history button");
        await page.click({ selector: '.ext-top-button[title="Git history"]' });

        // The uncommitted work comes first, and opens like a commit.
        await until(() => has(".gh-dot-work"), "the row for the uncommitted work");
        assert.match(await text(".gh-item:first-child .gh-subject"), /Uncommitted changes/);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.click({ selector: ".gh-item:first-child .gh-row" });
        await until(() => has(".gh-file .gh-diff-view"), "the uncommitted diff");

        // A pointer that rests on a line's number shows a plus there, beside the number.
        const at = () =>
            inPage<{ x: number; y: number }>(`
                const gutter = document
                    .querySelector(".gh-diff-view")
                    .shadowRoot.querySelector('[data-column-number="151"]');

                gutter.scrollIntoView({ block: "center" });
                const rect = gutter.getBoundingClientRect();

                return JSON.stringify({
                    x: Math.round(rect.left + rect.width / 2),
                    y: Math.round(rect.top + rect.height / 2),
                });
            `);
        // The plus is a box with two bars in it, drawn in the CSS and not in the renderer's HTML.
        const plus = () =>
            inPage<{ bars: number; color: string; width: number; height: number }>(`
                const gutter = document
                    .querySelector(".gh-diff-view")
                    .shadowRoot.querySelector('[data-column-number="151"]');
                const style = getComputedStyle(gutter, "::after");

                return JSON.stringify({
                    bars: style.backgroundImage.split("linear-gradient").length - 1,
                    color: style.backgroundColor,
                    width: Math.round(parseFloat(style.width)),
                    height: Math.round(parseFloat(style.height)),
                });
            `);

        const point = await at();

        const numberOpacity = () =>
            inPage<string>(`
                const gutter = document
                    .querySelector(".gh-diff-view")
                    .shadowRoot.querySelector('[data-column-number="151"]');

                return JSON.stringify(
                    getComputedStyle(gutter.querySelector("[data-line-number-content]")).opacity,
                );
            `);

        await page.input([{ type: "mouse", x: point.x, y: point.y }]);
        await until(async () => (await plus()).bars === 2, "the plus on the line's number");
        // A chip, not a dot: taller than the line it belongs to, and with room in it.
        const chip = await plus();

        assert.ok(chip.width >= 16 && chip.height > chip.width, JSON.stringify(chip));
        assert.notEqual(chip.color, "rgba(0, 0, 0, 0)");
        // The plus stands beside the number: the number stays in sight.
        assert.equal(await numberOpacity(), "1");

        // A tap on the number of the line that was added: the box opens for that line.
        const added = () =>
            inPage<boolean>(`
                const view = document.querySelector(".gh-diff-view");
                const gutter = view.shadowRoot.querySelector('[data-column-number="151"]');
                if (gutter === null) return JSON.stringify(false);
                gutter.click();
                return JSON.stringify(true);
            `);

        await until(added, "the line number of the added line");
        await until(() => has(".gh-editor"), "the box for the comment");
        assert.match(await text(".gh-editor-where"), /a\.txt:151/);
        assert.equal(await text(".gh-quote"), "extra line");

        await page.type({ selector: ".gh-input" }, "Say why this line is here.");
        await page.click({ selector: ".gh-editor-actions .button" });
        await until(() => has(".gh-note"), "the comment in the diff");

        // The diff's own grid made room for it: the slot the renderer left is filled.
        const note = () =>
            inPage<{ text: string; filled: boolean; slot: string }>(`
                const node = document.querySelector(".gh-note");
                return JSON.stringify({
                    text: node.textContent.trim(),
                    filled: node.assignedSlot !== null,
                    slot: node.getAttribute("slot"),
                });
            `);

        await until(async () => (await note()).filled, "the comment to fill its slot");
        assert.match((await note()).text, /Say why this line is here\./);
        assert.equal((await note()).slot, "annotation-additions-151");
        assert.match(await text(".gh-review"), /1 comment/);

        // A tap on that line again opens its own comment, with its words in the box, instead of a second one.
        await until(added, "the same line again");
        await until(() => has(".gh-editor"), "the box again");
        assert.equal(
            await inPage<string>(`return JSON.stringify(document.querySelector(".gh-input").value)`),
            "Say why this line is here.",
        );
        await page.click({ selector: ".gh-editor-head .gh-note-act" });
        await until(async () => !(await has(".gh-editor")), "the box to close");

        // It is kept in this browser, so a fresh load of the app has it too.
        const kept = await inPage<string>(
            `return JSON.stringify(localStorage.getItem("x.git-history.review.${session}"))`,
        );
        assert.match(kept, /Say why this line is here\./);

        // A fresh load of the app, as a reload gives: the drafts come from this browser, not from the page's memory.
        await page.navigate(`${base}/s/${session}`);
        await until(() => has('.ext-top-button[title="Git history"]'), "the history button again");
        await page.click({ selector: '.ext-top-button[title="Git history"]' });
        await until(() => has(".gh-dot-work"), "the uncommitted row again");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await page.click({ selector: ".gh-item:first-child .gh-row" });
        await until(async () => (await note()).filled, "the comment after a fresh load");

        // Send: the review goes into the message box, the page makes room for it, and its drafts are gone.
        await page.click({ selector: ".gh-review .button" });
        await until(async () => !(await has(".ext-page")), "the page to close");
        await until(
            async () =>
                (
                    await inPage<string>(
                        `return JSON.stringify(document.querySelector(".composer-wrap textarea")?.value ?? "")`,
                    )
                ).includes("a.txt:151"),
            "the review in the message box",
        );

        const message = await inPage<string>(
            `return JSON.stringify(document.querySelector(".composer-wrap textarea").value)`,
        );

        assert.match(message, /Code review: please address these comments\./);
        assert.match(message, /## Uncommitted changes/);
        assert.match(message, /- `a\.txt:151` \(new\)/);
        assert.match(message, /Say why this line is here\./);
        assert.equal(
            await inPage<string>(
                `return JSON.stringify(localStorage.getItem("x.git-history.review.${session}"))`,
            ),
            "[]",
        );
    },
);
