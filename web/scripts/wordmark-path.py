"""
把字標「Luné」轉成 SVG 路徑（Outfit 300、字距 0.16em），給 docs/brand/ 的向量檔用，不依賴字型。

用法（需要 fonttools：python -m pip install fonttools）：
  python scripts/wordmark-path.py <Outfit[wght].ttf 的路徑> [文字] [字重] [字距 em]
輸出 JSON：{"d": 路徑, "width": 寬, "ascent": 上緣, "capHeight": 大寫高度, "unitsPerEm": 1000}
座標：基線在 y=0，往上是負值（SVG 方向），單位是字型單位（1em = unitsPerEm）。
原始字檔：https://github.com/google/fonts/tree/main/ofl/outfit（SIL OFL 1.1）
"""

import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    source = sys.argv[1]
    text = sys.argv[2] if len(sys.argv) > 2 else "Luné"
    weight = float(sys.argv[3]) if len(sys.argv) > 3 else 300
    tracking_em = float(sys.argv[4]) if len(sys.argv) > 4 else 0.16

    font = instantiateVariableFont(TTFont(source), {"wght": weight})
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    tracking = tracking_em * upem

    pen = SVGPathPen(glyphs)
    x = 0.0
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        # 字型座標 y 往上；SVG 往下 → 垂直翻轉
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        x += hmtx[name][0] + (tracking if i < len(text) - 1 else 0)

    os2 = font["OS/2"]
    print(
        json.dumps(
            {
                "d": pen.getCommands(),
                "width": round(x, 1),
                "ascent": font["hhea"].ascent,
                "capHeight": getattr(os2, "sCapHeight", 700),
                "unitsPerEm": upem,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
