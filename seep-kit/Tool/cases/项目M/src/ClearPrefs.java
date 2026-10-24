import java.util.prefs.Preferences;
public class ClearPrefs {
    public static void main(String[] a) throws Exception {
        Preferences p = Preferences.userNodeForPackage(Class.forName("burp.StartBurp"));
        p.remove("license1"); p.remove("burp.eula");
        p.remove("expired_license"); p.remove("use_community_edition");
        p.flush();
        System.out.println("prefs cleared: license1=" + p.get("license1", null) + " burp.eula=" + p.get("burp.eula", null));
    }
}
