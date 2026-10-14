import type { RipoState } from "@/lib/mascot";

export interface SceneProps {
  playing: boolean;
  onCue?: (state: RipoState) => void;
  onEnded?: () => void;
  label: string;
}
