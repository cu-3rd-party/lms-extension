#!/usr/bin/env bash
# Релиз Forgejo для тега.
#   release.sh ensure TAG          — создать релиз, если его нет (тег с «-» → prerelease)
#   release.sh upload TAG FILE...  — прикрепить файлы, заменив одноимённые
# Нужны FORGEJO_TOKEN, GITHUB_SERVER_URL, GITHUB_REPOSITORY (последние два задаёт раннер).
set -euo pipefail

api="$GITHUB_SERVER_URL/api/v1/repos/$GITHUB_REPOSITORY"
auth="Authorization: token ${FORGEJO_TOKEN:?FORGEJO_TOKEN is required}"

release_json() {
  curl -fsS -H "$auth" "$api/releases/tags/$1"
}

cmd=${1:?command} tag=${2:?tag}
shift 2

case $cmd in
  ensure)
    if release_json "$tag" >/dev/null 2>&1; then
      echo "Релиз $tag уже есть"
      exit 0
    fi
    prerelease=false
    [[ $tag == *-* ]] && prerelease=true
    jq -n --arg t "$tag" --argjson p "$prerelease" '{tag_name:$t, name:$t, prerelease:$p}' |
      curl -fsS -H "$auth" -H 'Content-Type: application/json' -X POST "$api/releases" -d @- >/dev/null
    echo "Создан релиз $tag (prerelease=$prerelease)"
    ;;
  upload)
    rel=$(release_json "$tag")
    id=$(jq -r .id <<<"$rel")
    for file in "$@"; do
      name=$(basename "$file")
      for old in $(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .id' <<<"$rel"); do
        curl -fsS -H "$auth" -X DELETE "$api/releases/$id/assets/$old"
      done
      curl -fsS -H "$auth" -X POST "$api/releases/$id/assets?name=$name" -F "attachment=@$file" >/dev/null
      echo "Прикреплён $name к $tag"
    done
    ;;
  *)
    echo "unknown command: $cmd" >&2
    exit 2
    ;;
esac
