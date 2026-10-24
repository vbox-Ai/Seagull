export interface DiagnosticItem {
  id: string;
  category: "toolchain" | "mcp" | "sample" | "system";
  name: string;
  status: "pass" | "warn" | "fail" | "checking";
  detail: string;
}
