import { useState } from "react";
import { Root, Trigger, Content } from "@radix-ui/react-popover";

const EMOJI_LIST = [
  "👍", "❤️", "😂", "🎉", "🔥", "😊", "🚀", "💯",
  "👀", "🙏", "✨", "💪", "🤣", "😍", "🎊", "😎",
  "✅", "❌", "⭐", "👏", "💡", "📌", "🤔", "🥳",
  "😢", "💀", "🤝", "🗿", "👋", "🙌", "🫡", "💅",
];

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  children: React.ReactNode;
}

export function EmojiPicker({ onEmojiSelect, children }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger asChild>{children}</Trigger>
      <Content
        side="top"
        align="start"
        className="z-50 bg-popover border border-border rounded-lg shadow-xl p-2 w-[280px]"
      >
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-sidebar-hover text-lg transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Content>
    </Root>
  );
}
