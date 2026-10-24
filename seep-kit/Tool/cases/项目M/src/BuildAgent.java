import javax.tools.*;
import java.io.*;
import java.util.*;
import java.util.jar.*;

public class BuildAgent {
    public static void main(String[] args) throws Exception {
        String burpJar = args.length > 0 ? args[0] : "D:/Data/BurpSuite/burpsuite.jar";
        System.out.println("[*] Compiling BurpLoaderAgent.java (classpath=" + burpJar + ")");
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        StandardJavaFileManager fm = compiler.getStandardFileManager(null, null, null);
        Iterable<? extends JavaFileObject> units = fm.getJavaFileObjects(new File("BurpLoaderAgent.java"));
        List<String> options = Arrays.asList("-d", ".", "-classpath", burpJar, "-nowarn");
        boolean ok = compiler.getTask(null, fm, null, options, null, units).call();
        fm.close();
        if (!ok) { System.err.println("[-] compile failed"); System.exit(1); }
        System.out.println("[+] compile OK");

        Manifest mf = new Manifest();
        mf.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");
        mf.getMainAttributes().put(new Attributes.Name("Premain-Class"), "BurpLoaderAgent");
        mf.getMainAttributes().put(new Attributes.Name("Can-Redefine-Classes"), "true");
        mf.getMainAttributes().put(new Attributes.Name("Can-Retransform-Classes"), "true");
        try (JarOutputStream jos = new JarOutputStream(new FileOutputStream("BurpLoaderAgent.jar"), mf)) {
            for (File f : new File(".").listFiles((d, n) -> n.startsWith("BurpLoaderAgent") && n.endsWith(".class"))) {
                System.out.println("    + " + f.getName());
                JarEntry e = new JarEntry(f.getName());
                jos.putNextEntry(e);
                try (FileInputStream in = new FileInputStream(f)) { in.transferTo(jos); }
                jos.closeEntry();
            }
        }
        System.out.println("[+] BurpLoaderAgent.jar built");
    }
}
