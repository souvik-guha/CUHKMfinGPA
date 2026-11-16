# CUHK MSc Finance GPA Calculator

A single-file calculator (`index.html`, about 33 KB, no dependencies, no network requests) for CUHK MSc Finance course scores, the final-exam score you need for a target grade, and unit-weighted GPA.

**Live site:** https://souvik-guha.github.io/CUHKMfinGPA/ (GitHub Pages serves `main`).

## How it calculates

- **Course score** = Σ (mark ÷ max × weight). A blank component is *unknown*, not zero: the page shows the range from scoring 0 on it to full credit. A typed `0` is a real zero.
- **Needed final** = (cutoff − banked) ÷ final weight, and it **rounds up**, so the number shown always reaches the grade (69.5238% is shown as 69.53%).
- **Displayed scores** never cross a cutoff by rounding (79.9965 shows as 79.99, not 80.00). Comparisons tolerate 1e-9 of floating-point noise only.
- **Chart**: the grade for every possible final score. Step positions are computed from the cutoffs, not sampled, and sit at exactly the scores in the table. Shaded area = range while coursework is unentered.
- **Overall GPA** = Σ(units × grade point) ÷ Σ units over included courses. Courses with no marks, blank percentages, 0 units and P/U/DI/PA/FA are left out. F counts as 0.0.
- **Cutoffs**: A through C+ come from the IPA 6112 slide. C and below are estimates that continue the 10-point step; edit them in the page if a course publishes its own. The grade-point scale is the official 4.0 scale.

Marks are kept in `localStorage` (`cuhk-gpa-v4`) and never leave the browser. A fresh visit is blank.

## Checks

```bash
npm ci && npm test
```

Tests drive the page in Chrome or Chromium (`CHROME_PATH` or `CHROME_BIN` to point at it): cutoff boundaries and rounding, blank vs zero, needed-score rounding, GPA weighting, saved state, chart click/keys/step positions, cutoff validation, phone layout.
