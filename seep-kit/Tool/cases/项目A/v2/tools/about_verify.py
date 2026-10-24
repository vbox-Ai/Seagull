# -*- coding: utf-8 -*-
"""about_verify.py — 启动前内存打补丁 → 启动 → 打开「关于」→ 抓图
用法: python about_verify.py <tag> [--extra rva:hex ...]
默认补丁 = 3 处激活补丁。
"""
import ctypes, ctypes.wintypes as wt, os, sys, time, struct, subprocess

k32 = ctypes.WinDLL('kernel32', use_last_error=True)
u32 = ctypes.WinDLL('user32'); u32.SetProcessDPIAware()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import about_probe2 as A

EXE = r'D:\Data\<项目A>\<项目A>.exe'; DIR = os.path.dirname(EXE)
ACT = [(0x670CB1, '31c0'), (0x670BFF, '66c7000000'), (0x670CD5, '66c7000000')]


class SI(ctypes.Structure):
    _fields_ = [('cb', wt.DWORD), ('lpReserved', wt.LPWSTR), ('lpDesktop', wt.LPWSTR), ('lpTitle', wt.LPWSTR),
                ('dwX', wt.DWORD), ('dwY', wt.DWORD), ('dwXSize', wt.DWORD), ('dwYSize', wt.DWORD),
                ('dwXCountChars', wt.DWORD), ('dwYCountChars', wt.DWORD), ('dwFillAttribute', wt.DWORD),
                ('dwFlags', wt.DWORD), ('wShowWindow', wt.WORD), ('cbReserved2', wt.WORD),
                ('lpReserved2', ctypes.POINTER(ctypes.c_byte)), ('hStdInput', wt.HANDLE),
                ('hStdOutput', wt.HANDLE), ('hStdError', wt.HANDLE)]


class PI(ctypes.Structure):
    _fields_ = [('hProcess', wt.HANDLE), ('hThread', wt.HANDLE), ('dwProcessId', wt.DWORD), ('dwThreadId', wt.DWORD)]


class PBI(ctypes.Structure):
    _fields_ = [('R1', ctypes.c_void_p), ('Peb', ctypes.c_void_p), ('R2', ctypes.c_void_p * 2),
                ('Pid', ctypes.c_void_p), ('R3', ctypes.c_void_p)]


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else 'x'
    extra = []
    for i, a in enumerate(sys.argv):
        if a == '--extra':
            rva, hx = sys.argv[i + 1].split(':')
            extra.append((int(rva, 16), hx))
    patches = ACT + extra
    subprocess.run(['powershell', '-NoProfile', '-Command',
                    'Stop-Process -Name <项目A>,XYcopy -Force -EA SilentlyContinue'], capture_output=True)
    time.sleep(2)
    si = SI(); si.cb = ctypes.sizeof(SI); pi = PI()
    k32.CreateProcessW(EXE, None, None, None, False, 0x4, None, DIR, ctypes.byref(si), ctypes.byref(pi))
    h = pi.hProcess
    pbi = PBI(); ctypes.WinDLL('ntdll').NtQueryInformationProcess(h, 0, ctypes.byref(pbi), ctypes.sizeof(pbi), None)
    buf = ctypes.create_string_buffer(8); got = ctypes.c_size_t(0)
    k32.ReadProcessMemory(h, ctypes.c_void_p(pbi.Peb + 0x10), buf, 8, ctypes.byref(got))
    base = struct.unpack('<Q', buf.raw)[0]
    for rva, hx in patches:
        dd = bytes.fromhex(hx); old = wt.DWORD(0)
        k32.VirtualProtectEx(h, ctypes.c_void_p(base + rva), len(dd), 0x40, ctypes.byref(old))
        w = ctypes.c_size_t(0)
        k32.WriteProcessMemory(h, ctypes.c_void_p(base + rva), dd, len(dd), ctypes.byref(w))
        k32.VirtualProtectEx(h, ctypes.c_void_p(base + rva), len(dd), old.value, ctypes.byref(old))
    print('[*] 补丁 %d 处: %s' % (len(patches), ' '.join('0x%X' % p[0] for p in patches)))
    k32.ResumeThread(pi.hThread)
    time.sleep(14)

    def rd(rva, n=8):
        b = ctypes.create_string_buffer(n); g = ctypes.c_size_t(0)
        k32.ReadProcessMemory(h, ctypes.c_void_p(base + rva), b, n, ctypes.byref(g)); return b.raw
    act = struct.unpack('<H', rd(0x230CDEA, 2))[0]
    print('[*] 授权状态字=0x%04X  license_type=%d' % (act, struct.unpack('<I', rd(0x22FD724, 4))[0]))

    # 打开「关于」
    hw = A.find_xy()[0]
    A.u32.SetWindowPos(hw, A.HWND_TOPMOST, 0, 0, 0, 0, A.SWP_NOMOVE | A.SWP_NOSIZE)
    A.u32.SetForegroundWindow(hw); A.u32.BringWindowToTop(hw); time.sleep(1.0)
    r = wt.RECT(); A.u32.GetWindowRect(hw, ctypes.byref(r))
    A.click(r.left + 985, r.top + 73)
    time.sleep(0.6)
    CB = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    menu = []

    def cb(hh, l):
        c = ctypes.create_unicode_buffer(64); A.u32.GetClassNameW(hh, c, 64)
        if c.value == '#32768':
            rr = wt.RECT(); A.u32.GetWindowRect(hh, ctypes.byref(rr)); menu.append((hh, rr))
        return True
    A.u32.EnumWindows(CB(cb), 0)
    if not menu:
        print('[!] 菜单未打开'); return 1
    mh, mr = menu[-1]
    ih = (mr.bottom - mr.top) / 17.0
    A.click(mr.left + 120, mr.top + ih * 16.5)
    time.sleep(1.6)

    got_win = []
    def cb2(hh, l):
        if A.u32.IsWindowVisible(hh) and hh != hw:
            c = ctypes.create_unicode_buffer(128); A.u32.GetClassNameW(hh, c, 128)
            rr = wt.RECT(); A.u32.GetWindowRect(hh, ctypes.byref(rr))
            w_, h_ = rr.right - rr.left, rr.bottom - rr.top
            if c.value == 'ThunderRT6FormDC' and w_ > 400 and h_ > 300:
                p = os.path.join(A.OUT, 'verify_%s_about.bmp' % tag)
                A.grab_win(hh, p); got_win.append(p); print('[*] 关于框 -> %s (%dx%d)' % (p, w_, h_))
        return True
    A.u32.EnumWindows(CB(cb2), 0)
    A.u32.SetWindowPos(hw, A.HWND_NOTOPMOST, 0, 0, 0, 0, A.SWP_NOMOVE | A.SWP_NOSIZE)
    return 0


if __name__ == '__main__':
    sys.exit(main())
