#!/usr/bin/env bash
# Download card assets from JLogical-Apps/cards (MIT license) into public/cards/
# Run once from the project root: bash scripts/download-card-assets.sh

set -e

BASE_URL="https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets"
FACES_DIR="public/cards/faces"
BACKS_DIR="public/cards/backs"
SOUNDS_DIR="public/cards/sounds"

mkdir -p "$FACES_DIR" "$BACKS_DIR" "$SOUNDS_DIR"

echo "Downloading card face SVGs..."
count=0
for suit in CLUB DIAMOND HEART SPADE; do
  for rank in 1 2 3 4 5 6 7 8 9 10; do
    dest="$FACES_DIR/${suit}-${rank}.svg"
    if curl -s -f "$BASE_URL/faces/${suit}-${rank}.svg" -o "$dest"; then
      count=$((count + 1))
    else
      echo "WARNING: Failed to download ${suit}-${rank}.svg"
    fi
  done
  for named in "11-JACK" "12-QUEEN" "13-KING"; do
    dest="$FACES_DIR/${suit}-${named}.svg"
    if curl -s -f "$BASE_URL/faces/${suit}-${named}.svg" -o "$dest"; then
      count=$((count + 1))
    else
      echo "WARNING: Failed to download ${suit}-${named}.svg"
    fi
  done
done

echo "Downloading joker SVGs..."
for joker in "JOKER-1" "JOKER-2"; do
  dest="$FACES_DIR/${joker}.svg"
  if curl -s -f "$BASE_URL/faces/${joker}.svg" -o "$dest"; then
    count=$((count + 1))
  else
    echo "WARNING: Failed to download ${joker}.svg"
  fi
done

echo "Downloading card back SVG..."
if curl -s -f "$BASE_URL/backs/back.svg" -o "$BACKS_DIR/back.svg"; then
  echo "Downloaded back.svg"
else
  echo "ERROR: Failed to download back.svg"
  exit 1
fi

echo "Downloading sound WAV files..."
sound_count=0
for sound in draw place deck_redraw win; do
  dest="$SOUNDS_DIR/${sound}.wav"
  if curl -s -f "$BASE_URL/sounds/${sound}.wav" -o "$dest"; then
    sound_count=$((sound_count + 1))
  else
    echo "WARNING: Failed to download ${sound}.wav"
  fi
done

echo ""
echo "Download complete:"
echo "  SVG card faces: $count files in $FACES_DIR"
echo "  Card back: 1 file in $BACKS_DIR"
echo "  Sound files: $sound_count files in $SOUNDS_DIR"
