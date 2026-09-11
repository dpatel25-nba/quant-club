"""Every class the markup or the JS relies on must actually have a CSS rule.

A redesign deleted .mview, .mtab and .mtabs by replacing a range of the
stylesheet that happened to contain them. Nothing caught it: tags balanced, ids
were unique, the script executed, braces matched. But .mview{display:none} is
what HIDES the inactive sections, so losing it rendered every section at once
and stacked the research tools at the foot of the home page.

Classes that control VISIBILITY are the dangerous ones — losing a colour is
cosmetic, losing a display rule breaks the page silently. Those are checked by
name; everything else is reported as a warning.

Usage: python3 test/check_css.py
"""

import re
import sys
from pathlib import Path

HTML = Path(__file__).resolve().parents[1] / "index.html"

# Classes the JavaScript toggles to show and hide things. If any of these has no
# rule, the page does not merely look wrong — it stops working.
CRITICAL = {
    ".mview": "hides inactive top-level sections",
    ".mview.on": "reveals the active top-level section",
    ".view": "hides inactive tool tabs",
    ".view.on": "reveals the active tool tab",
    ".mtab.on": "marks the active navigation item",
    ".tab.on": "marks the active tool tab",
}


def main() -> int:
    s = HTML.read_text()
    css = re.search(r"<style>(.*?)</style>", s, re.S).group(1)
    # Strip <script> blocks before looking for class attributes: the JS builds
    # markup by concatenation, so scanning it yields fragments of expressions
    # rather than class names and drowns the real warnings.
    body = re.sub(r"<script>.*?</script>", "", s[s.index("</style>"):], flags=re.S)

    bad = 0
    print("  critical visibility rules")
    for sel, why in sorted(CRITICAL.items()):
        # match the selector at the start of a rule, allowing for a selector list
        ok = re.search(r"(^|[,}\s])" + re.escape(sel) + r"\s*[,{]", css, re.M)
        print(f"    {sel:<12} {'OK  ' if ok else 'MISSING'}  {why}")
        if not ok:
            bad += 1

    used = set()
    for m in re.findall(r'class="([^"]+)"', body):
        used.update(m.split())
    defined = set(re.findall(r"\.([A-Za-z][\w-]*)", css))
    orphan = sorted(c for c in used - defined if not c.startswith("on"))
    print(f"\n  classes used in markup with no rule: {len(orphan)}")
    for c in orphan[:12]:
        print(f"    .{c}")
    # Zero is the correct baseline, so this FAILS rather than warns. A check
    # that prints a number nobody acts on is not a check. Classes generated
    # inside the JavaScript are not scanned, so this only sees real markup.
    if orphan:
        bad += 1

    print(f"\n  braces balanced: {css.count('{') == css.count('}')}")
    if css.count("{") != css.count("}"):
        bad += 1
    if re.search(r",\s*@media", css):
        print("  ERROR: @media inside a selector list")
        bad += 1

    print("\n  RESULT:", "FAIL" if bad else "PASS")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
