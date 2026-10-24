// LifecycleTest.cs — 独立验收工装：反射调用 SeepTool.exe 内置的<项目A>授权模块
// 编译: csc /r:SeepTool.exe /out:tools\XYLifecycleTest.exe tools\XYLifecycleTest.cs
using System;
using System.Collections.Generic;
using System.IO;

class LifecycleTest
{
    static void Main(string[] argv)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        string exe = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SeepTool.exe"));
        string dir = argv.Length > 0 ? argv[0] : @"D:\Data\<项目A>";
        string stage = argv.Length > 1 ? argv[1] : "all";

        var asm = System.Reflection.Assembly.LoadFrom(exe);
        var mod = asm.GetType("Seep.Modules.XYplorerModule");
        if (mod == null) { Console.WriteLine("[-] 未找到<项目A>授权模块"); Environment.Exit(2); }

        if (stage == "check" || stage == "all")
        {
            var l = new List<string>();
            string st = (string)mod.GetMethod("CheckState").Invoke(null, new object[] { dir, l });
            foreach (var x in l) Console.WriteLine("    " + x);
            Console.WriteLine("    >>> 状态 = " + st);
        }

        if (stage == "deploy" || stage == "all")
        {
            var l = new List<string>();
            bool ok = (bool)mod.GetMethod("DeployProxy").Invoke(null,
                new object[] { dir, "Seep 授权用户", "license@seep.local", "xy05-Lifetime-License-Pro-Seep-2026", l });
            foreach (var x in l) Console.WriteLine("    " + x);
            Console.WriteLine("    >>> 部署 = " + ok);
            Console.WriteLine("    version.dll = " + File.Exists(Path.Combine(dir, "version.dll")) +
                              " | xyplorer_patch.ini = " + File.Exists(Path.Combine(dir, "xyplorer_patch.ini")));
        }

        if (stage == "revert" || stage == "all")
        {
            var l = new List<string>();
            bool ok = (bool)mod.GetMethod("RemoveProxy").Invoke(null, new object[] { dir, l });
            foreach (var x in l) Console.WriteLine("    " + x);
            Console.WriteLine("    >>> 还原 = " + ok);
        }
    }
}
