#!/usr/bin/env bash
# Envoie les variables du fichier .env local vers un environnement Vercel.
#
#   ./scripts/vercel-env-push.sh production
#   ./scripts/vercel-env-push.sh preview --remplacer   # écrase les variables déjà définies
#
# Les valeurs transitent par l'entrée standard : elles n'apparaissent ni à l'écran,
# ni dans la liste des processus, ni dans l'historique du terminal.
set -euo pipefail

cible="${1:-production}"
remplacer="${2:-}"
racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fichier="$racine/.env"

case "$cible" in
  production|preview|development) ;;
  *) echo "Cible inconnue « $cible » — attendu : production, preview ou development." >&2; exit 1 ;;
esac

command -v vercel >/dev/null 2>&1 || {
  echo "La CLI Vercel est absente : npm i -g vercel puis vercel login && vercel link" >&2
  exit 1
}
[ -f "$fichier" ] || { echo "$fichier introuvable — lancez d'abord : npm run env:preparer" >&2; exit 1; }

# Variables qui restent sur le poste : amorçage de la base et bascules de développement.
locales=" SEED_RAISON_SOCIALE SEED_GERANT_EMAIL SEED_GERANT_MOT_DE_PASSE DATABASE_DRIVER SKIP_MIGRATIONS "
# Fragments de .env.example : une valeur qui en contient un n'est pas renseignée.
gabarits='changez-moi|USER:PASSWORD|SCWXXXX|xxxxxxxx-xxxx|ep-xxxx'

envoyees=0
ignorees=0

while IFS= read -r ligne || [ -n "$ligne" ]; do
  case "$ligne" in ''|'#'*) continue ;; esac
  case "$ligne" in *=*) ;; *) continue ;; esac

  cle="${ligne%%=*}"
  cle="$(printf '%s' "$cle" | tr -d '[:space:]')"
  valeur="${ligne#*=}"
  # Retrait des guillemets éventuels autour de la valeur.
  valeur="${valeur%\"}"; valeur="${valeur#\"}"
  valeur="${valeur%\'}"; valeur="${valeur#\'}"

  if [ -z "$valeur" ]; then
    echo "  — $cle : vide, ignorée"; ignorees=$((ignorees + 1)); continue
  fi
  if printf '%s' "$valeur" | grep -Eq "$gabarits"; then
    echo "  — $cle : gabarit non renseigné, ignorée"; ignorees=$((ignorees + 1)); continue
  fi
  case "$locales" in *" $cle "*)
    echo "  — $cle : variable locale, non envoyée"; ignorees=$((ignorees + 1)); continue ;;
  esac

  if [ "$remplacer" = "--remplacer" ]; then
    vercel env rm "$cle" "$cible" --yes </dev/null >/dev/null 2>&1 || true
  fi
  if printf '%s' "$valeur" | vercel env add "$cle" "$cible" >/dev/null 2>&1; then
    echo "  ✓ $cle"; envoyees=$((envoyees + 1))
  else
    echo "  ✗ $cle : échec (déjà définie ? relancez avec --remplacer)" >&2
    ignorees=$((ignorees + 1))
  fi
done < "$fichier"

echo ""
echo "$envoyees variable(s) envoyée(s) vers « $cible », $ignorees ignorée(s)."
echo "Vérification : vercel env ls $cible"
