# CUHK MSc Finance GPA Calculator

A single-page calculator for CUHK MSc Finance course scores and unit-weighted GPA. It is static HTML, CSS, and JavaScript: open `index.html` in a browser. Nothing is sent to a server.

**Live site:** https://souvik-guha.github.io/CUHKMfinGPA/

GitHub Pages publishes the `main` branch. A pull request does not change the live site or Pages settings.

## Score and GPA

Course score is the weighted sum of component marks. A blank component is unknown, so the course shows the range from scoring 0 on it to scoring full credit. A typed `0` is a real zero. `F` is 0 grade points and still counts.

Overall GPA is the unit-weighted average of included grade points:

`sum(course grade point × included units) / included units`

Units of 0, blank percentage courses, and grades marked “Not in GPA” (P, U, DI, PA, FA) are left out. Letter grades use the official 4.0 scale (A 4.0 … D 1.0, F 0.0). Percentage cutoffs are separate: A through C+ come from the IPA 6112 slide, and C through D are labeled extrapolations, not official numbers.

The final-exam chart can preview a score without saving it. Only the selected course’s final exam changes when you use its slider, the chart slider, or the chart. The effort curve is illustrative. It is off on every load.

Marks are stored in `localStorage` under `cuhk-gpa-v4`. An older `cuhk-gpa-v3` save is read only when v4 is absent, and that v3 entry is left in place. The first time a save is read without `clearedDefaultMidterm`, an IPA midterm of exactly 16/30 is cleared once: that was the old placeholder, not a confirmed score. A later genuine 16 is kept. A value that cannot be parsed is not overwritten. Reset marks and Reset cutoffs are the explicit ways to restore defaults.

The page loads IBM Plex and Space Grotesk from Google Fonts. Everything else stays in this file.

## Checks

```bash
npm test
```

The tests use the Chrome or Chromium already installed on the machine (`CHROME_PATH` or `CHROME_BIN` overrides the lookup). They cover grade boundaries, credit inclusion, blank versus zero, saved-state migration, exam control sync, keyboard access, and a narrow layout.
