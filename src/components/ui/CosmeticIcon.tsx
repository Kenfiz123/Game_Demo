import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Frame, Image, MessageCircleHeart, Sparkles, Tag, WandSparkles, Shield, CircleUserRound } from "lucide-react";
import type { CosmeticType } from "@/types/gamification";

const ICONS: Record<CosmeticType, LucideIcon> = {
  FRAME: Frame,
  BACKGROUND: Image,
  TITLE: Tag,
  BADGE: BadgeCheck,
  NAMEPLATE: Sparkles,
  EFFECT: WandSparkles,
  EMOTE: MessageCircleHeart,
  LOGO: Shield,
  AVATAR: CircleUserRound,
};

interface CosmeticIconProps {
  type: CosmeticType;
  className?: string;
}

export function CosmeticIcon({ type, className }: CosmeticIconProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden="true" className={className} />;
}

export const cosmeticTypeLabels: Record<CosmeticType, string> = {
  FRAME: "Avatar Frame",
  BACKGROUND: "Profile Background",
  TITLE: "Title",
  BADGE: "Badge",
  NAMEPLATE: "Nameplate",
  EFFECT: "Profile Effect",
  EMOTE: "Emote",
  LOGO: "Logo CLB",
  AVATAR: "Avatar CLB",
};
