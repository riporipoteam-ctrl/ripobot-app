# RipoBot

RipoBot is a web workspace for building a small team of helpful AI agents. Create specialists, hand them a prompt, review their replies, and keep reusable workflows together in one place.

## Run locally

Requirements: Node.js 24 or newer and npm.

```sh
npm install
cp .env.example .env
# Add the Hugging Face token used by your RipoBot Discord deployment to .env.
npm run dev
```

Open the Vite URL printed in the terminal. The app saves its workspace, agents, and conversations in this browser.

## AI model

The server uses the same model route as the RipoBot Discord bot:

- Primary: Hugging Face Router, model `meta-llama/Llama-3.1-8B-Instruct`
- Backup: the keyless Pollinations OpenAI-compatible endpoint, used when Hugging Face is not configured or unavailable

Set `HF_TOKEN` and a private `RIPO_ACCESS_CODE` on the server before the public web app uses the Hugging Face route. The access code is entered in Settings and held only for the current browser session; the Hugging Face token stays on the server. `HF_MODEL` can override the model name; it defaults to the Discord bot's source default.

## Deploy

The site uses the GitHub Actions workflow in `.github/workflows/deploy-pages.yml` to build `dist/` and publish the app to GitHub Pages. Push to `main` to publish the UI.

The Worker entry point and Wrangler config are in `cloudflare/`. Its route order is Hugging Face (when its secrets are configured), Cloudflare Workers AI using Llama 3.1 8B, then Pollinations. Workers AI includes 10,000 Neurons per day at no charge; over that, Cloudflare Workers Paid pricing applies. Deploy the API with `cd cloudflare && npx wrangler deploy`. The web app calls `https://ripobot-api.ripo-ripoteam.workers.dev`; update that default in `src/App.jsx` if the Worker name or account subdomain changes. Add `HF_TOKEN` and `RIPO_ACCESS_CODE` as Worker secrets in Cloudflare to enable the Discord bot's Hugging Face route. The access code is entered in Settings and held only for the current browser session. Never commit the Hugging Face token or place it in client-side code.

## Current scope

Chat uses the model above. Agent profiles, conversations, workflow templates, and task history are saved locally in the browser. External app connections and unattended computer use need their own authorized provider integrations and are not enabled by the current web app.
