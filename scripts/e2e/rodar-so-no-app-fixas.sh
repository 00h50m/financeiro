#!/bin/bash
# Teste de ponta a ponta de contas fixas na fatura (Chromium real + Supabase simulado).
set -e
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
export TMP_E2E=${TMP_E2E:-$(mktemp -d)}
export DIST="$TMP_E2E/dist"
cd "$RAIZ"
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=teste npx vite build --outDir "$DIST" --emptyOutDir > /dev/null
node scripts/e2e/so-no-app-fixas.mjs
