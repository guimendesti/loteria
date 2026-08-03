#!/usr/bin/env bash
# LotoPro — deploy idempotente na VPS com Traefik compartilhado.
# Uso (a partir da máquina local, com SSH funcionando):
#   bash deploy/deploy.sh [usuario@host]
# Padrão: root@76.13.172.16
set -euo pipefail

TARGET="${1:-root@76.13.172.16}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lotopro}"
REPO="${REPO:-git@github.com:guimendesti/loteria.git}"
DOMAIN="${DOMAIN:-loteria.iauai.online}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

say "1/5 Verificando acesso a $TARGET"
ssh -o ConnectTimeout=15 "$TARGET" 'docker --version && docker compose version' \
  || { echo "❌ Sem acesso SSH ou sem Docker. Ver deploy/README.md §0."; exit 1; }

say "2/5 Detectando configuração do Traefik"
ssh "$TARGET" 'bash -s' <<'REMOTE'
set -e
echo "Redes docker:"; docker network ls --format '  {{.Name}}'
TRAEFIK_CID=$(docker ps --filter name=traefik -q | head -1)
if [ -n "$TRAEFIK_CID" ]; then
  echo "Traefik: $(docker ps --filter id=$TRAEFIK_CID --format '{{.Names}} ({{.Image}})')"
  echo "Redes do Traefik:"
  docker inspect "$TRAEFIK_CID" -f '{{range $k,$v := .NetworkSettings.Networks}}  {{$k}}{{"\n"}}{{end}}'
  echo "Certresolvers/entrypoints declarados:"
  docker inspect "$TRAEFIK_CID" -f '{{range .Config.Cmd}}{{println .}}{{end}}' | grep -iE 'certificatesresolvers|entrypoints' | sed 's/^/  /' || true
  docker inspect "$TRAEFIK_CID" -f '{{range .Config.Env}}{{println .}}{{end}}' | grep -iE 'CERTIFICATESRESOLVERS|ENTRYPOINTS' | sed 's/^/  /' || true
else
  echo "⚠️  Nenhum container com 'traefik' no nome. Confirme o proxy do servidor."
fi
REMOTE

say "3/5 Sincronizando código em $REMOTE_DIR"
ssh "$TARGET" "mkdir -p $REMOTE_DIR"
if ssh "$TARGET" "[ -d $REMOTE_DIR/.git ]"; then
  ssh "$TARGET" "cd $REMOTE_DIR && git fetch --all && git reset --hard origin/main"
else
  ssh "$TARGET" "git clone $REPO $REMOTE_DIR" \
    || { say "clone por SSH falhou — enviando via rsync"; \
         rsync -az --delete --exclude node_modules --exclude .next --exclude .git \
           --exclude .env ./ "$TARGET:$REMOTE_DIR/"; }
fi

say "4/5 Conferindo .env no servidor"
ssh "$TARGET" "[ -f $REMOTE_DIR/.env ]" || {
  echo "❌ $REMOTE_DIR/.env não existe. Crie-o conforme deploy/README.md §2 e rode de novo."
  exit 1
}

say "5/5 Subindo containers (build + migrate + up)"
ssh "$TARGET" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build"
ssh "$TARGET" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml ps"

say "Verificando HTTPS em https://$DOMAIN"
sleep 20
curl -sI "https://$DOMAIN" | head -3 || echo "⚠️  Ainda não respondeu — o Let's Encrypt pode levar ~1 min."
echo
echo "✅ Deploy disparado. Logs: ssh $TARGET 'cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml logs -f web worker'"
