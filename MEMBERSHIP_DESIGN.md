# Membership design

The membership page helps an Emory student understand what they will do,
choose a team and find the application process. Eligibility, dues and the
non-discrimination policy retain their original meaning. The application
form and deadlines remain marked as to be announced.

## Reference study

- [RSA Fellowship](https://www.thersa.org/fellowship/): reviewed the public
  page content for its progression from community purpose to benefits and
  joining. Browser inspection encountered its verification screen.
- [Soho House Membership](https://www.sohohouse.com/en-us/membership): reviewed
  the page and its browser rendering for clear typographic hierarchy,
  restrained navigation and a prominent application action.

These informed the hierarchy. The club's visual concept is an investment
prospectus: warm paper, dark green ink, rust accents, serif headlines and
thin rules. The notebook illustration is original inline SVG and HTML;
it is decorative, with no represented investment results. No reference
photography, logos or page layouts were copied.

## Structure and behavior

The page moves through an introduction, membership facts, practical benefits,
four expandable teams, joining steps and the club's commitments. Team and
policy expanders use native keyboard-accessible `details` elements.

`membership.css` shares the palette, typography and responsive header between
Overview and Membership. Both pages use straightforward club descriptions and
headings. Overview presents the club's focus, activities and teams without
placeholder photography. Public sections have shareable fragment URLs;
`/#membership` opens Membership and `/#membership-teams` opens its team section.
Back/forward navigation and the existing Style Rotation link are supported.
There are no additional runtime dependencies, fonts or image requests.

## Verification

The existing CSS, page execution and Style Rotation checks continue to run.
The optional browser check needs Python Playwright and its Chromium browser:

```sh
python -m pip install playwright==1.55.0
python -m playwright install chromium
python test/check_membership_browser.py
```

The browser check covers both public pages at six widths from 320 to 1440 pixels, both OS color
schemes, keyboard team selection, application buttons, fragment reloads,
browser history and the research deep link. Desktop and mobile screenshots
are written to the system temporary directory for visual review.
