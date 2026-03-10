export const SOPHON_HEADER_EXTENSION_SOURCE = String.raw`import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

function buildSophonHeader(theme: Theme): string[] {
  const accent = (text: string) => theme.bold(theme.fg("accent", text));
  const muted = (text: string) => theme.fg("dim", text);

  const logo = [
    "   _____ ",
    "  / ___/ ",
    "  \\__ \\  ",
    " ___/ /  ",
    "/____/   ",
  ];

  const meta = [
    accent("sophon"),
    muted("enter send"),
    muted("shift+enter newline"),
    muted("/ commands"),
    muted("shift+tab switch"),
  ];

  return logo.map((line, index) => (accent(line) + " " + (meta[index] ?? "")).trimEnd());
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    ctx.ui.setHeader((_tui, theme) => ({
      render(_width: number): string[] {
        return buildSophonHeader(theme);
      },
      invalidate() {},
    }));
  });
}
`;
