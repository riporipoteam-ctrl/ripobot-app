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

The root `render.yaml` describes the web service and serves the built app and API from one Node process. Set `HF_TOKEN` and `RIPO_ACCESS_CODE` as secret environment variables in the hosting dashboard. Do not commit either value or add the Hugging Face token to client-side code.

## Current scope

Chat uses the model above. Agent profiles, conversations, workflow templates, and task history are saved locally in the browser. External app connections and unattended computer use need their own authorized provider integrations and are not enabled by the current web app.
