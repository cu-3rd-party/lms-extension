#!/usr/bin/env bash
# safari-from-github.sh TAG OUT_DIR — ждёт, пока GitHub-зеркало соберёт Safari
# (.github/workflows/build-safari.yml на macOS-раннере GitHub) и выложит DMG и appcast
# в GitHub Release тега, затем скачивает их в OUT_DIR. Без токенов: репозиторий публичный.
# Падает, если сборка на GitHub упала или не уложилась в SAFARI_WAIT_MINUTES (по умолчанию 60).
set -euo pipefail

tag=${1:?tag} out=${2:?out dir}
mirror=${GITHUB_MIRROR:-cu-3rd-party/lms-extension}
wait_minutes=${SAFARI_WAIT_MINUTES:-60}
download="https://github.com/$mirror/releases/download/$tag"
runs="https://api.github.com/repos/$mirror/actions/workflows/build-safari.yml/runs?event=push&branch=$tag&per_page=1"

seen_success=0
mkdir -p "$out"
for ((i = 1; i <= wait_minutes; i++)); do
  # appcast загружается после DMG, поэтому его наличие означает, что оба файла готовы
  if curl -fsSL -o "$out/appcast.xml" "$download/appcast.xml"; then
    curl -fsSL -o "$out/lms-extension-safari.dmg" "$download/lms-extension-safari.dmg"
    echo "Safari-сборка для $tag скачана с GitHub"
    exit 0
  fi
  # раз в 5 минут проверяем, не упала ли сборка (без токена у API лимит 60 запросов в час)
  if ((i % 5 == 0)); then
    conclusion=$(curl -fsS "$runs" | jq -r '.workflow_runs[0].conclusion // "pending"' || echo unknown)
    echo "[$i мин] Build Safari на GitHub: $conclusion"
    case $conclusion in
      failure | cancelled | timed_out | startup_failure)
        echo "Сборка Safari на GitHub завершилась: $conclusion — https://github.com/$mirror/actions/workflows/build-safari.yml" >&2
        exit 1
        ;;
      success)
        # сборка прошла, но appcast так и не появился (например, prerelease-тег)
        ((seen_success++)) && {
          echo "Build Safari на GitHub успешен, но в релизе $tag нет appcast.xml" >&2
          exit 1
        }
        ;;
    esac
  fi
  sleep 60
done
echo "Не дождались Safari-сборки для $tag за $wait_minutes мин" >&2
exit 1
