#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一张 PNG 转成多尺寸 .ico（给 rcedit 写 exe 图标用）。

用法: python scripts/make-ico.py <源图.png> <输出.ico>

ICO 里每个尺寸存一份 PNG 数据（Vista 以后支持），比 BMP 条目简单且无损。
"""
import struct
import sys

from PySide6.QtCore import Qt
from PySide6.QtGui import QImage
from PySide6.QtWidgets import QApplication

SIZES = (16, 24, 32, 48, 64, 128, 256)


def png_bytes(img: QImage) -> bytes:
    """把 QImage 编码成 PNG 字节。"""
    from PySide6.QtCore import QBuffer, QByteArray

    ba = QByteArray()
    buf = QBuffer(ba)
    buf.open(QBuffer.WriteOnly)
    img.save(buf, "PNG")
    buf.close()
    return bytes(ba)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("用法: python scripts/make-ico.py <源图.png> <输出.ico>")
    src, dst = sys.argv[1], sys.argv[2]

    app = QApplication(sys.argv)  # noqa: F841  QImage 需要 QGuiApplication

    base = QImage(src)
    if base.isNull():
        raise SystemExit("读不到图片: " + src)

    entries = []
    for s in SIZES:
        scaled = base.scaled(s, s, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        entries.append((s, png_bytes(scaled)))

    # ICONDIR: reserved=0, type=1(icon), count
    out = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
    offset = 6 + 16 * len(entries)
    for s, data in entries:
        # 宽高为 256 时写 0
        out += struct.pack(
            "<BBBBHHII",
            s if s < 256 else 0,
            s if s < 256 else 0,
            0,        # 调色板数
            0,        # 保留
            1,        # 色彩平面
            32,       # 位深
            len(data),
            offset,
        )
        offset += len(data)
    for _s, data in entries:
        out += data

    with open(dst, "wb") as f:
        f.write(out)
    print("wrote %s（%d 个尺寸: %s）" % (dst, len(entries), ",".join(str(s) for s in SIZES)))


if __name__ == "__main__":
    main()
