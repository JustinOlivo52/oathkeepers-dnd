# Deploying Oathkeepers

One server runs everything: the game pages, the API, the AI DM and the shared tables.
`Dockerfile` builds it. Any host that runs a Docker container and keeps a disk works.

## What the server needs

| Setting | What it's for |
| --- | --- |
| `ANTHROPIC_API_KEY` | The AI DM. Set it in the host's secret settings, never in a file in the repo. |
| `GROUP_CODE` | Required before going public. New players need it to make an account, and only signed-in players get the AI DM. |
| `DM_MONTHLY_BUDGET_USD` | Spending cap. The server stops calling Claude when it's reached. Start with 10 to 20. |
| `DATA_DIR` | Already `/data` in the image. Mount a persistent volume there, or saves vanish on every redeploy. |
| `PORT` | Already 8080 in the image. Most hosts set it for you. |

Run exactly **one** copy of the server. Live tables are held in memory, so two copies would split the players.

## Railway (recommended)

1. railway.com: sign in with GitHub, New Project, Deploy from GitHub repo, pick `oathkeepers-dnd`. It finds the `Dockerfile` and `railway.json`.
2. Service, Variables: add `ANTHROPIC_API_KEY`, `GROUP_CODE`, `DM_MONTHLY_BUDGET_USD`.
3. Service, right-click, Attach volume: mount path `/data`.
4. Settings, Networking, Generate Domain. That URL is the game.
5. Every push to `master` redeploys. The health check is `/api/health`.

## Check it works

- Open the URL: the game loads, and `/api/health` shows `"providers":["claude","demo"]` and `"groupCode":true`.
- Sign in with a new name: it asks for the group code.
- Start an adventure with Claude, invite a friend from another device, play one fight together.
- Redeploy, then continue the adventure: it's still there (the volume works).

## Try the production build locally

```bash
npm run build
DATA_DIR=./tmp-data GROUP_CODE=test npm start   # http://localhost:8787
```

## Still to do before a wider launch

- Real sign-in (name + PIN is a stand-in; the group code keeps it to people you invite)
- Backups of the `/data` volume
