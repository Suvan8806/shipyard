# W3 polish · W4 harden · W5 ship

## W3: Make it look great (H17–H20, parallel; all read-mostly, so no conflicts)
| Session | Task | Skill | Owns |
|---|---|---|---|
| O-D | `/impeccable init` (writes PRODUCT.md: an enterprise trust tool, calm but confident, with the gate board as hero) → `/impeccable critique` on the gate board, run trace and agent page → fix the top 5 → `animate` (card flip, banner entrance) → `/impeccable polish` | `impeccable`, `ecc:motion-ui` | UI files + `app/globals.css` (O0 grants D temporary ownership in W3) |
| O-C | `/qa` on the production URL (every route and screen, the deploy flow, the bad edit flow); write the fix list to `status/lane-C.md` | `qa` | none (report) |
| O-B | `skilled-reviewer` agent running `/review` on `git diff <W0 commit>..main`; CRITICAL/HIGH only, into `status/lane-B.md` | `review` | none (report) |
| O-A | Demo determinism: run E3 again 3+3 on production, time the gate, tune `runs_per_scenario` and concurrency so a deploy finishes in **< 60 s** | | lib/runtime, lib/gate tunables |
| O0 | Triage every report into one fix list in PLAN.md and assign fixes to their owners (serial when files overlap) | | PLAN.md |

## W4: Harden the demo (H20–H23)
1. Apply the fixes. **Only CRITICAL/HIGH from review, and anything that breaks the demo script.**
2. Security pass: no secrets in git (`git log -p | grep -i "key\|secret"`), service role only on the server, zod on every write route, rate limit + admin token on in production, `get_advisors` clean.
3. Set the production env: `SHIPYARD_ADMIN_TOKEN` set and the dashboard admin cookie set on the demo laptop. Decide on `SHIPYARD_DEMO_REPLAY`: keep it at **0 for the live demo**, and flip it to 1 only if the provider is failing on stage.
4. **Demo walk ×3 on production** (H2) with `agents/DEMO.md`: reset → library → MCP create → bad edit → blocked → trace → rollback. Time each one.
5. **Record the backup video** (H3) of the full walk: OBS or the Windows Game Bar, 1080p, saved as `brag-output/backup-demo.mp4`.
6. Final `vercel --prod`, tag `demo-freeze`, then **feature freeze**. After that, only fix bugs that break the demo script.

## W5: Submission (H23–H24)
1. "let's /brag about this" → `/brag-slim` launch video.
2. README (`document-generate` can draft it): one-liner, Maya + statistic (with source), a GIF of the gate board blocking, the live URL, the MCP one-liner, the video, the architecture (twins → assertions → gate), tech used (name every sponsor tool), and how to run it locally.
3. Devpost: same content; the NMC2 track plus every confirmed sponsor track.
4. Submit early; resubmit if anything improves.

## Demo-day checklist
- [ ] `resetLive()` run · good support-agent v1 live · collections-agent deleted (so MCP creates it fresh) or renamed
- [ ] Claude Code has the `shipyard` MCP added and tested once on stage Wi-Fi
- [ ] Bad-edit line in the clipboard · dashboard open on `/library` · trace tab ready
- [ ] Backup video on the desktop · hotspot ready · replay flag procedure known
