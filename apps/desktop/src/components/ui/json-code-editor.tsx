import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";

import { cn } from "@/lib/utils";

export interface JsonCodeEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  darkMode?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  minHeight?: number;
}

export function JsonCodeEditor({
  value,
  onChange,
  darkMode = false,
  invalid = false,
  disabled = false,
  minHeight = 220,
}: JsonCodeEditorProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-background",
        invalid ? "border-destructive" : "border-input",
        disabled ? "opacity-60" : "",
      )}
    >
      <CodeMirror
        value={value}
        editable={!disabled}
        height={`${minHeight}px`}
        extensions={[json()]}
        theme={darkMode ? oneDark : undefined}
        basicSetup={{
          lineNumbers: true,
          bracketMatching: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          foldGutter: true,
          autocompletion: true,
        }}
        onChange={(nextValue) => onChange(nextValue)}
        className="text-[11px]"
      />
    </div>
  );
}
