import { assertEquals } from "./assert.js";

const src = Deno.readTextFileSync(new URL("../package/contents/code/rules.js", import.meta.url));
const R = new Function(src + "\nreturn { parseRules, matchRules, parseWorkspaceRules, workspaceGaps, plasmaRule, DEFAULT_RULES };")();

Deno.test("parses hyprland windowrule lines", () => {
    const { rules, errors } = R.parseRules(`
# comment
tile, class:^(steam)$, title:^Steam$
windowrule = float, class:^(steam)$
workspace 3 silent, class:^(discord)$
fullscreen, class:^(steam_app_.*)$
`);
    assertEquals(errors, []);
    assertEquals(rules.length, 4);
    assertEquals(R.matchRules(rules, { class: "steam", title: "Steam" }), { float: false });
    assertEquals(R.matchRules(rules, { class: "steam", title: "Friends List" }), { float: true });
    assertEquals(R.matchRules(rules, { class: "discord", title: "x" }), { workspace: { index: 3, silent: true } });
    assertEquals(R.matchRules(rules, { class: "steam_app_1234", title: "Game" }), { fullscreen: true });
});

Deno.test("reports bad lines without dropping good ones", () => {
    const { rules, errors } = R.parseRules("explode, class:x\nfloat, colour:red\nfloat, class:([\nfloat\npin, title:^PiP$");
    assertEquals(rules.length, 1);
    assertEquals(errors.length, 4);
});

Deno.test("default rules float plasma system windows", () => {
    const { rules, errors } = R.parseRules(R.DEFAULT_RULES.join("\n"));
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "org.kde.polkit-kde-authentication-agent-1", title: "" }).float, true);
    assertEquals(R.matchRules(rules, { class: "org.kde.krunner", title: "" }).float, true);
    assertEquals(R.matchRules(rules, { class: "org.kde.konsole", title: "" }).float, undefined);
});

Deno.test("focusonactivate takes an optional on/off", () => {
    const { rules, errors } = R.parseRules("focusonactivate off, class:^(discord)$\nfocusonactivate, class:^(spotify)$\nfocusonactivate 0, title:^Bell$");
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "discord", title: "" }), { focusonactivate: false });
    assertEquals(R.matchRules(rules, { class: "spotify", title: "" }), { focusonactivate: true });
    assertEquals(R.matchRules(rules, { class: "x", title: "Bell" }), { focusonactivate: false });
    assertEquals(R.matchRules(rules, { class: "x", title: "y" }), {});
});

Deno.test("geometry, monitor, opacity and noborder rules", () => {
    const { rules, errors } = R.parseRules([
        "float, class:^(pavucontrol)$",
        "size 800 600, class:^(pavucontrol)$",
        "center, class:^(pavucontrol)$",
        "move 10% 40, class:^(mpv)$",
        "size 50% 45%, class:^(mpv)$",
        "monitor DP-2, class:^(discord)$",
        "monitor 1, class:^(spotify)$",
        "opacity 0.9 0.7, class:^(Alacritty)$",
        "opacity 0.8 override, class:^(kitty)$",
        "noborder, class:^(steam)$",
    ].join("\n"));
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "pavucontrol", title: "" }), {
        float: true, size: { width: { value: 800, percent: false }, height: { value: 600, percent: false } }, center: true,
    });
    assertEquals(R.matchRules(rules, { class: "mpv", title: "" }), {
        move: { x: { value: 10, percent: true }, y: { value: 40, percent: false } },
        size: { width: { value: 50, percent: true }, height: { value: 45, percent: true } },
    });
    assertEquals(R.matchRules(rules, { class: "discord", title: "" }).monitor, "DP-2");
    assertEquals(R.matchRules(rules, { class: "spotify", title: "" }).monitor, "1");
    assertEquals(R.matchRules(rules, { class: "Alacritty", title: "" }).opacity, { active: 0.9, inactive: 0.7 });
    assertEquals(R.matchRules(rules, { class: "kitty", title: "" }).opacity, { active: 0.8, inactive: 0.8 });
    assertEquals(R.matchRules(rules, { class: "steam", title: "" }), { noborder: true });
});

Deno.test("floating: rules wait until the window is known to float", () => {
    const { rules, errors } = R.parseRules("size 700 500, floating:1, class:^(foot)$\nopacity 0.5, floating:0, class:^(foot)$");
    assertEquals(errors, []);
    assertEquals(R.matchRules(rules, { class: "foot", title: "" }), {}, "still deciding: neither applies");
    assertEquals(Object.keys(R.matchRules(rules, { class: "foot", title: "", floating: true })), ["size"]);
    assertEquals(Object.keys(R.matchRules(rules, { class: "foot", title: "", floating: false })), ["opacity"]);
});

Deno.test("bad arguments are reported, not guessed", () => {
    const { rules, errors } = R.parseRules([
        "size 800, class:x", "size big 600, class:x", "move 10, class:x",
        "monitor, class:x", "opacity 1.5, class:x", "opacity, class:x", "float, floating:maybe, class:x",
    ].join("\n"));
    assertEquals(rules.length, 0);
    assertEquals(errors.length, 7);
});

Deno.test("workspace rules pin a workspace to a monitor", () => {
    const { rules, errors } = R.parseWorkspaceRules("workspace = 3, monitor:DP-2, default:true");
    assertEquals(errors, []);
    assertEquals(rules[3].monitor, "DP-2");
    assertEquals(rules[3].isDefault, true);
});

Deno.test("workspace rules carry a layout and gaps", () => {
    const { rules, errors } = R.parseWorkspaceRules("2, layout:master, gapsin:0, gaps_out:4\n# a comment");
    assertEquals(errors, []);
    assertEquals(rules[2].layout, "master");
    assertEquals(rules[2].gapsIn, 0);
    assertEquals(rules[2].gapsOut, { left: 4, top: 4, right: 4, bottom: 4 });
});

Deno.test("a workspace rule's outer gaps take 1 to 4 values, as gaps_out does", () => {
    const { rules, errors } = R.parseWorkspaceRules("3, gapsout:1 2 3 4\n4, gapsout:1 2\n5, gapsout:1 2 3 4 5");
    assertEquals(rules[3].gapsOut, { left: 4, top: 1, right: 2, bottom: 3 });
    assertEquals(rules[4].gapsOut, { left: 2, top: 1, right: 2, bottom: 1 });
    assertEquals([rules[5], errors.length], [undefined, 1], "five values: an error, not a guess");
});

Deno.test("several lines for one workspace merge, first wins", () => {
    const { rules } = R.parseWorkspaceRules("1, layout:master\n1, layout:monocle, gapsin:2");
    assertEquals([rules[1].layout, rules[1].gapsIn], ["master", 2]);
});

Deno.test("a workspace rule says what is wrong with it", () => {
    const bad = R.parseWorkspaceRules("monitor:DP-2\n2, layout:spiral\n3, colour:red");
    assertEquals(bad.errors.length, 3);
    assertEquals(bad.errors[1].includes("layout:"), true);
    assertEquals(Object.keys(bad.rules), []);
});

Deno.test("a workspace rule's number is a whole number", () => {
    const { rules, errors } = R.parseWorkspaceRules("3abc, layout:master");
    assertEquals(Object.keys(rules), []);
    assertEquals(errors.length, 1);
});

Deno.test("workspace rules select by window count and monitor, as Hyprland's w[] and m[] do", () => {
    const { rules, selectors, errors } = R.parseWorkspaceRules(
        "w[t1] m[desc:Samsung], gapsout:5 1200 5 1200\nworkspace = w[tv2] m[DP-3], gaps_out:5 480 5 480\nw[1-3], gapsin:0\nm[1], gapsout:2\n3, gapsin:1");
    assertEquals(errors, []);
    assertEquals(Object.keys(rules), ["3"], "numbered rules keep their place");
    assertEquals(selectors.map((s) => [s.windows, s.screen]), [
        [{ min: 1, max: 1 }, { desc: "Samsung" }],
        [{ min: 2, max: 2 }, { name: "DP-3" }],
        [{ min: 1, max: 3 }, null],
        [null, { name: "1" }],
    ]);
    assertEquals(selectors[0].gapsOut, { left: 1200, top: 5, right: 1200, bottom: 5 });
    assertEquals(selectors[2].gapsIn, 0);
});

Deno.test("a selector rule sets gaps only, and says what is wrong with it", () => {
    const bad = R.parseWorkspaceRules([
        "w[t1], layout:master",             // not for a selector rule
        "w[f1], gapsout:0",                 // floating counts are not kept
        "w[t2-1], gapsout:0",               // backwards
        "w[t1] w[t2], gapsout:0",           // twice
        "r[1-3], gapsout:0",                // not a selector we have
        "m[desc:], gapsout:0",              // empty
        "w[t1] x, gapsout:0",               // stray text
    ].join("\n"));
    assertEquals(bad.selectors, []);
    assertEquals(bad.errors.length, 7);
    assertEquals(bad.errors[0].includes("gaps only"), true);
    assertEquals(bad.errors[1].includes("floating"), true);
    assertEquals(bad.errors[4].includes("r[1-3]"), true);
});

Deno.test("workspaceGaps picks the rules for a screen, the counted ones for the engine to choose from", () => {
    const { rules, selectors, errors } = R.parseWorkspaceRules([
        "3, gapsin:2, gapsout:9",
        "m[desc:samsung], gapsout:7 7 7 7",
        "w[t1] m[desc:Samsung], gapsout:5 1200 5 1200",
        "w[t2] m[DP-1], gapsout:5 480 5 480",
        "w[t2] m[1], gapsin:0",
    ].join("\n"));
    assertEquals(errors, []);
    const samsung = { name: "DP-3", index: 1, description: "Samsung Electric Company C49RG9x H1AK500000" };
    const laptop = { name: "DP-1", index: 0, description: "AU Optronics B140QAN06.S" };
    // The numbered rule comes first on the plain gaps, the monitor rule fills in.
    let g = R.workspaceGaps(rules[3], selectors, samsung);
    assertEquals([g.inner, g.outer], [2, { left: 9, top: 9, right: 9, bottom: 9 }]);
    assertEquals(g.byCount, [
        { min: 1, max: 1, inner: null, outer: { left: 1200, top: 5, right: 1200, bottom: 5 } },
        { min: 2, max: 2, inner: 0, outer: { left: null, top: null, right: null, bottom: null } },
    ], "m[1] is the second monitor");
    g = R.workspaceGaps(null, selectors, samsung);
    assertEquals([g.inner, g.outer], [null, { left: 7, top: 7, right: 7, bottom: 7 }]);
    g = R.workspaceGaps(null, selectors, laptop);
    assertEquals([g.inner, g.outer], [null, { left: null, top: null, right: null, bottom: null }]);
    assertEquals(g.byCount.map((e) => e.outer.left), [480]);
    // Nothing about gaps: no gaps object at all.
    assertEquals(R.workspaceGaps(null, [], laptop), null);
    assertEquals(R.workspaceGaps(R.parseWorkspaceRules("2, layout:master").rules[2], [], laptop), null);
});

Deno.test("fullscreen and maximize rules become Plasma window rules", () => {
    const full = R.plasmaRule("fullscreen, class:^(steam_app_.*)$");
    assertEquals(full.entries, {
        types: 1, wmclass: "^(steam_app_.*)$", wmclassmatch: 3, wmclasscomplete: false,
        fullscreen: true, fullscreenrule: 3, Description: "Full screen: ^(steam_app_.*)$ (from HyprKwin)",
    });
    const max = R.plasmaRule("windowrule = maximize, class:^(gimp)$, title:^GNU Image");
    assertEquals([max.entries.maximizehoriz, max.entries.maximizehorizrule, max.entries.maximizevert,
                  max.entries.maximizevertrule, max.entries.title, max.entries.titlematch],
                 [true, 3, true, 3, "^GNU Image", 3], "maximize, matching the title too");
    assertEquals(typeof R.plasmaRule("maximize, floating:1, class:^(x)$").why, "string", "floating: stays");
    assertEquals(R.plasmaRule("float, class:^(steam)$"), null, "other rules stay HyprKwin's");
    assertEquals(R.plasmaRule("size 800 600, class:^(x)$"), null);
    assertEquals(R.plasmaRule("fullscreen, colour:red"), null, "a broken line is left alone");
    // The pattern goes over as written, slashes and all.
    assertEquals(R.plasmaRule("fullscreen, title:^a/b$").entries.title, "^a/b$");
});
