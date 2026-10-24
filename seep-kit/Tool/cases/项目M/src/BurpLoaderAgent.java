import java.lang.classfile.*;
import java.lang.constant.*;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.security.ProtectionDomain;
import java.util.prefs.Preferences;

/**
 * BurpLoaderAgent - Whitebox Audit PoC
 *
 * Runtime bytecode instrumentation (zero disk modification; the original
 * burpsuite.jar stays intact):
 *   [1] burp.Zfqu.ZL(String)      -> no-op (signature verification always passes)
 *   [2] burp.Zfqu.ZH(String)      -> returns fixed license id
 *   [3] burp.Zfqu.Zt(String,int)  -> returns forged license metadata
 *   [4] burp.Zwxg.Zu(...)         -> always returns a licensed Zyeo
 *                                    (kills the activation dialog AND upgrades to Professional)
 */
public class BurpLoaderAgent {

    private static final String LICENSEE    = "Security Researcher (Lab Sandbox - Whitebox Audit)";
    private static final String LICENSE_ID  = "100000000000";
    private static final long   EXPIRY_MS   = 4102416000000L; // 2100-01-01
    private static final String LICENSE_KEY = "BURP_SUITE_PRO_RESEARCH_LICENSE_KEY";
    // Burp AI activation token (Zeq_.Zv() / Zwaf.ZD / objArr[6]); must be non-blank
    // and free of HTTP-control characters (CR/LF/NUL).
    private static final String AI_TOKEN =
            "eyJhbGciOiJIUzI1NiJ9.LAB-SANDBOX-AI-ACTIVATION-TOKEN.0000000000000000000000000000";

    // [0]=licensee [1]=licenseId [2]=expiryMillis [3]=mode(1=Desktop/Pro)
    // [4]=tier [5]=seats [6]=AI activation token
    public static Object[] mockZt(String key, int mode) {
        return new Object[] {
            LICENSEE,
            LICENSE_ID,
            Long.valueOf(EXPIRY_MS),
            Integer.valueOf(1),
            "professional",
            "1",
            AI_TOKEN
        };
    }

    public static burp.Zeq_ mockLicense() {
        try {
            burp.Zw8w zfer = new burp.Zw8w();
            burp.Zwcs parser = new burp.Zwcs(zfer, burp.Zash.EXECUTION_MODE_DESKTOP);
            return parser.Zz(LICENSE_KEY, mockZt(LICENSE_KEY, 1));
        } catch (Throwable t) {
            System.err.println("[AGENT] mockLicense failed: " + t);
            t.printStackTrace();
            return null;
        }
    }

    public static void premain(String agentArgs, Instrumentation inst) {
        banner();
        seedPreferences();

        inst.addTransformer(new ClassFileTransformer() {
            @Override
            public byte[] transform(ClassLoader loader, String className, Class<?> redef,
                                    ProtectionDomain pd, byte[] buf) {
                try {
                    if ("burp/Zfqu".equals(className)) {
                        return patchZfqu(buf);
                    }
                    if ("burp/Zwxg".equals(className)) {
                        return patchZwxg(buf);
                    }
                    if ("burp/Zn23".equals(className) || "burp/Zav0".equals(className)) {
                        System.out.println("[AGENT-PROBE] ACTIVATION DIALOG CLASS LOADED: " + className);
                    }
                } catch (Throwable t) {
                    System.err.println("[AGENT] transform error on " + className + ": " + t);
                    t.printStackTrace();
                }
                return buf;
            }
        }, true);

        startVerifier();
    }

    private static String getLogPath() {
        try {
            java.io.File jar = new java.io.File(BurpLoaderAgent.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            return new java.io.File(jar.getParentFile(), "agent_verify.log").getAbsolutePath();
        } catch (Throwable t) {
            return "agent_verify.log";
        }
    }

    public static void fileLog(String msg) {
        try (java.io.FileWriter fw = new java.io.FileWriter(getLogPath(), true)) {
            fw.write("[BurpLoaderAgent] " + msg + System.lineSeparator());
        } catch (Throwable ignored) { }
    }

    private static void banner() {
        fileLog("premain reached -> agent loaded into JVM (pid=" + ProcessHandle.current().pid() + ")");
        System.out.println("=========================================================");
        System.out.println("[*] BurpLoaderAgent :: Runtime Bytecode Instrumentation");
        System.out.println("[*] Target : Burp Suite Professional activation gate");
        System.out.println("[*] Engine : java.lang.classfile (JDK native, no 3rd-party)");
        System.out.println("=========================================================");
    }

    private static void seedPreferences() {
        try {
            Class<?> startBurp = Class.forName("burp.StartBurp");
            Preferences p = Preferences.userNodeForPackage(startBurp);
            if (p.get("license1", null) == null) {
                p.put("license1", LICENSE_KEY);
                System.out.println("[+] Prefs seeded: license1");
            }
            String eula = p.get("burp.eula", null);
            if (eula == null || Integer.parseInt(eula) < 13) {
                p.put("burp.eula", "13");
                System.out.println("[+] Prefs seeded: burp.eula=13");
            }
            p.remove("expired_license");
            p.remove("use_community_edition");
            p.flush();

            // Burp AI activation token is NOT read from the license blob directly:
            //   @Named("burpAi") -> burp.Zaju/Zltz -> Zeq_.Zq()
            //   Zwaf.Zq() -> Zfer.Zr(licensee) -> Zfn8.Zj(name) -> Preferences.get(hash(name))
            // so it must be seeded under the licensee-hashed preference key.
            try {
                java.lang.reflect.Method zw = Class.forName("burp.Zfn8")
                        .getDeclaredMethod("Zw", String.class, String.class);
                zw.setAccessible(true);
                zw.invoke(null, LICENSEE, AI_TOKEN);
                System.out.println("[+] Prefs seeded: AI activation token (keyed by licensee hash)");
            } catch (Throwable t) {
                System.err.println("[-] AI token seeding failed: " + t);
            }
        } catch (Throwable t) {
            System.err.println("[-] Prefs seeding failed: " + t);
        }
    }

    private static byte[] patchZfqu(byte[] buf) {
        ClassFile cf = ClassFile.of();
        ClassModel cm = cf.parse(buf);
        ClassDesc self = ClassDesc.of("BurpLoaderAgent");
        MethodTypeDesc ztType = MethodTypeDesc.of(
                ClassDesc.ofDescriptor("[Ljava/lang/Object;"),
                ClassDesc.of("java.lang.String"), ClassDesc.ofDescriptor("I"));

        byte[] out = cf.transformClass(cm, (b, e) -> {
            if (e instanceof MethodModel mm) {
                String n = mm.methodName().stringValue();
                String d = mm.methodType().stringValue();
                if (n.equals("ZL") && d.equals("(Ljava/lang/String;)V")) {
                    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
                            mb -> mb.withCode(cb -> cb.return_()));
                    return;
                }
                if (n.equals("ZH") && d.equals("(Ljava/lang/String;)Ljava/lang/String;")) {
                    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
                            mb -> mb.withCode(cb -> cb.ldc(LICENSE_ID).areturn()));
                    return;
                }
                if (n.equals("Zt") && d.equals("(Ljava/lang/String;I)[Ljava/lang/Object;")) {
                    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
                            mb -> mb.withCode(cb -> cb.aload(0).iload(1)
                                    .invokestatic(self, "mockZt", ztType).areturn()));
                    return;
                }
            }
            b.with(e);
        });
        System.out.println("[+] Patched burp.Zfqu  (ZL=noop, ZH=const, Zt=mock license)");
        return out;
    }

    private static byte[] patchZwxg(byte[] buf) {
        ClassFile cf = ClassFile.of();
        ClassModel cm = cf.parse(buf);
        ClassDesc self = ClassDesc.of("BurpLoaderAgent");
        ClassDesc zeqDesc = ClassDesc.of("burp.Zeq_");
        ClassDesc zyeoDesc = ClassDesc.of("burp.Zyeo");
        MethodTypeDesc ctorType = MethodTypeDesc.of(
                ClassDesc.ofDescriptor("V"), zeqDesc, ClassDesc.ofDescriptor("Z"));

        byte[] out = cf.transformClass(cm, (b, e) -> {
            if (e instanceof MethodModel mm) {
                String n = mm.methodName().stringValue();
                String d = mm.methodType().stringValue();
                if (n.equals("Zu") && d.startsWith("(Lburp/Z_pm;") && d.endsWith(")Lburp/Zyeo;")) {
                    b.withMethod(mm.methodName(), mm.methodType(), mm.flags().flagsMask(),
                            mb -> mb.withCode(cb -> cb
                                    .new_(zyeoDesc)
                                    .dup()
                                    .invokestatic(self, "mockLicense", MethodTypeDesc.of(zeqDesc))
                                    .iconst_0()
                                    .invokespecial(zyeoDesc, "<init>", ctorType)
                                    .areturn()));
                    System.out.println("[+] Patched burp.Zwxg.Zu -> always licensed");
                    return;
                }
            }
            b.with(e);
        });
        return out;
    }

    private static void startVerifier() {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                for (int i = 0; i < 300; i++) {
                    try { Thread.sleep(1000); } catch (InterruptedException e) { return; }
                    try {
                        Field zxField = Class.forName("burp.StartBurp").getField("Zx");
                        Object zx = zxField.get(null);
                        if (zx == null) continue;

                        Object lic = null;
                        Class<?> c = zx.getClass();
                        while (c != null && lic == null) {
                            try {
                                Field f = c.getDeclaredField("Zh");
                                f.setAccessible(true);
                                lic = f.get(zx);
                            } catch (NoSuchFieldException nsfe) {
                                c = c.getSuperclass();
                            }
                        }
                        System.out.println("[AGENT-VERIFY] StartBurp.Zx = " + zx.getClass().getName());
                        System.out.println("[AGENT-VERIFY] active license  = " + lic);
                        if (lic != null) {
                            Method zm = lic.getClass().getMethod("Zm");
                            Method zl = lic.getClass().getMethod("ZL");
                            Method zq = lic.getClass().getMethod("Zq");
                            System.out.println("[AGENT-VERIFY]   licensee = " + zm.invoke(lic));
                            System.out.println("[AGENT-VERIFY]   expires  = " + zl.invoke(lic));
                            System.out.println("[AGENT-VERIFY]   tier     = " + zq.invoke(lic));
                            System.out.println("[AGENT-VERIFY] RESULT: PROFESSIONAL MODE ACTIVE");
                            fileLog("RESULT: PROFESSIONAL MODE ACTIVE, licensee=" + zm.invoke(lic) + ", expires=" + zl.invoke(lic));
                        } else {
                            System.out.println("[AGENT-VERIFY] RESULT: license NULL -> community mode");
                            fileLog("RESULT: license NULL -> community mode");
                        }
                        return;
                    } catch (Throwable ignored) { }
                }
            }
        }, "burp-agent-verify");
        t.setDaemon(true);
        t.start();
    }
}
