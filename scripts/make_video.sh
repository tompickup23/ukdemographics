#!/bin/bash
# Build a 15-second vertical video (9:16) for the NEWETHPOP validation finding
# Style: Rupert Lowe / Dan Neidle — data punches, no waffle
#
# Scene breakdown:
# 0-3s: Hook text over academic library footage
# 3-7s: Data point over diverse crowd footage
# 7-11s: Stat card (brand system generated)
# 11-15s: CTA over data footage
#
set -e
cd "$(dirname "$0")/.."

OUT="assets/output"
CARDS="public/cards"
FOOTAGE="assets/footage"
mkdir -p "$OUT"

# Branded colours
CYAN="#06b6d4"
BG="#04070d"
AMBER="#f59e0b"
WHITE="#f5f7fb"

# Font (use system font)
FONT="/System/Library/Fonts/Helvetica.ttc"
FONT_BOLD="/System/Library/Fonts/HelveticaNeue.ttc"

echo "=== Building NEWETHPOP validation video ==="

# Scene 1: Hook — "The academics got it wrong" over library footage
echo "Scene 1: Hook..."
ffmpeg -y -loglevel warning \
  -ss 5 -t 3 -i "$FOOTAGE/academic_library.mp4" \
  -vf "
    scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
    eq=brightness=-0.15,
    drawtext=text='The academics':fontfile=$FONT:fontsize=72:fontcolor=$WHITE:x=(w-text_w)/2:y=h*0.35:enable='between(t,0.3,3)',
    drawtext=text='got it wrong.':fontfile=$FONT:fontsize=72:fontcolor=$CYAN:x=(w-text_w)/2:y=h*0.35+90:enable='between(t,0.8,3)'
  " \
  -c:v libx264 -preset fast -crf 23 -an \
  "$OUT/scene1.mp4"

# Scene 2: Data — "95% of areas: diversity underestimated" over diverse crowd
echo "Scene 2: Data point..."
ffmpeg -y -loglevel warning \
  -ss 3 -t 4 -i "$FOOTAGE/diverse_crowd.mp4" \
  -vf "
    scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
    eq=brightness=-0.1,
    drawtext=text='In 95%% of areas':fontfile=$FONT:fontsize=60:fontcolor=$WHITE:x=(w-text_w)/2:y=h*0.30:enable='between(t,0.3,4)',
    drawtext=text='diversity grew FASTER':fontfile=$FONT:fontsize=60:fontcolor=$AMBER:x=(w-text_w)/2:y=h*0.30+80:enable='between(t,0.8,4)',
    drawtext=text='than the model predicted.':fontfile=$FONT:fontsize=48:fontcolor=$WHITE@0.8:x=(w-text_w)/2:y=h*0.30+160:enable='between(t,1.3,4)',
    drawtext=text='Mean error\\: 3.95 percentage points.':fontfile=$FONT:fontsize=40:fontcolor=$CYAN:x=(w-text_w)/2:y=h*0.70:enable='between(t,2.0,4)'
  " \
  -c:v libx264 -preset fast -crf 23 -an \
  "$OUT/scene2.mp4"

# Scene 3: Stat card — use the brand system OG card, zoom into it
echo "Scene 3: Stat card..."
ffmpeg -y -loglevel warning \
  -loop 1 -t 4 -i "$CARDS/newethpop-validation-2021_square.png" \
  -vf "
    scale=1080:1080,
    pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=$BG,
    drawtext=text='First published validation':fontfile=$FONT:fontsize=36:fontcolor=$WHITE@0.7:x=(w-text_w)/2:y=h*0.12:enable='between(t,0.5,4)',
    drawtext=text='of UK ethnic projections.':fontfile=$FONT:fontsize=36:fontcolor=$WHITE@0.7:x=(w-text_w)/2:y=h*0.12+50:enable='between(t,1.0,4)',
    drawtext=text='Nobody else has done this.':fontfile=$FONT:fontsize=40:fontcolor=$CYAN:x=(w-text_w)/2:y=h*0.85:enable='between(t,2.0,4)'
  " \
  -c:v libx264 -preset fast -crf 23 -an \
  "$OUT/scene3.mp4"

# Scene 4: CTA — "See the data" over abstract data footage
echo "Scene 4: CTA..."
ffmpeg -y -loglevel warning \
  -ss 2 -t 4 -i "$FOOTAGE/data_abstract.mp4" \
  -vf "
    scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
    eq=brightness=-0.2,
    drawtext=text='asylumstats.co.uk':fontfile=$FONT:fontsize=64:fontcolor=$CYAN:x=(w-text_w)/2:y=h*0.42:enable='between(t,0.3,4)',
    drawtext=text='Every number sourced.':fontfile=$FONT:fontsize=40:fontcolor=$WHITE@0.7:x=(w-text_w)/2:y=h*0.42+80:enable='between(t,1.0,4)',
    drawtext=text='Follow YOUR money.':fontfile=$FONT:fontsize=44:fontcolor=$AMBER:x=(w-text_w)/2:y=h*0.42+140:enable='between(t,1.5,4)'
  " \
  -c:v libx264 -preset fast -crf 23 -an \
  "$OUT/scene4.mp4"

# Concatenate all scenes
echo "Concatenating..."
cat > "$OUT/concat.txt" << EOF
file 'scene1.mp4'
file 'scene2.mp4'
file 'scene3.mp4'
file 'scene4.mp4'
EOF

ffmpeg -y -loglevel warning \
  -f concat -safe 0 -i "$OUT/concat.txt" \
  -c:v libx264 -preset medium -crf 20 \
  -movflags +faststart \
  "$OUT/newethpop_validation_reel.mp4"

echo "=== Done ==="
dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT/newethpop_validation_reel.mp4")
size=$(du -h "$OUT/newethpop_validation_reel.mp4" | cut -f1)
echo "Output: $OUT/newethpop_validation_reel.mp4"
echo "Duration: ${dur}s | Size: $size"
