#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="PaperWall"
VERSION="$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('${ROOT_DIR}/package.json','utf8')); console.log(p.version)")"
ARCH="$(uname -m)"
APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
OUTPUT_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
OUTPUT_PATH="${OUTPUT_DIR}/${APP_NAME}_${VERSION}_${ARCH}.dmg"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "未找到应用包：${APP_PATH}"
  echo "请先执行: npm run tauri:build:app"
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

echo "正在生成 DMG: ${OUTPUT_PATH}"
hdiutil create -volname "${APP_NAME}" -srcfolder "${APP_PATH}" -ov -format UDZO "${OUTPUT_PATH}"
echo "DMG 生成完成: ${OUTPUT_PATH}"
