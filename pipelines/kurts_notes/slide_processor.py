"""Core slide processing logic for Kurt's Notes pipeline.

Handles PDF slide extraction, text OCR, AI classification,
AI card generation, and image blocking.
"""

import base64
import io
import json
import os
from dataclasses import dataclass
from typing import Dict, List, Tuple

import fitz
from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image, ImageDraw


@dataclass
class TextSpan:
    """A piece of text with its position and formatting."""
    index: int
    text: str
    bbox: fitz.Rect
    is_bold: bool = False
    is_italic: bool = False
    color: str = "black"
    font_size: float = 0
    line_no: int = 0

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API"))


# ── Slide extraction ──────────────────────────────────────────


def find_slide_regions(doc: fitz.Document, page_num: int) -> List[fitz.Rect]:
    """Find slide regions by detecting horizontal separators."""
    page = doc[page_num]
    page_height = page.rect.height
    page_width = page.rect.width

    drawings = page.get_drawings()
    h_lines_y = []

    for d in drawings:
        if "items" in d:
            for item in d["items"]:
                if item[0] == "l":
                    p1, p2 = item[1], item[2]
                    if abs(p1.y - p2.y) < 2 and abs(p1.x - p2.x) > page_width * 0.5:
                        h_lines_y.append(p1.y)

    h_lines_y = sorted(set(h_lines_y))
    merged = []
    for y in h_lines_y:
        if not merged or y - merged[-1] > 5:
            merged.append(y)

    regions = []
    boundaries = [0] + merged + [page_height]

    for i in range(len(boundaries) - 1):
        y_start = boundaries[i]
        y_end = boundaries[i + 1]
        if y_end - y_start < 50:
            continue
        regions.append(fitz.Rect(0, y_start, page_width, y_end))

    return regions


# ── Text extraction ───────────────────────────────────────────


def get_text_spans(page: fitz.Page, clip: fitz.Rect) -> List[TextSpan]:
    """Extract all text spans from a page region with formatting info."""
    spans = []

    words_data = page.get_text("words", clip=clip)
    text_dict = page.get_text("dict", clip=clip)
    formatting_map = {}

    for block in text_dict.get("blocks", []):
        if "lines" not in block:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                font = span.get("font", "")
                flags = span.get("flags", 0)
                color_int = span.get("color", 0)
                font_size = span.get("size", 0)

                is_bold = (
                    bool(flags & 16)
                    or "bold" in font.lower()
                    or "black" in font.lower()
                )
                is_italic = (
                    bool(flags & 2)
                    or "italic" in font.lower()
                    or "oblique" in font.lower()
                )

                if color_int == 0:
                    color = "black"
                else:
                    r = (color_int >> 16) & 0xFF
                    g = (color_int >> 8) & 0xFF
                    b = color_int & 0xFF
                    color = (
                        "black"
                        if r == 0 and g == 0 and b == 0
                        else f"#{r:02x}{g:02x}{b:02x}"
                    )

                bbox = span["bbox"]
                center_y = (bbox[1] + bbox[3]) / 2
                formatting_map[(bbox[0], center_y)] = {
                    "is_bold": is_bold,
                    "is_italic": is_italic,
                    "color": color,
                    "font_size": font_size,
                    "x1": bbox[2],
                }

    line_y_positions = {}
    for word_info in words_data:
        x0, y0, x1, y1, word, block_no, line_no, word_no = word_info
        key = (block_no, line_no)
        if key not in line_y_positions:
            line_y_positions[key] = len(line_y_positions)

    for word_info in words_data:
        x0, y0, x1, y1, word, block_no, line_no, word_no = word_info
        word = word.strip()
        if not word or len(word) <= 1:
            continue

        word_center_y = (y0 + y1) / 2
        best_match = None
        best_dist = float("inf")

        for (sx0, sy), fmt in formatting_map.items():
            if abs(sy - word_center_y) < 5 and sx0 <= x0 <= fmt["x1"] + 10:
                dist = abs(sy - word_center_y)
                if dist < best_dist:
                    best_dist = dist
                    best_match = fmt

        if best_match is None:
            best_match = {
                "is_bold": False,
                "is_italic": False,
                "color": "black",
                "font_size": 0,
            }

        seq_line_no = line_y_positions.get((block_no, line_no), 0)

        spans.append(
            TextSpan(
                index=len(spans),
                text=word,
                bbox=fitz.Rect(x0, y0, x1, y1),
                is_bold=best_match["is_bold"],
                is_italic=best_match["is_italic"],
                color=best_match["color"],
                font_size=best_match["font_size"],
                line_no=seq_line_no,
            )
        )

    return spans


# ── Image rendering & blocking ────────────────────────────────


def render_region(page: fitz.Page, clip: fitz.Rect, dpi: int = 200) -> Image.Image:
    """Render a page region to PIL Image."""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    return Image.frombytes("RGB", [pix.width, pix.height], pix.samples)


def block_spans(
    img: Image.Image,
    spans: List[TextSpan],
    clip: fitz.Rect,
    dpi: int = 200,
    color: Tuple[int, int, int] = (0, 0, 0),
) -> Image.Image:
    """Block specific text spans on an image."""
    blocked = img.copy()
    draw = ImageDraw.Draw(blocked)
    scale = dpi / 72

    for span in spans:
        x0 = (span.bbox.x0 - clip.x0) * scale
        y0 = (span.bbox.y0 - clip.y0) * scale
        x1 = (span.bbox.x1 - clip.x0) * scale
        y1 = (span.bbox.y1 - clip.y0) * scale

        padding_x = 6
        padding_y = 4
        x0 = max(0, x0 - padding_x)
        y0 = max(0, y0 - padding_y)
        x1 = min(img.width, x1 + padding_x)
        y1 = min(img.height, y1 + padding_y)

        draw.rectangle([x0, y0, x1, y1], fill=color)

    return blocked


def block_multiple_regions(
    img: Image.Image,
    region_spans: List[List[TextSpan]],
    clip: fitz.Rect,
    dpi: int = 200,
    color: Tuple[int, int, int] = (0, 0, 0),
) -> Image.Image:
    """Block multiple regions of text spans on an image."""
    blocked = img.copy()
    draw = ImageDraw.Draw(blocked)
    scale = dpi / 72

    for spans in region_spans:
        for span in spans:
            x0 = (span.bbox.x0 - clip.x0) * scale
            y0 = (span.bbox.y0 - clip.y0) * scale
            x1 = (span.bbox.x1 - clip.x0) * scale
            y1 = (span.bbox.y1 - clip.y0) * scale

            padding_x = 6
            padding_y = 4
            x0 = max(0, x0 - padding_x)
            y0 = max(0, y0 - padding_y)
            x1 = min(img.width, x1 + padding_x)
            y1 = min(img.height, y1 + padding_y)

            draw.rectangle([x0, y0, x1, y1], fill=color)

    return blocked


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64."""
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode()


# ── AI classification & generation ────────────────────────────

SLIDE_CLASSIFICATION_PROMPT = """Classify this medical education slide.

Look at the image and determine if this slide is worth creating flashcards from.

SKIP slides that are:
- Title slides (just a title, no educational content)
- Outline/agenda slides (list of topics to cover)
- "Thank you" / Q&A / reference slides
- Transitional slides ("Now let's discuss...", "Moving on to...")
- Slides with only images and no testable facts
- Acknowledgment/attribution slides

PROCESS slides that have:
- Factual medical content
- Diagnostic criteria
- Classifications or categories
- Key terms and definitions
- Clinical features or findings
- Tables with data
- Diagrams with labeled parts

Respond in JSON:
{{
  "should_process": true|false,
  "skip_reason": "<if skipping, explain why>" | null,
  "slide_type": "content|title|outline|transition|reference|other"
}}
"""

CARD_GENERATION_PROMPT = """You are creating HIGH-QUALITY, CONSOLIDATED flashcards from a medical education slide.

I will give you:
1. An image of the slide (for context)
2. A numbered list of all text items on the slide with their indices and formatting
3. The TOTAL NUMBER of text items (word count)

Text items may have formatting tags in brackets:
- [bold] = bold text - often important terms
- [italic] = italic text - often emphasized
- [color:#rrggbb] = colored text - author highlighted this

## PHILOSOPHY: QUALITY OVER QUANTITY

Create FEWER, BETTER cards that test understanding, not just recall.
- Consolidate related facts into single comprehensive cards
- Test concepts holistically, not atomically
- If you would create 5 cards for 5 related features, create 1 card that tests all 5

## CARD LIMITS (STRICT)

Target: 3-5 total cards per slide (occlusion + text combined)
- Minimum: 2 cards (if enough meaningful content)
- Maximum: 6 cards (only for very dense slides)

## MULTI-REGION OCCLUSION (NEW APPROACH)

Instead of hiding ONE thing per card, hide 3-5 related items SIMULTANEOUSLY.
The learner sees all regions blocked at once and must recall ALL of them.

Example - instead of 4 separate cards:
- Card 1: hide "pyknotic"
- Card 2: hide "polygonal"
- Card 3: hide "eosinophilic"
- Card 4: hide "superficial"

Create 1 card that hides all 4 related terms:
- hide_indices: [[12], [15], [18], [22]]  (array of arrays!)
- question: "What are the key features of superficial squamous cells?"
- answer: "pyknotic nuclei, polygonal shape, eosinophilic cytoplasm, superficial location"

## OCCLUSION RULES

- hide_indices is now an ARRAY OF ARRAYS - each inner array is one region to block
- Each region can be 1-3 consecutive indices (a word or short phrase)
- Group related items that test the same concept
- 3-5 regions per occlusion card is ideal
- **CRITICAL: All indices in one region must be on the SAME LINE**

Good groupings:
- All features of a cell type: hide nucleus description + cytoplasm + shape + location
- All items in a differential: hide Disease A + Disease B + Disease C
- All steps in a process: hide Step 1 + Step 2 + Step 3

## IMPORTANCE TAGGING

Tag each card as:
- "core": Essential concept, must know for boards
- "supporting": Reinforces core concepts, good to know

## QUALITY GRADING

Grade each card's quality:
- "A": Tests key concept clearly, well-formed question
- "B": Valid but tests peripheral detail or less elegantly worded
- "C": Low-value, obvious, or better covered by another card

## CONSOLIDATED TEXT CARDS

For Q/A cards, prefer SYNTHESIS questions over atomic facts:

BAD (atomic):
- "What is the N:C ratio in HSIL?" -> "High"
- "What is the chromatin in HSIL?" -> "Coarse"
- "What is the cell size in HSIL?" -> "Small"

GOOD (consolidated):
- "Describe the cytomorphologic features of HSIL" -> "High N:C ratio, coarse chromatin, small cell size, irregular nuclear membranes"

TEXT ITEMS ON THIS SLIDE:
{text_list}

Respond in JSON:
{{
  "slide_topic": "<main topic>",
  "occlusion_cards": [
    {{
      "hide_indices": [[5, 6], [12], [18, 19], [25]],
      "question": "<question testing all hidden regions together>",
      "answer": "<combined answer covering all hidden items>",
      "importance": "core|supporting",
      "quality": "A|B|C"
    }}
  ],
  "text_cards": [
    {{
      "type": "qa",
      "question": "<consolidated, self-contained question>",
      "answer": "<comprehensive answer>",
      "importance": "core|supporting",
      "quality": "A|B|C"
    }},
    {{
      "type": "cloze",
      "text": "<sentence with [key term] to fill in>",
      "importance": "core|supporting",
      "quality": "A|B|C"
    }}
  ]
}}

CRITICAL RULES:
1. MAX 6 cards total per slide (aim for 3-5)
2. Consolidate - 1 comprehensive card beats 5 atomic cards
3. Multi-region occlusions - hide 3-5 related items per card
4. Text cards must be SELF-CONTAINED (no image shown)
5. Tag importance (core/supporting) and quality (A/B/C) on every card
6. NEVER create C-quality cards - if it would be C, don't include it
"""


def classify_slide(img: Image.Image) -> dict:
    """Classify a slide to determine if it should be processed."""
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SLIDE_CLASSIFICATION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_to_base64(img)}",
                            "detail": "low",
                        },
                    },
                ],
            }
        ],
        max_tokens=200,
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)


def format_span_for_ai(span: TextSpan) -> str:
    """Format a text span with its formatting info for AI."""
    tags = []
    if span.is_bold:
        tags.append("bold")
    if span.is_italic:
        tags.append("italic")
    if span.color != "black":
        tags.append(f"color:{span.color}")

    if tags:
        return f'{span.index}: "{span.text}" [{", ".join(tags)}]'
    else:
        return f'{span.index}: "{span.text}"'


def format_text_list_by_lines(text_spans: List[TextSpan]) -> str:
    """Format text spans grouped by line, so AI knows line boundaries."""
    if not text_spans:
        return ""

    lines: Dict[int, List[TextSpan]] = {}
    for span in text_spans:
        if span.line_no not in lines:
            lines[span.line_no] = []
        lines[span.line_no].append(span)

    output_parts = []
    for line_no in sorted(lines.keys()):
        line_spans = lines[line_no]
        span_strs = [format_span_for_ai(s) for s in line_spans]
        output_parts.append(f"[LINE {line_no}] " + "  ".join(span_strs))

    return "\n".join(output_parts)


def generate_cards_for_slide(img: Image.Image, text_spans: List[TextSpan]) -> dict:
    """Use AI to generate cards based on slide image and text list."""
    text_list = format_text_list_by_lines(text_spans)
    word_count = len(text_spans)
    text_list_with_count = f"TOTAL TEXT ITEMS: {word_count}\n\n{text_list}"

    prompt = CARD_GENERATION_PROMPT.format(text_list=text_list_with_count)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_to_base64(img)}",
                            "detail": "high",
                        },
                    },
                ],
            }
        ],
        max_tokens=2500,
        response_format={"type": "json_object"},
    )

    return json.loads(response.choices[0].message.content)
