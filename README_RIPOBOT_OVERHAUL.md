# Ripo Bot V2 — Free-plan deployment

Ripo Bot V2 is a persistent multi-agent AI workspace inspired by the interaction ideas behind Grok Bot while using Ripo Bot's own identity and interface.

## Included

- Main Ripo Bot agent plus custom agents and teams
- Agent rename/create/team actions
- Hugging Face primary model route with Cloudflare AI / backup fallbacks
- Signup/login/session auth
- D1 persistence for accounts, agent state, conversations, teams, and Ripo Computer Lite
- Workers KV for uploads (no R2 subscription)
- File upload/list/download with hard quotas to stay inside the free KV plan
- Web search for every agent
- Ripo Computer Lite: persistent per-account Linux-style virtual terminal and filesystem
- Mobile + desktop responsive UI, onboarding, PWA assets, animated agent states

## Cloudflare resources

- D1 database: `ripobot-app`
- KV namespace: `ripobot-files`
- Worker: `ripobot-api`

R2 and paid Containers/Sandboxes are intentionally not required.

## Ripo Computer Lite

The free plan does not include Cloudflare Containers/Sandbox. Instead Ripo Computer Lite provides a safe per-account virtual workspace with commands including `pwd`, `ls`, `cd`, `mkdir`, `touch`, `cat`, `echo >`, `rm`, `cp`, `mv`, `files`, `search`, `whoami`, `uname`, and `date`.

This is deliberately described as Linux-style rather than pretending to be a paid full VM.
