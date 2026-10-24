/** 类名拼接，与 PI-Desktop components/ui.tsx 里的 cx 行为一致。 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
