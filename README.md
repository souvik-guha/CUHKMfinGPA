# CUHK MSc Finance GPA Calculator

[![Tests](https://github.com/souvik-guha/CUHKMfinGPA/actions/workflows/test.yml/badge.svg)](https://github.com/souvik-guha/CUHKMfinGPA/actions/workflows/test.yml)

**Live site:** https://souvik-guha.github.io/CUHKMfinGPA/

Single-file calculator (`index.html`) for CUHK MSc Finance course scores, the final-exam score you need, and unit-weighted GPA. Marks stay in your browser.

## Math

- Course score = Σ mark ÷ max × weight. A blank component is unknown, not zero, so you see a range.
- Needed-final and "points below" figures round **up** (the number shown always suffices). Shown scores never cross a cutoff by rounding. GPA and averages round half up.
- Typed percentages for other courses are capped to 0–100 before averaging. Inputs accept any score; nothing is snapped to a grid.

## Audit

`audit/audit.mjs` drives the real page and checks every printed score, letter, needed score, chart step and GPA against an exact BigInt-fraction oracle (`audit/oracle.mjs`), including marks that land on or within 1e-4 of cutoffs. `audit/snapshot.mjs` hashes the UI over 700 seeded states so a refactor can be proven output-identical.

```bash
npm ci
CHROME_PATH=/path/to/chrome npm test      # runs audit/audit.mjs with seed 1: about 11,000 cases
```
