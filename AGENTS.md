# Agent notes

- `sample-bank.tsv` is a real bank in the Bank Memory plugin's export format. Use it whenever you need to reproduce
  what the user sees. The matching levels and prayers are `sampleSettings` in `src/engine/__tests__/fixtures.ts`.
- Never write the user's in-game name into the repository.
- `npm run benchmark` and `npm run path-check` run real searches on that bank and write reports to `scratch/`. They
  need the price snapshots described in the README.
