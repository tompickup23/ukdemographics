#!/usr/bin/env python3
"""
Asylum Stats Data Reel Generator
=================================
Generates professional short-form video reels from data for X, Instagram, TikTok.

Architecture: Pillow frame generation + FFmpeg video encoding.
- No GPU needed, no moviepy dependency
- Runs on macOS or Linux (vps-main: 32GB, vps-news: skip - only 1GB)
- Produces 1080x1920 (portrait/story) and 1920x1080 (landscape) formats

Usage:
    python3 scripts/generate_data_reel.py --config reel_config.json
    python3 scripts/generate_data_reel.py --headline "..." --stats '[...]' --output out.mp4

Dependencies:
    pip install Pillow numpy
    ffmpeg must be installed (brew install ffmpeg / apt install ffmpeg)

Fonts:
    Uses project fonts from src/assets/fonts/ (Sora-ExtraBold, Manrope-Bold)
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FONT_DIR = PROJECT_ROOT / "src" / "assets" / "fonts"

# Brand palette
BRAND = {
    "bg":        (4,   7,  13),       # #04070d
    "bg_soft":   (11,  18, 32),       # #0b1220
    "ink":       (245, 247, 251),     # #f5f7fb
    "ink_soft":  (219, 231, 247),     # #dbe7f7
    "muted":     (145, 167, 196),     # #91a7c4
    "accent":    (6,   182, 212),     # #06b6d4 cyan
    "coral":     (239, 68,  68),      # #ef4444
    "success":   (16,  185, 129),     # #10b981
    "warning":   (245, 158, 11),      # #f59e0b
    "border":    (30,  41,  59),      # #1e293b
}

FPS = 30
PORTRAIT_SIZE = (1080, 1920)
LANDSCAPE_SIZE = (1920, 1080)


@dataclass
class StatItem:
    value: str           # Final display value, e.g. "£4.7B" or "127,834"
    label: str           # Description, e.g. "spent on asylum accommodation"
    numeric: float = 0   # Numeric value for count-up animation
    prefix: str = ""     # e.g. "£"
    suffix: str = ""     # e.g. "B" or "%"
    color: str = "accent"  # brand color key


@dataclass
class ReelConfig:
    headline: str                          # Hook text (first 2 seconds)
    stats: list                            # List of StatItem dicts
    source: str = "asylumstats.co.uk"      # Attribution
    verdict: str = ""                      # Optional verdict/conclusion
    music_path: Optional[str] = None       # Path to royalty-free audio
    bg_video_path: Optional[str] = None    # Path to background footage
    bg_image_path: Optional[str] = None    # Path to background still
    output_path: str = "reel_output.mp4"
    format: str = "portrait"               # "portrait" or "landscape"
    duration: float = 0                    # Auto-calculated if 0
    watermark: str = "asylumstats.co.uk"


# ---------------------------------------------------------------------------
# Font loading
# ---------------------------------------------------------------------------

_font_cache = {}

def get_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a project font, falling back to system fonts."""
    key = (name, size)
    if key in _font_cache:
        return _font_cache[key]

    paths_to_try = [
        FONT_DIR / f"{name}.ttf",
        Path(f"/usr/share/fonts/truetype/{name}.ttf"),
        Path(f"/System/Library/Fonts/{name}.ttf"),
    ]

    for p in paths_to_try:
        if p.exists():
            font = ImageFont.truetype(str(p), size)
            _font_cache[key] = font
            return font

    # Fallback to default
    try:
        font = ImageFont.truetype("Arial", size)
    except OSError:
        font = ImageFont.load_default()
    _font_cache[key] = font
    return font


def font_headline(size: int = 72) -> ImageFont.FreeTypeFont:
    return get_font("Sora-ExtraBold", size)


def font_body(size: int = 42) -> ImageFont.FreeTypeFont:
    return get_font("Manrope-Bold", size)


# ---------------------------------------------------------------------------
# Easing functions
# ---------------------------------------------------------------------------

def ease_out_cubic(t: float) -> float:
    """Deceleration curve - fast start, smooth stop."""
    return 1 - (1 - t) ** 3


def ease_out_expo(t: float) -> float:
    """Exponential deceleration - dramatic fast start."""
    return 1 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_in_out_quad(t: float) -> float:
    if t < 0.5:
        return 2 * t * t
    return 1 - (-2 * t + 2) ** 2 / 2


# ---------------------------------------------------------------------------
# Drawing primitives
# ---------------------------------------------------------------------------

def draw_rounded_rect(draw: ImageDraw.Draw, bbox, radius: int,
                      fill=None, outline=None, width: int = 0):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = bbox
    draw.rounded_rectangle(bbox, radius=radius, fill=fill,
                           outline=outline, width=width)


def draw_text_with_shadow(draw: ImageDraw.Draw, pos, text: str,
                          font: ImageFont.FreeTypeFont, fill, shadow_offset=3,
                          shadow_color=(0, 0, 0, 180)):
    """Draw text with a subtle drop shadow."""
    x, y = pos
    # Shadow
    draw.text((x + shadow_offset, y + shadow_offset), text,
              font=font, fill=shadow_color)
    # Main text
    draw.text((x, y), text, font=font, fill=fill)


def wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int,
              draw: ImageDraw.Draw) -> list:
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test_line = f"{current_line} {word}".strip()
        bbox = draw.textbbox((0, 0), test_line, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word

    if current_line:
        lines.append(current_line)
    return lines


def get_text_size(draw: ImageDraw.Draw, text: str,
                  font: ImageFont.FreeTypeFont) -> tuple:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


# ---------------------------------------------------------------------------
# Background generators
# ---------------------------------------------------------------------------

def make_gradient_bg(size: tuple, t: float = 0) -> Image.Image:
    """Generate an animated dark gradient background with subtle movement."""
    w, h = size
    img = Image.new("RGBA", size, BRAND["bg"])
    draw = ImageDraw.Draw(img)

    # Animated radial glow (cyan accent, moves slowly)
    glow_x = int(w * 0.3 + math.sin(t * 0.5) * w * 0.15)
    glow_y = int(h * 0.2 + math.cos(t * 0.3) * h * 0.1)
    glow_radius = int(min(w, h) * 0.6)

    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for r in range(glow_radius, 0, -4):
        alpha = int(18 * (r / glow_radius))
        glow_draw.ellipse(
            [glow_x - r, glow_y - r, glow_x + r, glow_y + r],
            fill=(6, 182, 212, alpha)
        )
    img = Image.alpha_composite(img, glow)

    # Second glow (coral, bottom right)
    glow2_x = int(w * 0.7 + math.cos(t * 0.4) * w * 0.1)
    glow2_y = int(h * 0.75 + math.sin(t * 0.6) * h * 0.08)
    glow2 = Image.new("RGBA", size, (0, 0, 0, 0))
    glow2_draw = ImageDraw.Draw(glow2)
    for r in range(int(glow_radius * 0.5), 0, -4):
        alpha = int(12 * (r / (glow_radius * 0.5)))
        glow2_draw.ellipse(
            [glow2_x - r, glow2_y - r, glow2_x + r, glow2_y + r],
            fill=(239, 68, 68, alpha)
        )
    img = Image.alpha_composite(img, glow2)

    # Grid overlay (subtle, matches website)
    grid = Image.new("RGBA", size, (0, 0, 0, 0))
    grid_draw = ImageDraw.Draw(grid)
    grid_spacing = 56  # Matches the 28px * 2 from CSS
    grid_alpha = 8
    for y_pos in range(0, h, grid_spacing):
        grid_draw.line([(0, y_pos), (w, y_pos)],
                       fill=(255, 255, 255, grid_alpha), width=1)
    for x_pos in range(0, w, grid_spacing):
        grid_draw.line([(x_pos, 0), (x_pos, h)],
                       fill=(255, 255, 255, grid_alpha), width=1)
    # Fade grid at bottom
    mask = Image.new("L", size, 0)
    mask_draw = ImageDraw.Draw(mask)
    for y_pos in range(h):
        alpha = int(255 * max(0, 1 - y_pos / (h * 0.7)))
        mask_draw.line([(0, y_pos), (w, y_pos)], fill=alpha)
    grid.putalpha(mask)
    img = Image.alpha_composite(img, grid)

    return img.convert("RGB")


def load_bg_video_frame(path: str, t: float, size: tuple) -> Image.Image:
    """Extract a frame from a background video at time t using ffmpeg."""
    cmd = [
        "ffmpeg", "-ss", str(t), "-i", path,
        "-vframes", "1", "-f", "image2pipe",
        "-vcodec", "png", "-s", f"{size[0]}x{size[1]}", "-"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=10)
        if result.returncode == 0 and result.stdout:
            from io import BytesIO
            frame = Image.open(BytesIO(result.stdout))
            # Darken for text readability
            dark = Image.new("RGBA", size, (4, 7, 13, 180))
            frame = frame.convert("RGBA")
            frame = Image.alpha_composite(frame, dark)
            return frame.convert("RGB")
    except Exception:
        pass
    return make_gradient_bg(size, t)


# ---------------------------------------------------------------------------
# Animation segments
# ---------------------------------------------------------------------------

def format_counting_number(value: float, prefix: str, suffix: str,
                           progress: float) -> str:
    """Format a number during count-up animation."""
    current = value * ease_out_expo(progress)

    if abs(value) >= 1_000_000_000:
        formatted = f"{current / 1_000_000_000:.1f}"
        unit = "B"
    elif abs(value) >= 1_000_000:
        formatted = f"{current / 1_000_000:.1f}"
        unit = "M"
    elif abs(value) >= 10_000:
        formatted = f"{int(current):,}"
        unit = ""
    elif value == int(value):
        formatted = f"{int(current):,}"
        unit = ""
    else:
        formatted = f"{current:.1f}"
        unit = ""

    return f"{prefix}{formatted}{unit}{suffix}"


class ReelTimeline:
    """Manages the timing of all animation segments."""

    def __init__(self, config: ReelConfig, size: tuple):
        self.config = config
        self.size = size
        self.w, self.h = size
        self.stats = []

        for s in config.stats:
            if isinstance(s, dict):
                self.stats.append(StatItem(**s))
            else:
                self.stats.append(s)

        # Parse numeric values from stat values for count-up
        for stat in self.stats:
            if stat.numeric == 0:
                stat.numeric = self._parse_numeric(stat.value)
                stat.prefix, stat.suffix = self._parse_affixes(stat.value)

        # Build timeline
        self.segments = self._build_timeline()
        self.total_duration = self.segments[-1]["end"]

    def _parse_numeric(self, value_str: str) -> float:
        """Extract numeric value from strings like '£4.7B', '127,834', '68%'."""
        clean = value_str.replace(",", "").replace(" ", "")
        num_str = ""
        for ch in clean:
            if ch.isdigit() or ch == ".":
                num_str += ch

        if not num_str:
            return 0

        base = float(num_str)

        upper = value_str.upper()
        if "B" in upper and "%" not in upper:
            base *= 1_000_000_000
        elif "M" in upper and "%" not in upper:
            base *= 1_000_000
        elif "K" in upper:
            base *= 1_000

        return base

    def _parse_affixes(self, value_str: str) -> tuple:
        """Extract prefix (e.g. $) and suffix (e.g. %) from value string."""
        prefix = ""
        suffix = ""
        for ch in value_str:
            if ch.isdigit() or ch == ".":
                break
            prefix += ch

        for ch in reversed(value_str):
            if ch.isdigit() or ch == ".":
                break
            suffix = ch + suffix

        # Don't include B/M/K as suffix - handled by format_counting_number
        if suffix.upper().rstrip() in ("B", "M", "K"):
            suffix = ""

        return prefix.strip(), suffix.strip()

    def _build_timeline(self) -> list:
        """Build animation timeline with segments."""
        segments = []
        t = 0

        # 1. Hook / headline (0 - 2.5s)
        segments.append({
            "type": "headline",
            "start": t,
            "end": t + 2.5,
            "fade_in": 0.4,
            "hold": 1.6,
            "fade_out": 0.5,
        })
        t += 2.5

        # 2. Stats (each stat gets ~3-4 seconds)
        for i, stat in enumerate(self.stats):
            duration = 3.5
            segments.append({
                "type": "stat",
                "index": i,
                "start": t,
                "end": t + duration,
                "count_up_duration": 1.8,  # How long the number counts up
                "label_delay": 0.6,        # Label appears after number starts
            })
            t += duration

        # 3. Verdict / conclusion (if provided)
        if self.config.verdict:
            segments.append({
                "type": "verdict",
                "start": t,
                "end": t + 3.0,
                "fade_in": 0.5,
            })
            t += 3.0

        # 4. Source / CTA
        segments.append({
            "type": "source",
            "start": t,
            "end": t + 2.0,
        })
        t += 2.0

        return segments

    def render_frame(self, t: float) -> Image.Image:
        """Render a single frame at time t."""
        # Background
        if self.config.bg_video_path and os.path.exists(self.config.bg_video_path):
            frame = load_bg_video_frame(self.config.bg_video_path, t, self.size)
        elif self.config.bg_image_path and os.path.exists(self.config.bg_image_path):
            frame = self._render_bg_image(t)
        else:
            frame = make_gradient_bg(self.size, t)

        frame = frame.convert("RGBA")

        # Find active segments and render them
        for seg in self.segments:
            if seg["start"] <= t < seg["end"]:
                local_t = t - seg["start"]
                seg_duration = seg["end"] - seg["start"]
                progress = local_t / seg_duration

                if seg["type"] == "headline":
                    self._render_headline(frame, local_t, seg)
                elif seg["type"] == "stat":
                    self._render_stat(frame, local_t, seg)
                elif seg["type"] == "verdict":
                    self._render_verdict(frame, local_t, seg)
                elif seg["type"] == "source":
                    self._render_source(frame, local_t, seg)

        # Always render persistent elements
        self._render_watermark(frame, t)
        self._render_progress_bar(frame, t)

        return frame.convert("RGB")

    def _render_bg_image(self, t: float) -> Image.Image:
        """Render background image with Ken Burns effect."""
        img = Image.open(self.config.bg_image_path).convert("RGB")
        # Slow zoom + pan
        zoom = 1.0 + 0.08 * (t / self.total_duration)
        new_w = int(self.w * zoom)
        new_h = int(self.h * zoom)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        # Pan slowly
        offset_x = int((new_w - self.w) * 0.5 * (1 + math.sin(t * 0.2)))
        offset_y = int((new_h - self.h) * 0.5 * (1 + math.cos(t * 0.15)))
        img = img.crop((offset_x, offset_y,
                         offset_x + self.w, offset_y + self.h))

        # Darken overlay
        dark = Image.new("RGBA", self.size, (4, 7, 13, 190))
        img = img.convert("RGBA")
        img = Image.alpha_composite(img, dark)
        return img.convert("RGB")

    def _render_headline(self, frame: Image.Image, local_t: float, seg: dict):
        """Render the hook/headline text with slide-up + fade-in."""
        draw = ImageDraw.Draw(frame)
        seg_dur = seg["end"] - seg["start"]

        # Fade calculation
        if local_t < seg["fade_in"]:
            alpha = ease_out_cubic(local_t / seg["fade_in"])
        elif local_t > seg_dur - seg["fade_out"]:
            alpha = ease_out_cubic((seg_dur - local_t) / seg["fade_out"])
        else:
            alpha = 1.0

        # Slide up from bottom
        slide_offset = int(60 * (1 - ease_out_cubic(min(1, local_t / 0.6))))

        # Render headline
        is_portrait = self.h > self.w
        font_size = 68 if is_portrait else 56
        font = font_headline(font_size)
        margin = int(self.w * 0.08)
        max_text_w = self.w - margin * 2

        lines = wrap_text(self.config.headline.upper(), font, max_text_w, draw)
        line_height = font_size + 12

        total_text_h = len(lines) * line_height
        start_y = (self.h // 2) - (total_text_h // 2) + slide_offset

        # Text overlay with alpha
        txt_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)

        for i, line in enumerate(lines):
            text_w, _ = get_text_size(txt_draw, line, font)
            x = (self.w - text_w) // 2
            y = start_y + i * line_height

            # Shadow
            a = int(140 * alpha)
            txt_draw.text((x + 3, y + 3), line, font=font, fill=(0, 0, 0, a))
            # Main text
            a = int(255 * alpha)
            txt_draw.text((x, y), line, font=font, fill=(*BRAND["ink"], a))

        # Accent underline
        if alpha > 0.3:
            line_w = int(min(max_text_w * 0.4, 300) * ease_out_cubic(
                min(1, local_t / 0.8)))
            line_x = (self.w - line_w) // 2
            line_y = start_y + total_text_h + 20
            a = int(255 * alpha)
            txt_draw.rectangle(
                [line_x, line_y, line_x + line_w, line_y + 4],
                fill=(*BRAND["accent"], a)
            )

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), txt_layer
        ), mask=txt_layer)

    def _render_stat(self, frame: Image.Image, local_t: float, seg: dict):
        """Render a stat with count-up number and sliding label."""
        stat = self.stats[seg["index"]]
        draw = ImageDraw.Draw(frame)
        seg_dur = seg["end"] - seg["start"]

        # Panel background (glassmorphism effect)
        panel_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        panel_draw = ImageDraw.Draw(panel_layer)

        is_portrait = self.h > self.w
        panel_margin = int(self.w * 0.06)
        panel_h = int(self.h * 0.28) if is_portrait else int(self.h * 0.45)
        panel_y = (self.h - panel_h) // 2
        panel_w = self.w - panel_margin * 2

        # Fade in panel
        panel_alpha = int(min(1, local_t / 0.3) * 200)
        draw_rounded_rect(
            panel_draw,
            [panel_margin, panel_y, panel_margin + panel_w, panel_y + panel_h],
            radius=28,
            fill=(11, 18, 32, panel_alpha),
            outline=(*BRAND["border"], min(255, panel_alpha + 30)),
            width=2,
        )

        # Accent stripe on left
        stripe_h = int(panel_h * 0.6 * ease_out_cubic(min(1, local_t / 0.5)))
        color = BRAND.get(stat.color, BRAND["accent"])
        stripe_y = panel_y + (panel_h - stripe_h) // 2
        panel_draw.rounded_rectangle(
            [panel_margin, stripe_y,
             panel_margin + 5, stripe_y + stripe_h],
            radius=3,
            fill=(*color, min(255, panel_alpha)),
        )

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), panel_layer
        ), mask=panel_layer)

        # Count-up number
        txt_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)

        count_progress = min(1, local_t / seg["count_up_duration"])
        color = BRAND.get(stat.color, BRAND["accent"])

        if stat.numeric > 0:
            display_value = format_counting_number(
                stat.numeric, stat.prefix, stat.suffix, count_progress
            )
        else:
            # Non-numeric stat, just fade in
            display_value = stat.value if count_progress > 0.1 else ""

        # Number rendering
        num_font_size = 88 if is_portrait else 72
        num_font = font_headline(num_font_size)
        num_alpha = int(255 * min(1, local_t / 0.3))

        if display_value:
            text_w, text_h = get_text_size(txt_draw, display_value, num_font)
            num_x = (self.w - text_w) // 2
            num_y = panel_y + int(panel_h * 0.25)

            # Glow effect behind number
            glow_alpha = int(40 * min(1, local_t / 0.5))
            for offset in range(8, 0, -2):
                txt_draw.text(
                    (num_x - offset, num_y - offset),
                    display_value, font=num_font,
                    fill=(*color, glow_alpha // 2)
                )

            txt_draw.text((num_x + 2, num_y + 2), display_value,
                          font=num_font, fill=(0, 0, 0, num_alpha // 2))
            txt_draw.text((num_x, num_y), display_value,
                          font=num_font, fill=(*color, num_alpha))

        # Label text (slides in after delay)
        label_t = local_t - seg["label_delay"]
        if label_t > 0:
            label_progress = min(1, label_t / 0.5)
            label_alpha = int(255 * ease_out_cubic(label_progress))
            slide = int(30 * (1 - ease_out_cubic(label_progress)))

            label_font_size = 36 if is_portrait else 30
            label_font = font_body(label_font_size)
            max_label_w = panel_w - int(panel_margin * 2)
            label_lines = wrap_text(stat.label, label_font, max_label_w, txt_draw)

            label_y_start = panel_y + int(panel_h * 0.58) + slide
            for i, line in enumerate(label_lines):
                lw, _ = get_text_size(txt_draw, line, label_font)
                lx = (self.w - lw) // 2
                ly = label_y_start + i * (label_font_size + 8)
                txt_draw.text((lx, ly), line, font=label_font,
                              fill=(*BRAND["ink_soft"], label_alpha))

        # Stat counter (e.g., "1 of 3")
        counter_t = local_t - 0.2
        if counter_t > 0:
            counter_alpha = int(180 * min(1, counter_t / 0.3))
            counter_font = font_body(22)
            counter_text = f"{seg['index'] + 1} / {len(self.stats)}"
            cw, _ = get_text_size(txt_draw, counter_text, counter_font)
            txt_draw.text(
                ((self.w - cw) // 2, panel_y + panel_h - 45),
                counter_text, font=counter_font,
                fill=(*BRAND["muted"], counter_alpha)
            )

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), txt_layer
        ), mask=txt_layer)

    def _render_verdict(self, frame: Image.Image, local_t: float, seg: dict):
        """Render verdict/conclusion text."""
        txt_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)

        alpha = int(255 * min(1, local_t / seg["fade_in"]))
        slide = int(40 * (1 - ease_out_cubic(min(1, local_t / 0.6))))

        is_portrait = self.h > self.w
        font_size = 52 if is_portrait else 44
        font = font_headline(font_size)
        margin = int(self.w * 0.1)
        lines = wrap_text(self.config.verdict.upper(), font,
                          self.w - margin * 2, txt_draw)

        line_h = font_size + 10
        total_h = len(lines) * line_h
        start_y = (self.h // 2) - (total_h // 2) + slide

        for i, line in enumerate(lines):
            tw, _ = get_text_size(txt_draw, line, font)
            x = (self.w - tw) // 2
            y = start_y + i * line_h
            txt_draw.text((x + 2, y + 2), line, font=font,
                          fill=(0, 0, 0, alpha // 2))
            txt_draw.text((x, y), line, font=font,
                          fill=(*BRAND["coral"], alpha))

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), txt_layer
        ), mask=txt_layer)

    def _render_source(self, frame: Image.Image, local_t: float, seg: dict):
        """Render source attribution and CTA."""
        txt_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)

        alpha = int(255 * min(1, local_t / 0.5))

        is_portrait = self.h > self.w

        # "Source:" label
        src_font = font_body(26)
        src_text = f"Source: {self.config.source}"
        sw, _ = get_text_size(txt_draw, src_text, src_font)
        src_y = self.h // 2 - 20
        txt_draw.text(((self.w - sw) // 2, src_y), src_text,
                      font=src_font, fill=(*BRAND["muted"], alpha))

        # URL CTA
        url_font = font_headline(38 if is_portrait else 32)
        url_text = "asylumstats.co.uk"
        uw, _ = get_text_size(txt_draw, url_text, url_font)
        url_y = src_y + 50
        txt_draw.text(((self.w - uw) // 2, url_y), url_text,
                      font=url_font, fill=(*BRAND["accent"], alpha))

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), txt_layer
        ), mask=txt_layer)

    def _render_watermark(self, frame: Image.Image, t: float):
        """Render persistent watermark."""
        txt_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)

        wm_font = font_body(18)
        wm_text = self.config.watermark
        ww, _ = get_text_size(txt_draw, wm_text, wm_font)

        is_portrait = self.h > self.w
        if is_portrait:
            x = self.w - ww - 24
            y = self.h - 80
        else:
            x = self.w - ww - 20
            y = self.h - 50

        alpha = int(100 * min(1, t / 1.0))
        txt_draw.text((x, y), wm_text, font=wm_font,
                      fill=(*BRAND["muted"], alpha))

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), txt_layer
        ), mask=txt_layer)

    def _render_progress_bar(self, frame: Image.Image, t: float):
        """Render a thin progress bar at the top."""
        bar_layer = Image.new("RGBA", self.size, (0, 0, 0, 0))
        bar_draw = ImageDraw.Draw(bar_layer)

        progress = t / self.total_duration
        bar_w = int(self.w * progress)
        bar_h = 4

        # Background
        bar_draw.rectangle([0, 0, self.w, bar_h],
                           fill=(255, 255, 255, 30))
        # Progress
        if bar_w > 0:
            bar_draw.rectangle([0, 0, bar_w, bar_h],
                               fill=(*BRAND["accent"], 200))

        frame.paste(Image.alpha_composite(
            Image.new("RGBA", self.size, (0, 0, 0, 0)), bar_layer
        ), mask=bar_layer)


# ---------------------------------------------------------------------------
# Video encoding
# ---------------------------------------------------------------------------

def render_reel(config: ReelConfig, use_pipe: bool = True) -> str:
    """Render the complete reel to an MP4 file.

    Args:
        config: Reel configuration
        use_pipe: If True, pipe raw frames directly to ffmpeg (no temp files,
                  lower disk I/O, better for VPS). If False, write PNGs then
                  stitch (slower but debuggable - frames saved to disk).
    """
    size = PORTRAIT_SIZE if config.format == "portrait" else LANDSCAPE_SIZE

    timeline = ReelTimeline(config, size)
    if config.duration > 0:
        total_duration = config.duration
    else:
        total_duration = timeline.total_duration

    total_frames = int(total_duration * FPS)
    output_path = config.output_path
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    print(f"Rendering {total_frames} frames at {FPS}fps "
          f"({total_duration:.1f}s, {size[0]}x{size[1]})")

    if use_pipe:
        return _render_piped(timeline, config, size, total_frames,
                             total_duration, output_path)
    else:
        return _render_file_based(timeline, config, size, total_frames,
                                  total_duration, output_path)


def _render_piped(timeline, config, size, total_frames,
                  total_duration, output_path) -> str:
    """Pipe raw RGB frames directly into ffmpeg stdin. No temp files."""
    w, h = size

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{w}x{h}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",  # stdin
    ]

    if config.music_path and os.path.exists(config.music_path):
        ffmpeg_cmd.extend(["-i", config.music_path, "-shortest"])

    ffmpeg_cmd.extend([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "20",
        "-movflags", "+faststart",
    ])

    if config.music_path and os.path.exists(config.music_path):
        ffmpeg_cmd.extend([
            "-c:a", "aac",
            "-b:a", "192k",
            "-af", f"afade=t=in:st=0:d=1,afade=t=out:st={total_duration-1.5}:d=1.5",
        ])

    ffmpeg_cmd.append(output_path)

    proc = subprocess.Popen(
        ffmpeg_cmd, stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )

    try:
        for frame_num in range(total_frames):
            t = frame_num / FPS
            frame = timeline.render_frame(t)
            # Write raw RGB bytes directly to ffmpeg
            proc.stdin.write(frame.tobytes())

            if frame_num % FPS == 0:
                print(f"  {frame_num}/{total_frames} frames "
                      f"({100 * frame_num / total_frames:.0f}%)")

        print(f"  {total_frames}/{total_frames} frames (100%)")
        proc.stdin.close()
        proc.wait()

        if proc.returncode != 0:
            stderr = proc.stderr.read().decode()
            raise RuntimeError(f"ffmpeg failed: {stderr[-500:]}")

    except BrokenPipeError:
        proc.wait()
        stderr = proc.stderr.read().decode()
        raise RuntimeError(f"ffmpeg pipe broken: {stderr[-500:]}")

    print(f"Output: {output_path}")
    file_size = os.path.getsize(output_path)
    print(f"Size: {file_size / 1024 / 1024:.1f} MB")
    return output_path


def _render_file_based(timeline, config, size, total_frames,
                       total_duration, output_path) -> str:
    """Write PNG frames to disk, then stitch with ffmpeg. Debuggable."""
    tmp_dir = tempfile.mkdtemp(prefix="asreel_")

    try:
        for frame_num in range(total_frames):
            t = frame_num / FPS
            frame = timeline.render_frame(t)
            frame_path = os.path.join(tmp_dir, f"frame_{frame_num:06d}.png")
            frame.save(frame_path, "PNG")

            if frame_num % FPS == 0:
                print(f"  {frame_num}/{total_frames} frames "
                      f"({100 * frame_num / total_frames:.0f}%)")

        print(f"  {total_frames}/{total_frames} frames (100%)")

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(tmp_dir, "frame_%06d.png"),
        ]

        if config.music_path and os.path.exists(config.music_path):
            ffmpeg_cmd.extend(["-i", config.music_path, "-shortest"])

        ffmpeg_cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "medium",
            "-crf", "20",
            "-movflags", "+faststart",
        ])

        if config.music_path and os.path.exists(config.music_path):
            ffmpeg_cmd.extend([
                "-c:a", "aac",
                "-b:a", "192k",
                "-af", f"afade=t=in:st=0:d=1,afade=t=out:st={total_duration-1.5}:d=1.5",
            ])

        ffmpeg_cmd.append(output_path)

        print(f"Encoding: {' '.join(ffmpeg_cmd)}")
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)

        print(f"Output: {output_path}")
        file_size = os.path.getsize(output_path)
        print(f"Size: {file_size / 1024 / 1024:.1f} MB")
        return output_path

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def render_both_formats(config: ReelConfig) -> list:
    """Render both portrait and landscape versions."""
    outputs = []

    base, ext = os.path.splitext(config.output_path)

    # Portrait
    config.format = "portrait"
    config.output_path = f"{base}_portrait{ext}"
    outputs.append(render_reel(config))

    # Landscape
    config.format = "landscape"
    config.output_path = f"{base}_landscape{ext}"
    outputs.append(render_reel(config))

    return outputs


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate asylum stats data reels"
    )
    parser.add_argument("--config", type=str,
                        help="JSON config file path")
    parser.add_argument("--headline", type=str,
                        help="Hook/headline text")
    parser.add_argument("--stats", type=str,
                        help='JSON array of stats: [{"value":"£4.7B","label":"spent"}]')
    parser.add_argument("--verdict", type=str, default="",
                        help="Verdict/conclusion text")
    parser.add_argument("--source", type=str, default="asylumstats.co.uk",
                        help="Source attribution")
    parser.add_argument("--music", type=str, default=None,
                        help="Path to background music")
    parser.add_argument("--bg-video", type=str, default=None,
                        help="Path to background video")
    parser.add_argument("--bg-image", type=str, default=None,
                        help="Path to background image")
    parser.add_argument("--output", type=str, default="reel_output.mp4",
                        help="Output file path")
    parser.add_argument("--format", type=str, default="portrait",
                        choices=["portrait", "landscape", "both"],
                        help="Output format")
    parser.add_argument("--demo", action="store_true",
                        help="Generate a demo reel with sample data")

    args = parser.parse_args()

    if args.demo:
        config = ReelConfig(
            headline="Where does YOUR money go?",
            stats=[
                {"value": "£4.7B", "label": "Spent on asylum accommodation since 2019", "color": "coral"},
                {"value": "127,834", "label": "People awaiting asylum decisions in the UK", "color": "accent"},
                {"value": "£175", "label": "Cost per person per night in hotels", "color": "warning"},
            ],
            verdict="Your tax. Zero accountability.",
            source="Home Office / NAO",
            output_path=args.output,
            format=args.format,
        )
    elif args.config:
        with open(args.config) as f:
            data = json.load(f)
        config = ReelConfig(**data)
    elif args.headline and args.stats:
        config = ReelConfig(
            headline=args.headline,
            stats=json.loads(args.stats),
            verdict=args.verdict,
            source=args.source,
            music_path=args.music,
            bg_video_path=args.bg_video,
            bg_image_path=args.bg_image,
            output_path=args.output,
            format=args.format,
        )
    else:
        parser.print_help()
        print("\nUse --demo for a sample reel, or provide --headline and --stats")
        sys.exit(1)

    if args.format == "both":
        outputs = render_both_formats(config)
        print(f"\nGenerated {len(outputs)} videos:")
        for o in outputs:
            print(f"  {o}")
    else:
        config.format = args.format
        render_reel(config)


if __name__ == "__main__":
    main()
