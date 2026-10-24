#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一张图做成应用图标（免费版 + 付费版）。

用法:
    python scripts/make-icon.py <源图路径> [--free 输出.png] [--pro 输出.png]
                             [--radius 像素] [--focus 0.5,0.42]

处理：居中裁成正方形 → 缩放 → 可选圆角 → 输出 512 与 256 两个尺寸。
electron-builder 要求图标至少 256×256，512 更稳。
"""
import argparse
import os
import sys

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QImage, QPainter, QPainterPath, QPixmap
from PySide6.QtWidgets import QApplication

SIZE = 512


def load_square(src: str, focus_y: float) -> QImage:
    """居中裁成正方形。focus_y 控制纵向取景（0=顶部，1=底部）。"""
    img = QImage(src)
    if img.isNull():
        raise SystemExit("读不到图片: " + src)
    w, h = img.width(), img.height()
    side = min(w, h)
    x = (w - side) // 2
    # 竖图时允许偏向 focus_y，横图则垂直居中
    if h > w:
        y = int((h - side) * max(0.0, min(1.0, focus_y)))
    else:
        y = (h - side) // 2
    return img.copy(x, y, side, side)


def render(square: QImage, radius: int) -> QPixmap:
    scaled_img = square.scaled(SIZE, SIZE, Qt.KeepAspectRatio, Qt.SmoothTransformation)
    # QPainter.drawPixmap 对 QImage 的重载在 PySide6 下匹配不稳，先转 QPixmap
    scaled = QPixmap.fromImage(scaled_img)
    out = QPixmap(SIZE, SIZE)
    out.fill(Qt.transparent)
    p = QPainter(out)
    p.setRenderHint(QPainter.Antialiasing)
    p.setRenderHint(QPainter.SmoothPixmapTransform)
    if radius > 0:
        path = QPainterPath()
        path.addRoundedRect(QRectF(0, 0, SIZE, SIZE), radius, radius)
        p.setClipPath(path)
    p.drawPixmap(0, 0, scaled)
    p.end()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--free", default="build/icon.png")
    ap.add_argument("--pro", default="build/icon-pro.png")
    ap.add_argument("--radius", type=int, default=0, help="圆角半径（512 尺寸下的像素），0=直角")
    ap.add_argument("--focus", default="0.42", help="竖图纵向取景 0~1，默认 0.42（偏上，留住脸）")
    ap.add_argument("--only", choices=["free", "pro"], help="只出一张")
    args = ap.parse_args()

    app = QApplication(sys.argv)  # noqa: F841  QImage/QPixmap 需要 QGuiApplication

    focus_y = float(args.focus)
    square = load_square(args.src, focus_y)
    pm = render(square, args.radius)

    targets = []
    if args.only != "pro":
        targets.append(args.free)
    if args.only != "free":
        targets.append(args.pro)

    for out in targets:
        os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
        pm.save(out, "PNG")
        small = out.replace(".png", "-256.png")
        pm.scaled(256, 256, Qt.KeepAspectRatio, Qt.SmoothTransformation).save(small, "PNG")
        print("wrote %s (%dx%d) 与 %s" % (out, SIZE, SIZE, os.path.basename(small)))


if __name__ == "__main__":
    main()
