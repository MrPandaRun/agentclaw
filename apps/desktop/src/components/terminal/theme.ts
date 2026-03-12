import type { TerminalTheme } from "@/types";

export interface TerminalVisualTheme {
  minimumContrastRatio: number;
  containerBackground: string;
  switchingOverlayBackground: string;
  switchingChipBackground: string;
  switchingChipBorder: string;
  switchingChipText: string;
  hintText: string;
  commandText: string;
  xterm: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const TERMINAL_THEMES: Record<TerminalTheme, TerminalVisualTheme> = {
  dark: {
    minimumContrastRatio: 1,
    containerBackground: "#0f1117",
    switchingOverlayBackground: "rgba(15, 17, 23, 0.96)",
    switchingChipBackground: "rgba(15, 23, 42, 0.9)",
    switchingChipBorder: "rgba(71, 85, 105, 0.8)",
    switchingChipText: "rgba(226, 232, 240, 0.95)",
    hintText: "rgba(148, 163, 184, 0.75)",
    commandText: "rgba(148, 163, 184, 0.85)",
    xterm: {
      background: "#0f1117",
      foreground: "#d6dbe4",
      cursor: "#8ab4f8",
      cursorAccent: "#0f1117",
      selectionBackground: "#334155",
      black: "#1f2937",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e2e8f0",
      brightBlack: "#475569",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#f8fafc",
    },
  },
  light: {
    minimumContrastRatio: 4.5,
    containerBackground: "#ffffff",
    switchingOverlayBackground: "rgba(255, 255, 255, 0.95)",
    switchingChipBackground: "rgba(255, 255, 255, 0.96)",
    switchingChipBorder: "rgba(145, 145, 145, 0.5)",
    switchingChipText: "rgba(15, 23, 42, 0.92)",
    hintText: "rgba(31, 41, 55, 0.68)",
    commandText: "rgba(17, 24, 39, 0.88)",
    xterm: {
      background: "#ffffff",
      foreground: "#000000",
      cursor: "#919191",
      cursorAccent: "#ffffff",
      selectionBackground: "#e5ecf1",
      black: "#000000",
      red: "#b45648",
      green: "#6caa71",
      yellow: "#c4ac62",
      blue: "#5685a8",
      magenta: "#ad64be",
      cyan: "#69c6c9",
      white: "#c1c8cc",
      brightBlack: "#666666",
      brightRed: "#df6c5a",
      brightGreen: "#79be7e",
      brightYellow: "#e5c872",
      brightBlue: "#49a2e1",
      brightMagenta: "#d389e5",
      brightCyan: "#77e1e5",
      brightWhite: "#d8e1e7",
    },
  },
};

export const BRUTALISM_TERMINAL_THEMES: Record<TerminalTheme, TerminalVisualTheme> = {
  dark: {
    minimumContrastRatio: 7,
    containerBackground: "#0d0d0d",
    switchingOverlayBackground: "rgba(13, 13, 13, 0.98)",
    switchingChipBackground: "#1a1a1a",
    switchingChipBorder: "#e5e5e5",
    switchingChipText: "#f5f5f5",
    hintText: "#737373",
    commandText: "#f5f5f5",
    xterm: {
      background: "#0d0d0d",
      foreground: "#f5f5f5",
      cursor: "#ffcc00",
      cursorAccent: "#0d0d0d",
      selectionBackground: "#ffcc00",
      black: "#0d0d0d",
      red: "#ff0000",
      green: "#00ff00",
      yellow: "#ffcc00",
      blue: "#0066ff",
      magenta: "#ff00ff",
      cyan: "#00ffff",
      white: "#e5e5e5",
      brightBlack: "#4d4d4d",
      brightRed: "#ff6666",
      brightGreen: "#66ff66",
      brightYellow: "#ffdd55",
      brightBlue: "#6699ff",
      brightMagenta: "#ff66ff",
      brightCyan: "#66ffff",
      brightWhite: "#ffffff",
    },
  },
  light: {
    minimumContrastRatio: 7,
    containerBackground: "#fafaf8",
    switchingOverlayBackground: "rgba(250, 250, 248, 0.98)",
    switchingChipBackground: "#ffffff",
    switchingChipBorder: "#0d0d0d",
    switchingChipText: "#0d0d0d",
    hintText: "#525252",
    commandText: "#0d0d0d",
    xterm: {
      background: "#fafaf8",
      foreground: "#0d0d0d",
      cursor: "#ffcc00",
      cursorAccent: "#0d0d0d",
      selectionBackground: "#ffcc00",
      black: "#0d0d0d",
      red: "#cc0000",
      green: "#008800",
      yellow: "#cc9900",
      blue: "#0055cc",
      magenta: "#cc00cc",
      cyan: "#008888",
      white: "#e5e5e5",
      brightBlack: "#666666",
      brightRed: "#ff3333",
      brightGreen: "#33bb33",
      brightYellow: "#ffcc00",
      brightBlue: "#3388ff",
      brightMagenta: "#ff33ff",
      brightCyan: "#33cccc",
      brightWhite: "#ffffff",
    },
  },
};

export const CYBERPUNK_TERMINAL_THEMES: Record<TerminalTheme, TerminalVisualTheme> = {
  dark: {
    minimumContrastRatio: 4.5,
    containerBackground: "#0a0a12",
    switchingOverlayBackground: "rgba(10, 10, 18, 0.95)",
    switchingChipBackground: "#12121f",
    switchingChipBorder: "#00fff2",
    switchingChipText: "#00fff2",
    hintText: "#7b68ee",
    commandText: "#00fff2",
    xterm: {
      background: "#0a0a12",
      foreground: "#e0e0ff",
      cursor: "#ff00ff",
      cursorAccent: "#0a0a12",
      selectionBackground: "#ff00ff44",
      black: "#0a0a12",
      red: "#ff0055",
      green: "#00ff88",
      yellow: "#fcee0a",
      blue: "#00fff2",
      magenta: "#bf00ff",
      cyan: "#00fff2",
      white: "#e0e0ff",
      brightBlack: "#4a4a6a",
      brightRed: "#ff3377",
      brightGreen: "#33ffaa",
      brightYellow: "#ffee55",
      brightBlue: "#55ffff",
      brightMagenta: "#dd55ff",
      brightCyan: "#55ffff",
      brightWhite: "#ffffff",
    },
  },
  light: {
    minimumContrastRatio: 4.5,
    containerBackground: "#f0f0ff",
    switchingOverlayBackground: "rgba(240, 240, 255, 0.95)",
    switchingChipBackground: "#ffffff",
    switchingChipBorder: "#9d00ff",
    switchingChipText: "#1a0a2e",
    hintText: "#6a5acd",
    commandText: "#1a0a2e",
    xterm: {
      background: "#f0f0ff",
      foreground: "#1a0a2e",
      cursor: "#bf00ff",
      cursorAccent: "#f0f0ff",
      selectionBackground: "#bf00ff44",
      black: "#1a0a2e",
      red: "#cc0044",
      green: "#00aa55",
      yellow: "#ccaa00",
      blue: "#0066cc",
      magenta: "#9900cc",
      cyan: "#0088aa",
      white: "#d0d0e8",
      brightBlack: "#5a5a7a",
      brightRed: "#ee3366",
      brightGreen: "#33cc77",
      brightYellow: "#eedd33",
      brightBlue: "#3399ee",
      brightMagenta: "#bb44ee",
      brightCyan: "#33bbee",
      brightWhite: "#ffffff",
    },
  },
};
