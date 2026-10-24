"""ini_register.py — 安全读写 <项目A>.ini 的 [Register] 段（逐行编辑，绝不动其他内容）
用法:
  python ini_register.py read
  python ini_register.py write "Name" "Code" [dc]
  python ini_register.py clear
"""
import io, sys, os, shutil

CANDIDATES = [
    os.path.join(os.environ.get('APPDATA', ''), '<项目A>64', '<项目A>.ini'),
    os.path.join(os.environ.get('APPDATA', ''), '<项目A>', '<项目A>.ini'),
]


def find_ini():
    for p in CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def load(p):
    raw = open(p, 'rb').read()
    if raw[:2] in (b'\xff\xfe', b'\xfe\xff'):
        return io.open(p, encoding='utf-16').read(), 'utf-16'
    try:
        return io.open(p, encoding='utf-8').read(), 'utf-8'
    except UnicodeDecodeError:
        return io.open(p, encoding='latin1').read(), 'latin1'


def save(p, text, enc):
    if enc == 'utf-16':
        io.open(p, 'w', encoding='utf-16', newline='').write(text)
    elif enc == 'utf-8':
        io.open(p, 'w', encoding='utf-8', newline='').write(text)
    else:
        io.open(p, 'w', encoding='latin1', newline='').write(text)


def reg_range(lines):
    """返回 [Register] 段的 (start, end) 行号区间（end 不含）"""
    st = None
    for i, l in enumerate(lines):
        if l.strip() == '[Register]':
            st = i + 1
            break
    if st is None:
        return None, None
    en = len(lines)
    for j in range(st, len(lines)):
        if lines[j].startswith('['):
            en = j
            break
    return st, en


def main():
    p = find_ini()
    if not p:
        print('[-] 未找到 <项目A>.ini')
        return 1
    print('[*] ini: %s' % p)
    text, enc = load(p)
    nl = '\r\n' if '\r\n' in text else '\n'
    lines = text.replace('\r\n', '\n').split('\n')
    st, en = reg_range(lines)

    if st is None:
        print('[-] 未找到 [Register] 段')
        return 1

    mode = sys.argv[1] if len(sys.argv) > 1 else 'read'

    if mode == 'read':
        print('=== [Register] 段 ===')
        for l in lines[st:en]:
            print('  |%s|' % l)
        return 0

    # 备份
    bak = p + '.seepbak'
    if not os.path.exists(bak):
        shutil.copy2(p, bak)
        print('[*] 已备份 -> %s' % bak)

    if mode == 'clear':
        vals = {'Name': '', 'Code': '', 'dc': '0'}
    else:
        vals = {'Name': sys.argv[2] if len(sys.argv) > 2 else '',
                'Code': sys.argv[3] if len(sys.argv) > 3 else '',
                'dc': sys.argv[4] if len(sys.argv) > 4 else '0'}

    # 仅在段内逐行替换，缺失则插入
    seen = set()
    for i in range(st, en):
        for k in vals:
            if lines[i].startswith(k + '='):
                lines[i] = '%s=%s' % (k, vals[k])
                seen.add(k)
    ins = st
    for k in ('Name', 'Code', 'dc'):
        if k not in seen:
            lines.insert(ins, '%s=%s' % (k, vals[k]))
            ins += 1
            en += 1

    save(p, nl.join(lines), enc)
    print('[+] 已写入: Name=%r Code=%r dc=%s' % (vals['Name'], vals['Code'], vals['dc']))
    st2, en2 = reg_range(lines)
    print('=== 写入后 ===')
    for l in lines[st2:en2]:
        print('  |%s|' % l)
    return 0


if __name__ == '__main__':
    sys.exit(main())
