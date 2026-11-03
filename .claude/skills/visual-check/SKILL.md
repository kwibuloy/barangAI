---
name: visual-check
description: Screenshot the BarangAI routes you touched at phone and tablet widths, send them to the user, and wait for approval. Use after any change to apps/web layout, styles or components, or when the user asks how something looks.
---

# Visual check

**Residents use phones; staff and admins use desktops.** Judge resident routes at 390 and 768, staff routes (`desk...`) at 1440 and 1024, and shoot at least one route per role with `--theme dark`. A UI change is not done until the user has approved the screenshots.

1. Start a local API on :8000 in the background, from the repo root, with `COOKIE_SECURE=false`, `MEDIA_STORAGE=local`, and `DATABASE_URL`/`PRIVATE_MEDIA_DIR` pointing at the scratchpad:
   `.venv/Scripts/python.exe -m uvicorn barangai.main:app --app-dir apps/api --host 127.0.0.1 --port 8000`. If the user already runs servers on 8000/5173, use 8001 and 5175 instead: start Vite with `API_URL=http://127.0.0.1:8001` and shoot with `BASE_URL=http://127.0.0.1:5175/`.
   If that database is empty, run the `seed-demo` skill against it with a generated `SEED_DEMO_PASSWORD`, and keep that variable set for step 3.
2. Start the web app: the `barangai-web` entry in `.claude/launch.json`, or `npm run dev` in `apps/web` in the background.
3. From `apps/web`, shoot each role that sees the routes you touched (`home` is `/`; write routes without the leading `/`):

   ```bash
   node scripts/shoot.mjs --as resident home
   node scripts/shoot.mjs --as staff --widths 390,768,1024,1440 home
   ```

   `--as none` shoots the signed-out screens. It prints each PNG in `.shots/` and exits non-zero on console errors or horizontal overflow. Report those first.
4. Open every PNG with Read and describe what you actually see. A passing exit code only means nothing crashed. For a deeper pass, hand the PNG paths to the `ui-critic` agent.
5. Send the PNGs with SendUserFile (phone and tablet first), list the problems you see, and ask for approval. Don't start the next UI change until the user approves; fix what they flag and shoot again.
6. Delete `.shots/` when it's approved (it's git-ignored). Stop the servers you started.
