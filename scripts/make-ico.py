#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一张 PNG 转成多尺寸 .ico（给 rcedit 写 exe 图标用）。

用法: python scripts/make-ico.py <源图.png> <输出.ico>

用 Pillow 生成 ICO（内部每个尺寸存 PNG 条目，Vista+ 支持，无损）。
相比旧版 PySide6 方案，Pillow 体积小、CI 里一行 pip 即可安装。
"""
import sys

from PIL import Image

SIZES = (16, 24, 32, 48, 64, 128, 256)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("用法: python scripts/make-ico.py <源图.png> <输出.ico>")
    src, dst = sys.argv[1], sys.argv[2]

    img = Image.open(src).convert("RGBA")
    # Pillow 的 ICO 保存直接支持多尺寸条目；256 会自动按规范写 0。
    img.save(dst, format="ICO", sizes=[(s, s) for s in SIZES])
    print("wrote %s（%d 个尺寸: %s）" % (dst, len(SIZES), ",".join(str(s) for s in SIZES)))


if __name__ == "__main__":
    main()
