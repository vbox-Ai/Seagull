# -*- coding: utf-8 -*-
"""about_probe2.py — 置顶 <项目A> → 点击「帮助(H)」→ 全屏抓菜单 → 可选点击第 N 项
用法: python about_probe2.py <tag> [--item N] [--wx 985] [--wy 73] [--dy 22]
"""
import ctypes, ctypes.wintypes as wt, os, sys, time

u32 = ctypes.WinDLL('user32'); g32 = ctypes.WinDLL('gdi32')
u32.SetProcessDPIAware()
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs'))
os.makedirs(OUT, exist_ok=True)

HWND_TOPMOST, HWND_NOTOPMOST = -1, -2
SWP_NOMOVE, SWP_NOSIZE = 0x0002, 0x0001


def find_xy():
    res = []
    CB = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)

    def cb(h, l):
        c = ctypes.create_unicode_buffer(128); u32.GetClassNameW(h, c, 128)
        n = u32.GetWindowTextLengthW(h); b = ctypes.create_unicode_buffer(n + 2)
        u32.GetWindowTextW(h, b, n + 2)
        if c.value == 'ThunderRT6FormDC' and '<项目A>' in b.value:
            res.append(h)
        return True
    u32.EnumWindows(CB(cb), 0)
    return res


def shot_full(path):
    w = u32.GetSystemMetrics(0); h = u32.GetSystemMetrics(1)
    hdc = u32.GetDC(0); mdc = g32.CreateCompatibleDC(hdc)
    bmp = g32.CreateCompatibleBitmap(hdc, w, h); g32.SelectObject(mdc, bmp)
    g32.BitBlt(mdc, 0, 0, w, h, hdc, 0, 0, 0x00CC0020)
    bi = ctypes.create_string_buffer(40 + 1024)
    for off, val, sz in ((0, 40, 4), (4, w, 4), (8, -h, 4), (12, 1, 2), (14, 32, 2)):
        v = ctypes.c_int32(val) if sz == 4 else ctypes.c_uint16(val)
        ctypes.memmove(ctypes.byref(bi, off), ctypes.byref(v), sz)
    buf = ctypes.create_string_buffer(w * h * 4)
    g32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.byref(bi), 0)
    g32.DeleteObject(bmp); g32.DeleteDC(mdc); u32.ReleaseDC(0, hdc)
    hdr = b'BM' + (14 + 40 + len(buf.raw)).to_bytes(4, 'little') + b'\x00' * 4 + (54).to_bytes(4, 'little')
    hdr += (40).to_bytes(4, 'little') + w.to_bytes(4, 'little', signed=True) + (-h).to_bytes(4, 'little', signed=True)
    hdr += (1).to_bytes(2, 'little') + (32).to_bytes(2, 'little') + (0).to_bytes(4, 'little')
    hdr += len(buf.raw).to_bytes(4, 'little') + (2835).to_bytes(4, 'little') + (2835).to_bytes(4, 'little') + b'\x00' * 8
    open(path, 'wb').write(hdr + buf.raw)


def grab_win(h, path):
    r = wt.RECT(); u32.GetWindowRect(h, ctypes.byref(r))
    w, ht = r.right - r.left, r.bottom - r.top
    if w <= 0 or ht <= 0:
        return None
    hdc = u32.GetWindowDC(h); mdc = g32.CreateCompatibleDC(hdc)
    bmp = g32.CreateCompatibleBitmap(hdc, w, ht); g32.SelectObject(mdc, bmp)
    if not u32.PrintWindow(h, mdc, 2):
        g32.BitBlt(mdc, 0, 0, w, ht, hdc, 0, 0, 0x00CC0020)
    bi = ctypes.create_string_buffer(40 + 1024)
    for off, val, sz in ((0, 40, 4), (4, w, 4), (8, -ht, 4), (12, 1, 2), (14, 32, 2)):
        v = ctypes.c_int32(val) if sz == 4 else ctypes.c_uint16(val)
        ctypes.memmove(ctypes.byref(bi, off), ctypes.byref(v), sz)
    buf = ctypes.create_string_buffer(w * ht * 4)
    g32.GetDIBits(mdc, bmp, 0, ht, buf, ctypes.byref(bi), 0)
    g32.DeleteObject(bmp); g32.DeleteDC(mdc); u32.ReleaseDC(h, hdc)
    hdr = b'BM' + (14 + 40 + len(buf.raw)).to_bytes(4, 'little') + b'\x00' * 4 + (54).to_bytes(4, 'little')
    hdr += (40).to_bytes(4, 'little') + w.to_bytes(4, 'little', signed=True) + (-ht).to_bytes(4, 'little', signed=True)
    hdr += (1).to_bytes(2, 'little') + (32).to_bytes(2, 'little') + (0).to_bytes(4, 'little')
    hdr += len(buf.raw).to_bytes(4, 'little') + (2835).to_bytes(4, 'little') + (2835).to_bytes(4, 'little') + b'\x00' * 8
    open(path, 'wb').write(hdr + buf.raw)
    return (r.left, r.top, w, ht)


def click(x, y):
    u32.SetCursorPos(int(x), int(y)); time.sleep(0.4)
    u32.mouse_event(0x0002, 0, 0, 0, 0); time.sleep(0.12)
    u32.mouse_event(0x0004, 0, 0, 0, 0); time.sleep(1.0)


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else 'x'
    item = int(sys.argv[sys.argv.index('--item') + 1]) if '--item' in sys.argv else None
    wx = int(sys.argv[sys.argv.index('--wx') + 1]) if '--wx' in sys.argv else 985
    wy = int(sys.argv[sys.argv.index('--wy') + 1]) if '--wy' in sys.argv else 73
    dy = int(sys.argv[sys.argv.index('--dy') + 1]) if '--dy' in sys.argv else 22

    h = find_xy()[0]
    u32.ShowWindow(h, 9)
    u32.SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
    u32.SetForegroundWindow(h); u32.BringWindowToTop(h)
    time.sleep(1.2)
    r = wt.RECT(); u32.GetWindowRect(h, ctypes.byref(r))
    print('[*] 主窗 rect L=%d T=%d W=%d H=%d' % (r.left, r.top, r.right - r.left, r.bottom - r.top))
    print('[*] fg=%s' % hex(u32.GetForegroundWindow()))

    click(r.left + wx, r.top + wy)
    p = os.path.join(OUT, 'ap2_%s_1menu.bmp' % tag)
    shot_full(p)
    print('[*] -> %s' % p)

    if item is not None:
        click(r.left + wx, r.top + wy + dy * item)
        p2 = os.path.join(OUT, 'ap2_%s_2item.bmp' % tag)
        shot_full(p2)
        print('[*] -> %s' % p2)

    print('[*] 顶层窗口:')
    CB = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)

    def cb(hh, l):
        if u32.IsWindowVisible(hh):
            c = ctypes.create_unicode_buffer(128); u32.GetClassNameW(hh, c, 128)
            n = u32.GetWindowTextLengthW(hh); b = ctypes.create_unicode_buffer(n + 2)
            u32.GetWindowTextW(hh, b, n + 2)
            rr = wt.RECT(); u32.GetWindowRect(hh, ctypes.byref(rr))
            if (rr.right - rr.left) > 150 and (rr.bottom - rr.top) > 100:
                print('   0x%X %-24s "%s" (%d,%d %dx%d)' % (
                    hh, c.value, b.value[:44], rr.left, rr.top, rr.right - rr.left, rr.bottom - rr.top))
        return True
    u32.EnumWindows(CB(cb), 0)

    # 抓取所有 <项目A> 进程的非主窗（如关于框）
    import subprocess
    res = subprocess.run(['powershell', '-NoProfile', '-Command',
                          '(Get-Process <项目A> -EA SilentlyContinue).Id'], capture_output=True, text=True)
    pids = set(int(x) for x in res.stdout.split() if x.isdigit())

    def cb2(hh, l):
        if u32.IsWindowVisible(hh):
            pp = wt.DWORD(); u32.GetWindowThreadProcessId(hh, ctypes.byref(pp))
            if pp.value in pids and hh != h:
                c = ctypes.create_unicode_buffer(128); u32.GetClassNameW(hh, c, 128)
                n = u32.GetWindowTextLengthW(hh); b = ctypes.create_unicode_buffer(n + 2)
                u32.GetWindowTextW(hh, b, n + 2)
                rr = wt.RECT(); u32.GetWindowRect(hh, ctypes.byref(rr))
                w_, h_ = rr.right - rr.left, rr.bottom - rr.top
                if w_ > 200 and h_ > 150:
                    q = os.path.join(OUT, 'ap2_%s_win_%X.bmp' % (tag, hh))
                    grab_win(hh, q)
                    print('   [子窗] 0x%X %s "%s" (%dx%d) -> %s' % (hh, c.value, b.value[:40], w_, h_, q))
        return True
    u32.EnumWindows(CB(cb2), 0)

    u32.SetWindowPos(h, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
    print('[*] 已恢复 Z 序')


if __name__ == '__main__':
    main()
