// version.dll — DLL Search Order Hijacking PoC (T1574.001)
//
// Dynamically resolves the host application directory at runtime via
// GetModuleFileNameA(NULL), so it works in ANY installation path
// (e.g. D:\BurpSuite, D:\Data\BurpSuite, C:\Program Files\BurpSuiteProfessional).
//
// Payload:
//   1. IAT-hook the launcher's kernel32!GetProcAddress
//   2. Intercept JNI_CreateJavaVM
//   3. Dynamically inject "-javaagent:<exe_dir>\BurpLoaderAgent.jar"
//      into JavaVMInitArgs before the JVM is created
//
// Every export of the genuine version.dll is faithfully forwarded.
#![allow(non_snake_case)]

use std::ffi::c_void;
use std::sync::OnceLock;

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryA(name: *const u8) -> *mut c_void;
    fn GetProcAddress(h: *mut c_void, name: *const u8) -> *mut c_void;
    fn GetModuleHandleA(name: *const u8) -> *mut c_void;
    fn GetModuleFileNameA(module: *mut c_void, buf: *mut u8, size: u32) -> u32;
    fn SetEnvironmentVariableA(name: *const u8, value: *const u8) -> i32;
    fn VirtualProtect(addr: *mut c_void, size: usize, new: u32, old: *mut u32) -> i32;
    fn GetCurrentProcessId() -> u32;
}

const PAGE_READWRITE: u32 = 0x04;

// ---------------- Dynamic Application Directory Resolution ----------------
fn app_dir() -> &'static str {
    static DIR: OnceLock<String> = OnceLock::new();
    DIR.get_or_init(|| {
        let mut buf = [0u8; 1024];
        let len = unsafe {
            GetModuleFileNameA(std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32)
        };
        let path = String::from_utf8_lossy(&buf[..len as usize]);
        if let Some(pos) = path.rfind('\\') {
            path[..pos].to_string()
        } else {
            ".".to_string()
        }
    })
}

fn log_path() -> String {
    format!("{}\\hijack_proof.log", app_dir())
}

fn agent_arg() -> &'static [u8] {
    static OPT: OnceLock<Vec<u8>> = OnceLock::new();
    OPT.get_or_init(|| {
        let s = format!("-javaagent:{}\\BurpLoaderAgent.jar\0", app_dir());
        s.into_bytes()
    })
}

fn log(msg: &str) {
    use std::io::Write;
    let pid = unsafe { GetCurrentProcessId() };
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_path()) {
        let _ = writeln!(f, "[version.dll hijack pid={}] {}", pid, msg);
    }
}

// ---------------- Genuine version.dll resolution ----------------
fn real_version_dll() -> *mut c_void {
    static M: OnceLock<usize> = OnceLock::new();
    *M.get_or_init(|| unsafe {
        let h = LoadLibraryA(b"C:\\Windows\\System32\\version.dll\0".as_ptr());
        log(&format!("resolved genuine version.dll @ {:p}", h));
        h as usize
    }) as *mut c_void
}

unsafe fn vproc(name: &[u8]) -> *mut c_void {
    GetProcAddress(real_version_dll(), name.as_ptr())
}

// ---------------- JavaVMInitArgs ABI ----------------
#[repr(C)]
struct JavaVMOption {
    option_string: *mut i8,
    extra_info: *mut c_void,
}
#[repr(C)]
struct JavaVMInitArgs {
    version: i32,
    n_options: i32,
    options: *mut JavaVMOption,
    ignore_unrecognized: u8,
}

type CreateFn = unsafe extern "system" fn(*mut *mut c_void, *mut *mut c_void, *mut c_void) -> i32;
type GpaFn = unsafe extern "system" fn(*mut c_void, *const u8) -> *mut c_void;

static mut REAL_GPA: Option<GpaFn> = None;
static mut REAL_CREATE: Option<CreateFn> = None;
static mut INJECTED: bool = false;

unsafe extern "system" fn my_create(
    pvm: *mut *mut c_void,
    penv: *mut *mut c_void,
    vm_args: *mut c_void,
) -> i32 {
    if !vm_args.is_null() && !INJECTED {
        let args = vm_args as *mut JavaVMInitArgs;
        let n = (*args).n_options.max(0) as usize;
        let old = (*args).options;

        let opt_bytes = agent_arg();
        let opt_str = String::from_utf8_lossy(&opt_bytes[..opt_bytes.len() - 1]);

        let mut v: Vec<JavaVMOption> = Vec::with_capacity(n + 1);
        for i in 0..n {
            let o = old.add(i);
            v.push(JavaVMOption {
                option_string: (*o).option_string,
                extra_info: (*o).extra_info,
            });
        }
        v.push(JavaVMOption {
            option_string: opt_bytes.as_ptr() as *mut i8,
            extra_info: std::ptr::null_mut(),
        });

        (*args).n_options = (n + 1) as i32;
        (*args).options = v.as_mut_ptr();
        std::mem::forget(v); // keep alive for VM lifetime
        INJECTED = true;
        log(&format!(
            "JNI_CreateJavaVM intercepted: injected {} (nOptions {} -> {})",
            opt_str, n, n + 1
        ));
    }
    match REAL_CREATE {
        Some(f) => f(pvm, penv, vm_args),
        None => -1,
    }
}

unsafe extern "system" fn my_gpa(module: *mut c_void, name: *const u8) -> *mut c_void {
    let real = REAL_GPA.unwrap();
    if !name.is_null() && (name as usize) > 0xFFFF {
        if cstr_eq(name, b"JNI_CreateJavaVM") {
            if REAL_CREATE.is_none() {
                REAL_CREATE = Some(std::mem::transmute(
                    real(module, b"JNI_CreateJavaVM\0".as_ptr()),
                ));
            }
            log("GetProcAddress(JNI_CreateJavaVM) -> hooked wrapper");
            return my_create as *mut c_void;
        }
    }
    real(module, name)
}

unsafe fn cstr_eq(a: *const u8, b: &[u8]) -> bool {
    let mut i = 0usize;
    loop {
        let ca = *a.add(i);
        let cb = if i < b.len() { b[i] } else { 0 };
        if ca != cb {
            return false;
        }
        if ca == 0 {
            return true;
        }
        i += 1;
    }
}

// ---------------- IAT hook: kernel32!GetProcAddress ----------------
unsafe fn install_iat_hook() {
    let base = GetModuleHandleA(std::ptr::null()) as *const u8;
    if base.is_null() {
        log("iat: GetModuleHandle(NULL) failed");
        return;
    }
    if *(base as *const u16) != 0x5A4D {
        log("iat: bad DOS magic");
        return;
    }

    let e_lfanew = *(base.add(0x3C) as *const u32) as usize;
    let nt = base.add(e_lfanew);
    if *(nt as *const u32) != 0x0000_4550 {
        log("iat: bad NT signature");
        return;
    }

    let opt = nt.add(0x18);
    let magic = *(opt as *const u16);
    let dd_off = if magic == 0x20B { 0x70 } else { 0x60 };
    let import_rva = *(opt.add(dd_off + 8) as *const u32) as usize;
    if import_rva == 0 {
        log("iat: no import directory");
        return;
    }
    let desc = base.add(import_rva);

    let mut i = 0usize;
    while i <= 256 {
        let d = desc.add(i * 20);
        let oft = *(d.add(0) as *const u32) as usize;
        let name_rva = *(d.add(12) as *const u32) as usize;
        let ft = *(d.add(16) as *const u32) as usize;
        if name_rva == 0 && ft == 0 {
            break;
        }
        if oft == 0 {
            i += 1;
            continue;
        }

        if cstr_eq_ci(base.add(name_rva), b"kernel32.dll") {
            let names = base.add(oft);
            let iat = base.add(ft) as *mut usize;
            let mut j = 0usize;
            while j < 4096 {
                let ent = *(names.add(j * 8) as *const usize);
                if ent == 0 {
                    break;
                }
                if ent & (1usize << 63) == 0 {
                    let fname = base.add(ent + 2);
                    if cstr_eq(fname, b"GetProcAddress") {
                        let real = *iat.add(j);
                        REAL_GPA = Some(std::mem::transmute(real));
                        let mut old = 0u32;
                        VirtualProtect(iat.add(j) as *mut c_void, 8, PAGE_READWRITE, &mut old);
                        *iat.add(j) = my_gpa as *const () as usize;
                        VirtualProtect(iat.add(j) as *mut c_void, 8, old, &mut old);
                        log(&format!(
                            "iat: HOOKED kernel32!GetProcAddress slot#{} (real={:#x})",
                            j, real
                        ));
                        return;
                    }
                }
                j += 1;
            }
        }
        i += 1;
    }
    log("iat: GetProcAddress slot not found");
}

unsafe fn cstr_eq_ci(a: *const u8, b: &[u8]) -> bool {
    let mut i = 0usize;
    loop {
        let ca = *a.add(i) as u8;
        let cb = if i < b.len() { b[i] } else { 0 };
        if ca.to_ascii_lowercase() != cb.to_ascii_lowercase() {
            return false;
        }
        if ca == 0 {
            return true;
        }
        i += 1;
    }
}

#[no_mangle]
pub extern "system" fn DllMain(_h: *mut c_void, reason: u32, _r: *mut c_void) -> i32 {
    if reason == 1 {
        unsafe {
            log(&format!("DLL_PROCESS_ATTACH in {}", app_dir()));
            let _ = SetEnvironmentVariableA(
                b"JAVA_TOOL_OPTIONS\0".as_ptr(),
                agent_arg().as_ptr(),
            );
            install_iat_hook();
        }
    }
    1
}

// ------------------------------------------------------------------
// Full export surface of genuine version.dll, faithfully forwarded.
// ------------------------------------------------------------------
macro_rules! forward {
    ($name:ident ( $($arg:ident : $ty:ty),* ) -> $ret:ty) => {
        #[no_mangle]
        pub extern "system" fn $name($($arg: $ty),*) -> $ret {
            unsafe {
                let f: extern "system" fn($($ty),*) -> $ret =
                    std::mem::transmute(vproc(concat!(stringify!($name), "\0").as_bytes()));
                f($($arg),*)
            }
        }
    };
}

forward!(GetFileVersionInfoA(n: *const c_void, h: u32, l: u32, d: *mut c_void) -> i32);
forward!(GetFileVersionInfoW(n: *const c_void, h: u32, l: u32, d: *mut c_void) -> i32);
forward!(GetFileVersionInfoSizeA(n: *const c_void, h: *mut u32) -> u32);
forward!(GetFileVersionInfoSizeW(n: *const c_void, h: *mut u32) -> u32);
forward!(GetFileVersionInfoExA(f: u32, n: *const c_void, h: u32, l: u32, d: *mut c_void) -> i32);
forward!(GetFileVersionInfoExW(f: u32, n: *const c_void, h: u32, l: u32, d: *mut c_void) -> i32);
forward!(GetFileVersionInfoSizeExA(f: u32, n: *const c_void, h: *mut u32) -> u32);
forward!(GetFileVersionInfoSizeExW(f: u32, n: *const c_void, h: *mut u32) -> u32);
forward!(GetFileVersionInfoByHandle(f: u32, h: *mut c_void, d: *mut c_void) -> i32);
forward!(VerQueryValueA(b: *const c_void, s: *const c_void, o: *mut *mut c_void, l: *mut u32) -> i32);
forward!(VerQueryValueW(b: *const c_void, s: *const c_void, o: *mut *mut c_void, l: *mut u32) -> i32);
forward!(VerFindFileA(f: u32, a1: *mut c_void, a2: *mut c_void, a3: *mut c_void,
                      a4: *mut c_void, l1: *mut u32, a5: *mut c_void, l2: *mut u32) -> u32);
forward!(VerFindFileW(f: u32, a1: *mut c_void, a2: *mut c_void, a3: *mut c_void,
                      a4: *mut c_void, l1: *mut u32, a5: *mut c_void, l2: *mut u32) -> u32);
forward!(VerInstallFileA(f: u32, a1: *mut c_void, a2: *mut c_void, a3: *mut c_void,
                         a4: *mut c_void, a5: *mut c_void, a6: *mut c_void, l: *mut u32) -> u32);
forward!(VerInstallFileW(f: u32, a1: *mut c_void, a2: *mut c_void, a3: *mut c_void,
                         a4: *mut c_void, a5: *mut c_void, a6: *mut c_void, l: *mut u32) -> u32);
forward!(VerLanguageNameA(w: u32, b: *mut c_void, n: u32) -> u32);
forward!(VerLanguageNameW(w: u32, b: *mut c_void, n: u32) -> u32);
