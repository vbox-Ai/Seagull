// ============================================================================
//  <项目A> 授权旁路验证 PoC —— version.dll (DLL 搜索顺序劫持 + 授权状态机热补丁)
//  ---------------------------------------------------------------------------
//  适配版本：<项目A> 28.40.0100 (twinBASIC 982) & 28.30.2600 (x64)
//
//  ★ 授权模型测绘结论（关键）：
//    宿主存在两级授权变量，二者解耦：
//      · license_type (int) —— 仅表示注册码前缀分类 xy01..xy05 → 1..5；
//        由 [Register] Code= 前缀直接决定，**不构成激活判据**。
//      · 授权状态字 (word) —— 真正的激活开关：
//            0xFFFF = 试用 / 0x0000 = 已激活
//        其值在启动时由 `状态字 = NOT(注册加载返回值)` 计算得出（-1 通过 → 0）。
//    ⇒ 仅写入 license_type=5 只会让「关于」框显示授权信息，
//      标题栏与试用弹窗链路依旧走试用分支（这正是旧版方案的失效根因）。
//
//  ★ 本 PoC 的解法（4 处确定性指令级热补丁，无需伪造注册码签名）：
//    1. `not eax` → `xor eax,eax`   —— 令激活判定恒返回 0x0000(已激活)
//    2. 前置检查失败分支的 `mov word [rax],0xFFFF` → 写入 0
//    3. 注册信息为空分支的 `mov word [rax],0xFFFF` → 写入 0
//    4. 「关于」框许可等级分支无条件进入 Lifetime License
//    ⇒ 授权状态字恒为 0，宿主自身以「正式授权」姿态渲染全部 UI
//      （标题栏、启动欢迎链路、试用弹窗均无需任何 UI 化妆品补丁）
//
//  ★ 密钥结构（供部署阶段写入 [Register] Code=）：
//      xy05-<用户数>-<4hex>×5-<重复段>-<版本段>
//      例：xy05-0100-079F-3AAE-9F8F-6729-51A9-079F-28.40
//      · 第 2 段 4 位十六进制 = 授权用户数（0100 → 1 用户）
//      · 第 9 段 = 版本段，需与宿主主次版本一致（28.40 / 28.30）
//
//  ★ 自定义授权信息（姓名/密钥）由部署阶段写入宿主配置 [Register] 段，
//    宿主原生载入并显示，无需运行期改写内存。
//
//  ★ 导出并转发系统原版 version.dll 全部 17 个接口，保障宿主基础功能不受损。
// ============================================================================
#![allow(non_snake_case, non_camel_case_types, non_upper_case_globals)]

use core::ffi::c_void;
use std::fs::OpenOptions;
use std::io::Write;
use std::thread;
use std::time::Duration;

type Hmod = *mut c_void;

extern "system" {
    fn GetModuleHandleW(name: *const u16) -> Hmod;
    fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> Hmod;
    fn GetProcAddress(h: Hmod, name: *const u8) -> *mut c_void;
    fn GetModuleFileNameW(h: Hmod, buf: *mut u16, size: u32) -> u32;
    fn VirtualProtect(addr: *mut c_void, size: usize, new_prot: u32, old_prot: *mut u32) -> i32;
    fn CreateThread(attr: *mut c_void, size: usize,
                    start: unsafe extern "system" fn(*mut c_void) -> u32,
                    param: *mut c_void, flags: u32, tid: *mut u32) -> *mut c_void;
}

const PAGE_EXECUTE_READWRITE: u32 = 0x40;
const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;

struct CodePatch {
    rva: usize,
    bytes: &'static [u8],
}

struct Map {
    size_of_image: u32,
    lic: usize,
    flag: usize,
    act: usize,          // ★ 授权状态字（word）: 0xFFFF=试用 / 0x0000=已激活
    #[allow(dead_code)] name_g: usize,
    #[allow(dead_code)] code1_g: usize,
    #[allow(dead_code)] code2_g: usize,
    code_patches: &'static [CodePatch],
}

// ── 28.40.0100 授权状态判定引擎热补丁（真·激活）──────────────────────────
static PATCHES_2840: [CodePatch; 4] = [
    // 1. 激活判定取反指令消解：not eax -> xor eax,eax
    //    原语义 状态字 = NOT(注册加载返回值)：-1(通过) → 0x0000(已激活)
    //    补丁后恒为 0x0000，等价于「注册加载永远通过」
    CodePatch { rva: 0x670CB1, bytes: &[0x31, 0xC0] },
    // 2. 前置检查失败分支的试用标记写入 → 改写为 0x0000
    CodePatch { rva: 0x670BFF, bytes: &[0x66, 0xC7, 0x00, 0x00, 0x00] },
    // 3. 注册信息为空分支的试用标记写入 → 改写为 0x0000
    CodePatch { rva: 0x670CD5, bytes: &[0x66, 0xC7, 0x00, 0x00, 0x00] },
    // 4. 「关于」框许可等级呈现：无条件进入 Lifetime License 分支
    //    （等级枚举由注册码内嵌签名解码得出，无法离线伪造 → 直接锁定呈现分支）
    CodePatch { rva: 0x15E2A47, bytes: &[0xE9, 0x40, 0x00, 0x00, 0x00] },
];

// ── 28.30.2600 同源热补丁（激活判定指令序列与 28.40 完全同构，偏移差 -0x1039）──
static PATCHES_2830: [CodePatch; 4] = [
    CodePatch { rva: 0x66FC6A, bytes: &[0x31, 0xC0] },
    CodePatch { rva: 0x66FBB8, bytes: &[0x66, 0xC7, 0x00, 0x00, 0x00] },
    CodePatch { rva: 0x66FC8E, bytes: &[0x66, 0xC7, 0x00, 0x00, 0x00] },
    CodePatch { rva: 0x15CEA84, bytes: &[0xE9, 0x40, 0x00, 0x00, 0x00] },
];

static MAPS: [Map; 2] = [
    Map {
        size_of_image: 0x0285_0000,
        lic: 0x22FD724,
        flag: 0x230170C,
        act: 0x230CDEA,
        name_g: 0x2235A88,
        code1_g: 0x2281C70,
        code2_g: 0x21FDDE0,
        code_patches: &PATCHES_2840,
    },
    Map {
        size_of_image: 0x0283_B000,
        lic: 0x22E4D5C,
        flag: 0x22E8D44,
        act: 0x22F434A,
        name_g: 0x221CEF8,
        code1_g: 0x22694A0,
        code2_g: 0x21E52F0,
        code_patches: &PATCHES_2830,
    },
];

unsafe fn read_u32(p: usize) -> u32 { core::ptr::read_unaligned(p as *const u32) }
unsafe fn write_u32(p: usize, v: u32) { core::ptr::write_unaligned(p as *mut u32, v) }

fn log_path() -> Option<std::path::PathBuf> {
    unsafe {
        let mut buf = vec![0u16; 1024];
        let n = GetModuleFileNameW(core::ptr::null_mut(), buf.as_mut_ptr(), 1024);
        if n == 0 { return None; }
        let s = String::from_utf16_lossy(&buf[..n as usize]);
        let mut p = std::path::PathBuf::from(s);
        p.set_file_name("version_poc.log");
        Some(p)
    }
}

fn log(msg: &str) {
    if let Some(p) = log_path() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p) {
            let _ = writeln!(f, "{}", msg);
        }
    }
}

unsafe fn apply_code_patch(addr: usize, bytes: &[u8]) -> bool {
    let mut old_prot: u32 = 0;
    if VirtualProtect(addr as *mut c_void, bytes.len(), PAGE_EXECUTE_READWRITE, &mut old_prot) == 0 {
        return false;
    }
    core::ptr::copy_nonoverlapping(bytes.as_ptr(), addr as *mut u8, bytes.len());
    VirtualProtect(addr as *mut c_void, bytes.len(), old_prot, &mut old_prot);
    true
}

unsafe fn pick_map(base: usize) -> Option<&'static Map> {
    let e_lfanew = read_u32(base + 0x3C) as usize;
    if e_lfanew < 0x40 || e_lfanew > 0x1000 { return None; }
    let size_of_image = read_u32(base + e_lfanew + 0x50);
    for m in MAPS.iter() {
        if m.size_of_image == size_of_image {
            return Some(m);
        }
    }
    for m in MAPS.iter() {
        let v = read_u32(base + m.lic);
        if v <= 5 { return Some(m); }
    }
    None
}

unsafe fn patch() -> bool {
    let base = GetModuleHandleW(core::ptr::null()) as usize;
    if base == 0 { return false; }
    let m = match pick_map(base) { Some(m) => m, None => return false };

    let mut changed = false;

    // 1. 维持授权全局状态
    if read_u32(base + m.lic) != 5 {
        write_u32(base + m.lic, 5);
        changed = true;
    }
    if read_u32(base + m.flag) != 1 {
        write_u32(base + m.flag, 1);
        changed = true;
    }

    // 2. 执行底层机器码热补丁
    for p in m.code_patches {
        let target = base + p.rva;
        let mut cur = vec![0u8; p.bytes.len()];
        core::ptr::copy_nonoverlapping(target as *const u8, cur.as_mut_ptr(), p.bytes.len());
        if cur.as_slice() != p.bytes {
            apply_code_patch(target, p.bytes);
            changed = true;
        }
    }

    changed
}

unsafe extern "system" fn worker(_param: *mut c_void) -> u32 {
    let base = GetModuleHandleW(core::ptr::null()) as usize;
    let m = match pick_map(base) { Some(m) => m, None => return 0 };

    // 阶段一：覆盖宿主启动初始化窗口（短时高频抢占，仅用于兜底无 [Register] 配置的场景）
    for _ in 0..160 {
        patch();
        thread::sleep(Duration::from_millis(50));
    }
    // 阶段二：有界维持 8 秒后退出（不常驻线程，零后台开销）
    for _ in 0..16 {
        patch();
        thread::sleep(Duration::from_millis(500));
    }

    let lic = read_u32(base + m.lic);
    let act = core::ptr::read_unaligned((base + m.act) as *const u16);
    log(&format!(
        "[+] 授权状态机热补丁已生效: license_type={} | 授权状态字=0x{:04X} ({})",
        lic, act, if act == 0 { "已激活" } else { "试用" }
    ));
    0
}

#[no_mangle]
pub unsafe extern "system" fn DllMain(_hinst: Hmod, reason: u32, _res: *mut c_void) -> i32 {
    if reason == 1 {
        log("[*] version.dll (v2.4.0) DllMain 注入成功");
        // 同步预打一次，确保启动早期第一道逻辑就生效
        patch();
        let mut tid: u32 = 0;
        CreateThread(core::ptr::null_mut(), 0, worker, core::ptr::null_mut(), 0, &mut tid);
    }
    1
}

// ============================================================================
// version.dll 导出转发
// ============================================================================
static mut REAL: Hmod = core::ptr::null_mut();

unsafe fn real() -> Hmod {
    if REAL.is_null() {
        let sys: Vec<u16> = "C:\\Windows\\System32\\version.dll\0".encode_utf16().collect();
        REAL = LoadLibraryExW(sys.as_ptr(), core::ptr::null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32);
    }
    REAL
}

macro_rules! fwd {
    ($name:ident, $($arg:ident : $ty:ty),*) => {
        #[no_mangle]
        pub unsafe extern "system" fn $name($($arg: $ty),*) -> isize {
            let h = real();
            let f = GetProcAddress(h, concat!(stringify!($name), "\0").as_ptr());
            if f.is_null() { return 0; }
            let fp: unsafe extern "system" fn($($ty),*) -> isize = core::mem::transmute(f);
            fp($($arg),*)
        }
    };
}

fwd!(GetFileVersionInfoA, a: *const u8, b: u32, c: u32, d: *mut c_void);
fwd!(GetFileVersionInfoW, a: *const u16, b: u32, c: u32, d: *mut c_void);
fwd!(GetFileVersionInfoByHandle, a: u32, b: *mut c_void, c: u32, d: *mut c_void);
fwd!(GetFileVersionInfoExA, a: u32, b: *const u8, c: u32, d: u32, e: *mut c_void);
fwd!(GetFileVersionInfoExW, a: u32, b: *const u16, c: u32, d: u32, e: *mut c_void);
fwd!(GetFileVersionInfoSizeA, a: *const u8, b: *mut u32);
fwd!(GetFileVersionInfoSizeW, a: *const u16, b: *mut u32);
fwd!(GetFileVersionInfoSizeExA, a: u32, b: *const u8, c: *mut u32);
fwd!(GetFileVersionInfoSizeExW, a: u32, b: *const u16, c: *mut u32);
fwd!(VerFindFileA, a: u32, b: *const u8, c: *const u8, d: *const u8, e: *mut u8, f: *mut u32, g: *mut u8, h: *mut u32);
fwd!(VerFindFileW, a: u32, b: *const u16, c: *const u16, d: *const u16, e: *mut u16, f: *mut u32, g: *mut u16, h: *mut u32);
fwd!(VerInstallFileA, a: u32, b: *const u8, c: *const u8, d: *const u8, e: *const u8, f: *mut u8, g: *mut u32);
fwd!(VerInstallFileW, a: u32, b: *const u16, c: *const u16, d: *const u16, e: *const u16, f: *mut u16, g: *mut u32);
fwd!(VerLanguageNameA, a: u32, b: *mut u8, c: u32);
fwd!(VerLanguageNameW, a: u32, b: *mut u16, c: u32);
fwd!(VerQueryValueA, a: *const c_void, b: *const u8, c: *mut *mut c_void, d: *mut u32);
fwd!(VerQueryValueW, a: *const c_void, b: *const u16, c: *mut *mut c_void, d: *mut u32);
