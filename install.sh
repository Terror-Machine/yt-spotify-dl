#!/usr/bin/env bash

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Script harus dijalankan sebagai root/sudo"
  exit 1
fi

echo ""
echo "🎭 Menginstall package.json..."
if [ -f "package.json" ]; then
  npm install
else
  echo "⚠️ package.json tidak ditemukan, melewati npm install"
fi

echo ""
echo "✅ Setup selesai!"